/**
 * Event log adapter interface for event-sourced systems.
 *
 * Implement this interface to create drivers for specific event stores.
 * The EventLog class wraps adapters with Task/Stream semantics.
 *
 * For connection lifecycle management, use EventLogConnector which produces adapters.
 * The adapter's close() method releases the connection rather than terminating it.
 */

/** A single event in the log. */
export interface Event<T = unknown> {
  /** Unique event identifier (globally unique) */
  id: string;
  /** Topic/stream this event belongs to */
  topic: string;
  /** Event payload */
  data: T;
  /** Partition key for ordering guarantees */
  partitionKey: string;
  /** Event sequence number within the topic */
  sequenceNumber: number;
  /** Timestamp when the event was created */
  timestamp: number;
  /** Optional metadata attached to the event */
  metadata?: Record<string, unknown>;
}

/** A batch of events consumed from a topic. */
export interface EventBatch<T = unknown> {
  /** Topic these events belong to */
  topic: string;
  /** Consumer group that consumed these events */
  consumerGroup: string;
  /** Events in this batch */
  events: Event<T>[];
  /** Cursor position for this batch (opaque to caller) */
  cursor: string;
}

/**
 * Event log adapter interface for low-level operations.
 */
export interface EventLogAdapter {
  /** Append an event to a topic. Returns the event ID. */
  append<T>(
    topic: string,
    data: T,
    options?: AppendOptions,
  ): Promise<string>;

  /** Get a single event by ID. */
  get<T>(topic: string, sequenceNumber: number): Promise<Event<T> | null>;

  /** List events in a topic with optional filtering. */
  list<T>(
    topic: string,
    options?: ListOptions,
  ): Promise<Event<T>[]>;

  /** Consume events from a topic as a streaming async iterable. */
  consume<T>(
    topic: string,
    consumerGroup: string,
    options?: ConsumeOptions,
  ): AsyncIterable<EventBatch<T>>;

  /** Commit a cursor position for a consumer group. */
  commitCursor(
    topic: string,
    consumerGroup: string,
    cursor: string,
  ): Promise<void>;

  /** Get the committed cursor position for a consumer group. */
  getCursor(
    topic: string,
    consumerGroup: string,
  ): Promise<string | null>;

  /** Close the adapter connection. */
  close(): Promise<void>;
}

/** Options for appending an event. */
export interface AppendOptions {
  /** Partition key for ordering guarantees within the topic */
  partitionKey?: string;
  /** Optional metadata attached to the event */
  metadata?: Record<string, unknown>;
  /** Timestamp for the event (defaults to now) */
  timestamp?: number;
}

/** Options for listing events. */
export interface ListOptions {
  /** Starting sequence number (inclusive) */
  fromSequenceNumber?: number;
  /** Maximum number of events to return */
  limit?: number;
  /** Filter by partition key */
  partitionKey?: string;
}

/** Options for consuming events. */
export interface ConsumeOptions {
  /** Signal for cancellation */
  signal?: AbortSignal;
  /** Starting cursor (null means from beginning) */
  cursor?: string | null;
  /** Batch size for events */
  batchSize?: number;
}

/** Connector that produces connected EventLogAdapter instances. */
export interface EventLogConnector {
  /** Acquire a connected adapter. */
  connect(signal?: AbortSignal): Promise<EventLogAdapter>;

  /** Close all connections and clean up resources. */
  end(): Promise<void>;
}

/** Event log configuration options. */
export interface EventLogOptions {
  /** Default partition key if not specified */
  defaultPartitionKey?: string;
}
