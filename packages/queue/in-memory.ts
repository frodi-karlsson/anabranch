import type {
  NackOptions,
  QueueAdapter,
  QueueConnector,
  QueueMessage,
  QueueOptions,
  SendOptions,
} from './adapter.ts'
import {
  QueueBufferFull,
  QueueNackFailed,
  QueueReceiveFailed,
  QueueSendFailed,
} from './errors.ts'

interface InflightMessage<T> {
  msg: QueueMessage<T>
  deliveredAt: number
}

interface InMemoryQueue<T> {
  messages: QueueMessage<T>[]
  delayed: Map<number, QueueMessage<T>[]>
  inflight: Map<string, InflightMessage<T>>
  options: Required<QueueOptions>
}

interface DlqMessage {
  originalId: string
  originalQueue: string
  data: unknown
  attempt: number
  timestamp: number
}

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Creates an in-memory queue connector using a simple message store.
 *
 * Messages are stored in memory only and will be lost on process restart.
 * Uses bucketed priority queues for delayed message support.
 *
 * @example Basic usage
 * ```ts
 * import { Queue, createInMemory } from "@anabranch/queue";
 *
 * const connector = createInMemory();
 * const queue = await Queue.connect(connector).run();
 *
 * // Send a message
 * await queue.send("notifications", { type: "welcome", userId: 123 }).run();
 *
 * // Receive messages
 * const { successes } = await queue
 *   .stream("notifications", { count: 10 })
 *   .map(async (msg) => await processNotification(msg.data))
 *   .partition();
 * ```
 *
 * @example With delayed messages
 * ```ts
 * await queue.send("notifications", reminder, { delayMs: 30_000 }).run();
 * ```
 *
 * @example With dead letter queue
 * ```ts
 * const connector = createInMemory({
 *   queues: {
 *     orders: {
 *       maxAttempts: 3,
 *       deadLetterQueue: "orders-failed",
 *     },
 *   },
 * });
 * const queue = await Queue.connect(connector).run();
 * ```
 */
export function createInMemory(options?: InMemoryOptions): InMemoryConnector {
  const queues = new Map<string, InMemoryQueue<unknown>>()
  const timerIds = new Set<ReturnType<typeof setTimeout>>()
  let ended = false
  const defaultOptions: Required<QueueOptions> = {
    maxAttempts: 3,
    visibilityTimeout: 30000,
    deadLetterQueue: '',
    deadLetterOptions: {
      maxAttempts: 1,
      delay: 0,
    },
  }

  const queueConfigs = options?.queues ?? {}
  const maxBufferSize = options?.maxBufferSize ?? Infinity
  const onDrop = options?.onDrop

  return {
    connect(): Promise<QueueAdapter> {
      let adapterRef: QueueAdapter | undefined = undefined

      const routeToDlq = <T>(
        queue: InMemoryQueue<T>,
        message: QueueMessage<T>,
      ): void => {
        const dlqName = queue.options.deadLetterQueue
        if (dlqName && adapterRef) {
          adapterRef.send(dlqName, {
            originalId: message.id,
            originalQueue: 'source',
            data: message.data,
            attempt: message.attempt,
            timestamp: message.timestamp,
          } as DlqMessage).catch((err) => {
            onDrop?.({ message, error: err })
          })
        }
      }

      const findMessage = <T>(
        queue: InMemoryQueue<T>,
        id: string,
      ): QueueMessage<T> | undefined => {
        return (
          queue.messages.find((m) => m.id === id) ??
            queue.inflight.get(id)?.msg ??
            Array.from(queue.delayed.values())
              .flat()
              .find((m) => m.id === id)
        )
      }

      /**
       * Routes to DLQ when attempt > maxAttempts (not >=).
       * A message with maxAttempts=2 will be delivered 2x before DLQ.
       */
      const handleNack = <T>(
        queue: InMemoryQueue<T>,
        id: string,
        nackOptions?: NackOptions,
      ): Promise<void> => {
        const existing = findMessage(queue, id)
        if (!existing) {
          return Promise.reject(
            new QueueNackFailed(
              'Message not found',
              queue.options.deadLetterQueue ?? '',
              id,
            ),
          )
        }

        if (nackOptions?.deadLetter) {
          routeToDlq(
            queue,
            existing ??
              {
                id,
                data: null,
                attempt: 1,
                timestamp: Date.now(),
              },
          )
          return Promise.resolve()
        }

        if (nackOptions?.requeue) {
          queue.inflight.delete(id)
          const attempt = existing ? existing.attempt + 1 : 2

          if (attempt > queue.options.maxAttempts) {
            routeToDlq(queue, {
              id,
              data: existing.data,
              attempt,
              timestamp: Date.now(),
            })
            return Promise.resolve()
          }

          const message: QueueMessage<T> = {
            id,
            data: existing.data,
            attempt,
            timestamp: Date.now(),
          }

          const delay = nackOptions.delay ?? 0
          if (delay > 0) {
            const bucket = Math.ceil((Date.now() + delay) / 1000)
            if (!queue.delayed.has(bucket)) {
              queue.delayed.set(bucket, [])
            }
            queue.delayed.get(bucket)!.push(message)
            scheduleDelayedProcessingInner(queue)
          } else {
            queue.messages.push(message)
          }
          return Promise.resolve()
        }

        return Promise.resolve()
      }

      const adapter: QueueAdapter = {
        send<T>(
          queueName: string,
          data: T,
          sendOptions?: SendOptions,
        ): Promise<string> {
          if (ended) {
            return Promise.reject(
              new QueueSendFailed('Connector ended', queueName),
            )
          }

          let queue = queues.get(queueName)

          if (!queue) {
            const config = queueConfigs[queueName] ?? {}
            queue = {
              messages: [],
              delayed: new Map(),
              inflight: new Map(),
              options: {
                ...defaultOptions,
                ...config,
                deadLetterQueue: config.deadLetterQueue ?? '',
                deadLetterOptions: {
                  ...defaultOptions.deadLetterOptions,
                  ...config.deadLetterOptions,
                },
              },
            }
            queues.set(queueName, queue)
          }

          const id = generateId()
          const delayMs = sendOptions?.delayMs ??
            (sendOptions?.scheduledAt
              ? Math.max(0, sendOptions.scheduledAt.getTime() - Date.now())
              : 0)

          const message: QueueMessage<T> = {
            id,
            data,
            attempt: 1,
            timestamp: Date.now(),
            metadata: sendOptions?.headers
              ? { headers: sendOptions.headers }
              : undefined,
          }

          if (delayMs > 0) {
            const bucket = Math.ceil((Date.now() + delayMs) / 1000)
            if (!queue.delayed.has(bucket)) {
              queue.delayed.set(bucket, [])
            }
            queue.delayed.get(bucket)!.push(message)
            scheduleDelayedProcessingInner(queue)
          } else {
            if (queue.messages.length >= maxBufferSize) {
              if (maxBufferSize !== Infinity) {
                onDrop?.(message)
              }
              return Promise.reject(new QueueBufferFull(queueName))
            }
            queue.messages.push(message)
          }

          return Promise.resolve(id)
        },

        sendBatch<T>(
          queueName: string,
          data: T[],
          sendOptions?: SendOptions,
        ): Promise<string[]> {
          if (ended) {
            return Promise.reject(
              new QueueSendFailed('Connector ended', queueName),
            )
          }

          const ids: string[] = []
          for (const _item of data) {
            // We can reuse the send logic here for simplicity in the memory adapter
            // since there's no network overhead to optimize away.
            ids.push(generateId())
          }

          let queue = queues.get(queueName)
          if (!queue) {
            const config = queueConfigs[queueName] ?? {}
            queue = {
              messages: [],
              delayed: new Map(),
              inflight: new Map(),
              options: {
                ...defaultOptions,
                ...config,
                deadLetterQueue: config.deadLetterQueue ?? '',
                deadLetterOptions: {
                  ...defaultOptions.deadLetterOptions,
                  ...config.deadLetterOptions,
                },
              },
            }
            queues.set(queueName, queue)
          }

          const delayMs = sendOptions?.delayMs ??
            (sendOptions?.scheduledAt
              ? Math.max(0, sendOptions.scheduledAt.getTime() - Date.now())
              : 0)

          const timestamp = Date.now()
          const metadata = sendOptions?.headers
            ? { headers: sendOptions.headers }
            : undefined

          for (let i = 0; i < data.length; i++) {
            const message: QueueMessage<T> = {
              id: ids[i],
              data: data[i],
              attempt: 1,
              timestamp,
              metadata,
            }

            if (delayMs > 0) {
              const bucket = Math.ceil((Date.now() + delayMs) / 1000)
              if (!queue.delayed.has(bucket)) {
                queue.delayed.set(bucket, [])
              }
              queue.delayed.get(bucket)!.push(message)
              scheduleDelayedProcessingInner(queue)
            } else {
              if (queue.messages.length >= maxBufferSize) {
                if (maxBufferSize !== Infinity) {
                  onDrop?.(message)
                }
                // If we fail mid-batch, we've already pushed some.
                // For memory adapter this is fine as it's not transactional.
                return Promise.reject(new QueueBufferFull(queueName))
              }
              queue.messages.push(message)
            }
          }

          return Promise.resolve(ids)
        },

        receive<T>(
          queueName: string,
          count?: number,
        ): Promise<QueueMessage<T>[]> {
          if (ended) {
            return Promise.reject(
              new QueueReceiveFailed('Connector ended', queueName),
            )
          }

          const queue = queues.get(queueName) as InMemoryQueue<T> | undefined
          if (!queue) {
            return Promise.resolve([])
          }

          promoteDelayedMessagesInner(queue)
          expireVisibleMessages(queue)

          const messages: QueueMessage<T>[] = []
          const toReceive = count ?? 10
          const now = Date.now()
          while (messages.length < toReceive && queue.messages.length > 0) {
            const msg = queue.messages.shift()
            if (msg) {
              messages.push(msg)
              queue.inflight.set(msg.id, { msg, deliveredAt: now })
            }
          }
          return Promise.resolve(messages)
        },

        ack(queueName: string, ...ids: string[]): Promise<void> {
          if (ended) {
            return Promise.reject(
              new QueueSendFailed('Connector ended', queueName),
            )
          }

          const queue = queues.get(queueName)
          if (!queue) return Promise.resolve()

          let anyFoundInMessages = false
          for (const id of ids) {
            if (queue.inflight.has(id)) {
              queue.inflight.delete(id)
            } else {
              anyFoundInMessages = true
            }
          }

          if (anyFoundInMessages) {
            queue.messages = queue.messages.filter((m) => !ids.includes(m.id))
          }
          return Promise.resolve()
        },

        nack<T>(
          queueName: string,
          id: string,
          nackOptions?: NackOptions,
        ): Promise<void> {
          if (ended) {
            return Promise.reject(
              new QueueSendFailed('Connector ended', queueName),
            )
          }

          const queue = queues.get(queueName) as InMemoryQueue<T> | undefined
          if (!queue) return Promise.resolve()
          return handleNack(queue, id, nackOptions)
        },

        close(): Promise<void> {
          return Promise.resolve()
        },
      }

      adapterRef = adapter

      const promoteDelayedMessagesInner = <T>(
        queue: InMemoryQueue<T>,
      ): void => {
        const now = Math.ceil(Date.now() / 1000)
        for (const [bucket, messages] of queue.delayed) {
          if (bucket <= now) {
            queue.messages.push(...messages)
            queue.delayed.delete(bucket)
          }
        }
      }

      const scheduleDelayedProcessingInner = <T>(
        queue: InMemoryQueue<T>,
      ): void => {
        if (queue.delayed.size === 0) return

        const nextBucket = Math.min(...queue.delayed.keys())
        const delay = Math.max(0, nextBucket * 1000 - Date.now())

        const timerId = setTimeout(() => {
          timerIds.delete(timerId)
          promoteDelayedMessagesInner(queue)
          if (queue.delayed.size > 0) {
            scheduleDelayedProcessingInner(queue)
          }
        }, Math.max(delay, 10))
        timerIds.add(timerId)
      }

      return Promise.resolve(adapter)
    },

    end(): Promise<void> {
      ended = true
      for (const timerId of timerIds) {
        clearTimeout(timerId)
      }
      timerIds.clear()
      for (const queue of queues.values()) {
        queue.messages = []
        queue.delayed.clear()
        queue.inflight.clear()
      }
      queues.clear()
      return Promise.resolve()
    },
  }
}

const checkVisibilityTimeout = <T>(queue: InMemoryQueue<T>): void => {
  const now = Date.now()
  const timeout = queue.options.visibilityTimeout

  for (const [id, entry] of queue.inflight) {
    if (entry.deliveredAt + timeout <= now) {
      queue.inflight.delete(id)
      queue.messages.push(entry.msg)
    }
  }
}

function expireVisibleMessages<T>(queue: InMemoryQueue<T>): void {
  checkVisibilityTimeout(queue)
}

/** In-memory queue connector options. */
export interface InMemoryOptions {
  /** Maximum buffer size per queue (enforces backpressure) */
  maxBufferSize?: number
  /** Callback when a message is dropped due to buffer overflow */
  onDrop?: (value: unknown) => void
  /** Per-queue configuration */
  queues?: Record<string, QueueOptions>
}

/** In-memory queue connector. */
export interface InMemoryConnector extends QueueConnector {
  connect(): Promise<QueueAdapter>
  end(): Promise<void>
}
