import { Promisable } from '@anabranch/anabranch'
import { EventLogConsumeFailed } from './errors.ts'

/**
 * A single event in the event log.
 */
export interface Event<T = unknown> {
  /** Unique identifier for this event. */
  id: string
  /** The topic this event belongs to. */
  topic: string
  /** The event data payload. */
  data: T
  /** Partition key for ordering guarantees. */
  partitionKey: string
  /** Monotonically increasing sequence number within the topic. Represented as a string to support bigint while remaining serializable. */
  sequenceNumber: string
  /** Unix timestamp in milliseconds when the event was created. */
  timestamp: number
  /** Optional metadata associated with the event. */
  metadata?: Record<string, unknown>
}

/**
 * A batch of events delivered to a consumer.
 */
export interface EventBatch<T = unknown, Cursor = string> {
  /** The topic this batch was received from. */
  topic: string
  /** The consumer group that received this batch. */
  consumerGroup: string
  /** Events in this batch. */
  events: Event<T>[]
  /** Cursor representing the position after this batch. Use for manual commits. */
  cursor: Cursor
  /**
   * Commit this batch's cursor to mark progress.
   *
   * After processing events successfully, call this to save the cursor position.
   * On restart, the consumer will resume from this position.
   */
  commit(): Promise<void>
}

/**
 * Low-level adapter interface for event log implementations.
 *
 * Adapters handle the actual communication with the underlying event store
 * (in-memory, Kafka, etc.). Use connectors to create adapter instances.
 */
export interface EventLogAdapter<Cursor = string> {
  /**
   * Append an event to a topic.
   */
  append<T>(
    topic: string,
    data: T,
    options?: AppendOptions,
  ): Promise<string>

  /**
   * Consume events from a topic.
   */
  consume<T>(
    topic: string,
    consumerGroup: string,
    onBatch: (batch: EventBatch<T, Cursor>) => Promisable<void>,
    onError: (error: EventLogConsumeFailed) => Promisable<void>,
    options?: ConsumeOptions<Cursor>,
  ): { close: () => Promise<void> }

  /**
   * Get the last committed cursor for a consumer group.
   */
  getCursor(
    topic: string,
    consumerGroup: string,
  ): Promise<Cursor | null>

  /**
   * Commit a cursor for a consumer group.
   */
  commitCursor(
    topic: string,
    consumerGroup: string,
    cursor: Cursor,
  ): Promise<void>

  /** Close the adapter and release resources. */
  close(): Promise<void>
}

/** Options for appending events. */
export interface AppendOptions {
  /** Key for partitioning and ordering. Events with the same key are ordered. */
  partitionKey?: string
  /** Custom metadata to attach to the event. */
  metadata?: Record<string, unknown>
  /** Custom timestamp in milliseconds. Defaults to Date.now(). */
  timestamp?: number
}

/** Options for consuming events. */
export interface ConsumeOptions<Cursor = string> {
  /** Abort signal to cancel consumption. */
  signal?: AbortSignal
  /** Cursor to resume from. If null, starts from the beginning. */
  cursor?: Cursor | null
  /** Maximum number of events per batch. Defaults to adapter-specific value. */
  batchSize?: number
  /** Maximum number of batches to buffer. Defaults to adapter-specific value.
   * When the buffer is full, new batches will be dropped and onError will be called with an EventLogConsumeFailed error.
   * @default Infinity
   */
  bufferSize?: number
}

/**
 * Factory for creating event log connections.
 *
 * Connectors manage connection lifecycle and produce adapter instances.
 * Use connectors in production code to properly manage resources.
 */
export interface EventLogConnector<Cursor = string> {
  /**
   * Connect to the event log.
   */
  connect(signal?: AbortSignal): Promise<EventLogAdapter<Cursor>>

  /**
   * End the connector and release all resources.
   *
   * After calling end(), all adapters created by this connector become
   * invalid and subsequent connect() calls will fail.
   */
  end(): Promise<void>
}

/** Configuration options for event log implementations. */
export interface EventLogOptions {
  /** Default partition key for events without explicit keys. */
  defaultPartitionKey?: string
}
