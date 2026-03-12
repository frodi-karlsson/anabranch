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
  id: string
  /** Message payload. The message may have no content when q*/
  data: T
  /** Number of times this message has been delivered */
  attempt: number
  /** Timestamp when the message was first enqueued */
  timestamp: number
  /** Optional metadata from the broker */
  metadata?: {
    headers?: Record<string, string>
    [key: string]: unknown
  }
}

/** Options for sending a message with delay or scheduling. */
export interface SendOptions {
  /** Delay in milliseconds before the message becomes available */
  delayMs?: number
  /** Explicit scheduled delivery time */
  scheduledAt?: Date
  /** Override the default dead letter queue for this message */
  deadLetterQueue?: string
  /** Message priority (higher = more important, if supported) */
  priority?: number
  /** Arbitrary key-value pairs to attach to the message */
  headers?: Record<string, string>
}

/** Options for negative acknowledgment. */
export interface NackOptions {
  /** Requeue the message instead of dead-letter routing */
  requeue?: boolean
  /** Delay before the message is requeued */
  delay?: number
  /** Explicit dead letter queue target */
  deadLetter?: boolean
}

/**
 * Queue adapter interface for low-level queue operations.
 */
export interface QueueAdapter {
  /**
   * Send a single message to the specified queue.
   * @param queue Name of the destination queue.
   * @param data Payload to send.
   * @param options Delivery options like delay or headers.
   * @returns The unique ID assigned to the message by the broker.
   */
  send<T>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string>

  /**
   * Send a batch of messages to the specified queue.
   * Implementation should optimize this operation if possible (e.g. using pipelines or batch APIs).
   * @param queue Name of the destination queue.
   * @param data Array of payloads to send.
   * @param options Delivery options applied to all messages in the batch.
   * @returns Array of unique IDs assigned to the messages.
   */
  sendBatch<T>(
    queue: string,
    data: T[],
    options?: SendOptions,
  ): Promise<string[]>

  /**
   * Retrieve one or more messages from the specified queue.
   * @param queue Name of the queue to receive from.
   * @param count Maximum number of messages to retrieve in this call.
   * @returns Array of messages retrieved from the broker.
   */
  receive<T>(
    queue: string,
    count?: number,
  ): Promise<QueueMessage<T>[]>

  /**
   * Acknowledge that one or more messages have been successfully processed.
   * The broker should remove these messages from the queue.
   * @param queue Name of the queue.
   * @param ids Unique IDs of the messages to acknowledge.
   */
  ack(queue: string, ...ids: string[]): Promise<void>

  /**
   * Indicate that a message processing failed.
   * @param queue Name of the queue.
   * @param id Unique ID of the message.
   * @param options How to handle the failed message (requeue, delay, dead-letter).
   */
  nack(queue: string, id: string, options?: NackOptions): Promise<void>

  /**
   * Release any resources held by this adapter instance.
   * Does not necessarily terminate the underlying connection (which is managed by the Connector).
   */
  close(): Promise<void>
}

/**
 * Extended adapter interface for broker-native streaming.
 * Implement this if your broker has push-based message consumption
 * (e.g., RabbitMQ channels, Kafka consumer groups, SQS long polling).
 */
export interface StreamAdapter extends QueueAdapter {
  subscribe<T>(
    queue: string,
    options?: {
      signal?: AbortSignal
      prefetch?: number
    },
  ): AsyncIterable<QueueMessage<T>>
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
  connect(signal?: AbortSignal): Promise<QueueAdapter>

  /**
   * Close all connections and clean up resources.
   * After calling end(), the connector cannot be used to create new adapters.
   */
  end(): Promise<void>
}

/** Queue configuration options. */
export interface QueueOptions {
  /** Maximum delivery attempts before routing to dead letter queue */
  maxAttempts?: number
  /** Message visibility timeout (milliseconds) - time between delivery and ACK/NACK */
  visibilityTimeout?: number
  /** Default dead letter queue for failed messages */
  deadLetterQueue?: string
  /** Dead letter queue specific options */
  deadLetterOptions?: {
    /** DLQ's own max delivery attempts */
    maxAttempts?: number
    /** Delay for DLQ messages */
    delay?: number
  }
}
