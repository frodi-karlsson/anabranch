import { Promisable } from '@anabranch/anabranch'
import type {
  AppendOptions,
  ConsumeOptions,
  Event,
  EventBatch,
  EventLogAdapter,
  EventLogConnector,
  EventLogOptions,
} from './adapter.ts'
import {
  EventLogAppendFailed,
  EventLogCommitCursorFailed,
  EventLogConnectionFailed,
  EventLogConsumeFailed,
  EventLogGetCursorFailed,
} from './errors.ts'

interface TopicState {
  events: Event<unknown>[]
  nextSequenceNumber: number
}

interface ConsumerState {
  cursors: Map<string, string>
}

function generateId(): string {
  return crypto.randomUUID()
}

export function createInMemory(options?: InMemoryOptions): InMemoryConnector {
  const topics = new Map<string, TopicState>()
  const consumerGroups = new Map<string, ConsumerState>()
  const listeners = new Set<{
    topic: string
    push: () => void
  }>()

  let ended = false
  const defaultOptions: Required<EventLogOptions> = {
    defaultPartitionKey: 'default',
  }

  const opts = {
    ...defaultOptions,
    ...options,
  }

  const getOrCreateTopic = (topic: string): TopicState => {
    let state = topics.get(topic)
    if (!state) {
      state = {
        events: [],
        nextSequenceNumber: 0,
      }
      topics.set(topic, state)
    }
    return state
  }

  const createAdapter = (): EventLogAdapter => {
    let closed = false

    return {
      append<T>(
        topic: string,
        data: T,
        appendOptions?: AppendOptions,
      ): Promise<string> {
        if (ended) {
          return Promise.reject(
            new EventLogAppendFailed(topic, 'Connector ended'),
          )
        }
        if (closed) {
          return Promise.reject(
            new EventLogAppendFailed(topic, 'Adapter closed'),
          )
        }

        const state = getOrCreateTopic(topic)
        const id = generateId()
        const sequenceNumber = state.nextSequenceNumber++
        const partitionKey = appendOptions?.partitionKey ??
          opts.defaultPartitionKey

        const event: Event<T> = {
          id,
          topic,
          data,
          partitionKey,
          sequenceNumber: String(sequenceNumber),
          timestamp: appendOptions?.timestamp ?? Date.now(),
          metadata: appendOptions?.metadata,
        }

        state.events.push(event)

        for (const listener of listeners) {
          if (listener.topic === topic) {
            listener.push()
          }
        }

        return Promise.resolve(id)
      },

      consume<T>(
        topic: string,
        consumerGroup: string,
        onBatch: (batch: EventBatch<T, string>) => Promisable<void>,
        onError: (error: EventLogConsumeFailed) => Promisable<void>,
        consumeOptions?: ConsumeOptions,
      ): { close: () => Promise<void> } {
        if (ended) {
          throw new EventLogConsumeFailed(topic, 'Connector ended')
        }
        if (closed) {
          throw new EventLogConsumeFailed(topic, 'Adapter closed')
        }

        let consumerState = consumerGroups.get(consumerGroup)
        if (!consumerState) {
          consumerState = { cursors: new Map() }
          consumerGroups.set(consumerGroup, consumerState)
        }

        const batchSize = consumeOptions?.batchSize ?? 10
        const signal = consumeOptions?.signal
        let currentSequence = consumeOptions?.cursor
          ? parseInt(consumeOptions.cursor, 10) + 1
          : 0

        let consumerClosed = false

        const drive = async (): Promise<void> => {
          if (consumerClosed || closed || ended) return

          const state = topics.get(topic)
          if (!state) return

          const events: Event<T>[] = []
          while (
            events.length < batchSize && currentSequence < state.events.length
          ) {
            events.push(state.events[currentSequence] as Event<T>)
            currentSequence++
          }

          if (events.length > 0) {
            try {
              const cursor = String(currentSequence - 1)
              await onBatch({
                topic,
                consumerGroup,
                events,
                cursor,
                commit: (): Promise<void> => {
                  if (ended || closed) {
                    throw new EventLogCommitCursorFailed(
                      topic,
                      consumerGroup,
                      ended ? 'Connector ended' : 'Adapter closed',
                    )
                  }
                  consumerState!.cursors.set(topic, cursor)
                  return Promise.resolve()
                },
              })

              if (
                currentSequence < state.events.length &&
                !consumerClosed &&
                !closed &&
                !ended
              ) {
                void drive()
              }
            } catch (error) {
              await onError(
                new EventLogConsumeFailed(
                  topic,
                  error instanceof Error ? error.message : String(error),
                  error,
                ),
              )
            }
          }
        }

        const listener = { topic, push: drive }
        listeners.add(listener)

        drive()

        const closeConsumer = (): Promise<void> => {
          if (consumerClosed) return Promise.resolve()
          consumerClosed = true
          listeners.delete(listener)
          return Promise.resolve()
        }

        signal?.addEventListener('abort', closeConsumer, { once: true })

        return { close: closeConsumer }
      },

      getCursor(
        topic: string,
        consumerGroup: string,
      ): Promise<string | null> {
        if (ended) {
          return Promise.reject(
            new EventLogGetCursorFailed(
              topic,
              consumerGroup,
              'Connector ended',
            ),
          )
        }
        if (closed) {
          return Promise.reject(
            new EventLogGetCursorFailed(
              topic,
              consumerGroup,
              'Adapter closed',
            ),
          )
        }

        const state = consumerGroups.get(consumerGroup)
        if (!state) {
          return Promise.resolve(null)
        }

        return Promise.resolve(state.cursors.get(topic) ?? null)
      },

      commitCursor(
        topic: string,
        consumerGroup: string,
        cursor: string,
      ): Promise<void> {
        if (ended) {
          return Promise.reject(
            new EventLogCommitCursorFailed(
              topic,
              consumerGroup,
              'Connector ended',
            ),
          )
        }
        if (closed) {
          return Promise.reject(
            new EventLogCommitCursorFailed(
              topic,
              consumerGroup,
              'Adapter closed',
            ),
          )
        }

        let consumerState = consumerGroups.get(consumerGroup)
        if (!consumerState) {
          consumerState = { cursors: new Map() }
          consumerGroups.set(consumerGroup, consumerState)
        }

        consumerState.cursors.set(topic, cursor)
        return Promise.resolve()
      },

      close(): Promise<void> {
        if (closed) return Promise.resolve()
        closed = true
        return Promise.resolve()
      },
    }
  }

  return {
    connect(): Promise<EventLogAdapter> {
      if (ended) {
        return Promise.reject(
          new EventLogConnectionFailed('Connector ended'),
        )
      }
      return Promise.resolve(createAdapter())
    },

    end(): Promise<void> {
      ended = true
      topics.clear()
      consumerGroups.clear()
      listeners.clear()
      return Promise.resolve()
    },
  }
}

/** Configuration options for in-memory event log. */
export interface InMemoryOptions extends EventLogOptions {}

/**
 * Creates an in-memory event log connector for testing and development.
 *
 * Events are stored in memory and lost when the process exits. Ideal for
 * unit tests, prototyping, and development environments.
 *
 * @example Basic usage
 * ```ts
 * import { EventLog, createInMemory } from "@anabranch/eventlog";
 *
 * const connector = createInMemory();
 * const log = await EventLog.connect(connector).run();
 *
 * await log.append("users", { userId: 123 }).run();
 *
 * // After testing, clean up
 * await connector.end();
 * ```
 *
 * @example With custom partition key
 * ```ts
 * const connector = createInMemory({
 *   defaultPartitionKey: "user-events",
 * });
 * ```
 */
export interface InMemoryConnector extends EventLogConnector {
  connect(): Promise<EventLogAdapter>
  end(): Promise<void>
}
