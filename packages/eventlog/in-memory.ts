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

/**
 * Creates an in-memory event log connector using a simple event store.
 *
 * Events are stored in memory only and will be lost on process restart.
 * Useful for testing and development.
 *
 * @example Basic usage
 * ```ts
 * import { EventLog, createInMemory } from "@anabranch/eventlog";
 *
 * const connector = createInMemory();
 * const log = await EventLog.connect(connector).run();
 *
 * // Append an event
 * const eventId = await log.append("users", { action: "created", userId: 123 }).run();
 * ```
 *
 * @example With partition key
 * ```ts
 * await log.append("orders", { orderId: 456, total: 99.99 }, {
 *   partitionKey: "user-123"
 * }).run();
 * ```
 *
 * @example Consuming events
 * ```ts
 * const connector = createInMemory();
 * const log = await EventLog.connect(connector).run();
 *
 * // Append some events first
 * await log.append("notifications", { type: "email" }).run();
 * await log.append("notifications", { type: "sms" }).run();
 *
 * // Consume events
 * for await (const batch of log.consume("notifications", "my-consumer-group")) {
 *   for (const event of batch.events) {
 *     console.log(event.data);
 *   }
 * }
 * ```
 */
export function createInMemory(options?: InMemoryOptions): InMemoryConnector {
  const topics = new Map<string, TopicState>()
  const consumerGroups = new Map<string, ConsumerState>()
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

  const adapter: EventLogAdapter = {
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
        sequenceNumber,
        timestamp: appendOptions?.timestamp ?? Date.now(),
        metadata: appendOptions?.metadata,
      }

      state.events.push(event)
      return Promise.resolve(id)
    },

    async *consume<T>(
      topic: string,
      consumerGroup: string,
      consumeOptions?: ConsumeOptions,
    ): AsyncIterable<EventBatch<T>> {
      if (ended) {
        throw new Error('Connector ended')
      }

      let state = topics.get(topic)
      if (!state) {
        state = {
          events: [],
          nextSequenceNumber: 0,
        }
        topics.set(topic, state)
      }

      let consumerState = consumerGroups.get(consumerGroup)
      if (!consumerState) {
        consumerState = { cursors: new Map() }
        consumerGroups.set(consumerGroup, consumerState)
      }

      const batchSize = consumeOptions?.batchSize ?? 10
      const startSequence = consumeOptions?.cursor
        ? parseInt(consumeOptions.cursor, 10) + 1
        : 0

      const signal = consumeOptions?.signal
      let currentSequence = startSequence

      while (!signal?.aborted) {
        const events: Event<T>[] = []

        for (let i = 0; i < batchSize; i++) {
          const event = state.events[currentSequence] as Event<T> | undefined
          if (!event) break
          events.push(event)
          currentSequence++
        }

        if (events.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          continue
        }

        const cursor = String(currentSequence - 1)

        yield {
          topic,
          consumerGroup,
          events,
          cursor,
        }
      }
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

      let state = consumerGroups.get(consumerGroup)
      if (!state) {
        state = { cursors: new Map() }
        consumerGroups.set(consumerGroup, state)
      }

      state.cursors.set(topic, cursor)
      return Promise.resolve()
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

      const state = consumerGroups.get(consumerGroup)
      if (!state) {
        return Promise.resolve(null)
      }

      return Promise.resolve(state.cursors.get(topic) ?? null)
    },

    close(): Promise<void> {
      return Promise.resolve()
    },
  }

  return {
    connect(): Promise<EventLogAdapter> {
      if (ended) {
        return Promise.reject(new Error('Connector ended'))
      }
      return Promise.resolve(adapter)
    },

    end(): Promise<void> {
      ended = true
      topics.clear()
      consumerGroups.clear()
      return Promise.resolve()
    },
  }
}

/** In-memory event log connector options. */
export interface InMemoryOptions extends EventLogOptions {}

/** In-memory event log connector. */
export interface InMemoryConnector extends EventLogConnector {
  connect(): Promise<EventLogAdapter>
  end(): Promise<void>
}
