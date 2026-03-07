/**
 * Queue adapter interface for queue-agnostic operations.
 *
 * Implement this interface to create drivers for specific message brokers.
 * The Queue class wraps adapters with Task/Stream semantics.
 *
 * For connection lifecycle management, use QueueConnector which produces adapters.
 * The adapter's close() method releases the connection (e.g., back to a pool)
 * rather than terminating it — termination is the connector's responsibility.
 */
export interface QueueMessage<T = unknown> {
  /** Unique message identifier */
  id: string;
  /** Message payload */
  data: T;
  /** Number of times this message has been delivered */
  attempt: number;
  /** Timestamp when the message was first enqueued */
  timestamp: number;
  /** Optional metadata from the broker */
  metadata?: Record<string, unknown>;
}

/** Options for sending a message with delay or scheduling. */
export interface SendOptions {
  /** Delay in milliseconds before the message becomes available */
  delayMs?: number;
  /** Explicit scheduled delivery time */
  scheduledAt?: Date;
  /** Override the default dead letter queue for this message */
  deadLetterQueue?: string;
  /** Message priority (higher = more important, if supported) */
  priority?: number;
}

/** Options for negative acknowledgment. */
export interface NackOptions {
  /** Requeue the message instead of dead-letter routing */
  requeue?: boolean;
  /** Delay before the message is requeued */
  delay?: number;
  /** Explicit dead letter queue target */
  deadLetter?: boolean;
}

/**
 * Queue adapter interface for low-level queue operations.
 */
export interface QueueAdapter {
  send<T>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string>;

  receive<T>(
    queue: string,
    count?: number,
  ): Promise<QueueMessage<T>[]>;

  ack(queue: string, ...ids: string[]): Promise<void>;

  nack(queue: string, id: string, options?: NackOptions): Promise<void>;

  close(): Promise<void>;
}

/**
 * Extended adapter interface for broker-native streaming.
 * Implement this if your broker has push-based message consumption
 * (e.g., RabbitMQ channels, Kafka consumer groups, SQS long polling).
 */
export interface StreamAdapter extends QueueAdapter {
  subscribe<T>(
    queue: string,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<QueueMessage<T>>;
}

/**
 * Connector that produces connected QueueAdapter instances.
 *
 * Implement this to provide connection acquisition logic for your message broker.
 * Handles pool checkout, connection creation, and termination on error.
 */
export interface QueueConnector {
  /**
   * Acquire a connected adapter.
   * @param signal Optional AbortSignal for cancellation
   * @throws QueueConnectionFailed if the connection cannot be established
   */
  connect(signal?: AbortSignal): Promise<QueueAdapter>;

  /**
   * Close all connections and clean up resources.
   * After calling end(), the connector cannot be used to create new adapters.
   */
  end(): Promise<void>;
}

/** Queue configuration options. */
export interface QueueOptions {
  /** Maximum delivery attempts before routing to dead letter queue */
  maxAttempts?: number;
  /** Message visibility timeout (milliseconds) - time between delivery and ACK/NACK */
  visibilityTimeout?: number;
  /** Default dead letter queue for failed messages */
  deadLetterQueue?: string;
  /** Dead letter queue specific options */
  deadLetterOptions?: {
    /** DLQ's own max delivery attempts */
    maxAttempts?: number;
    /** Delay for DLQ messages */
    delay?: number;
  };
}
