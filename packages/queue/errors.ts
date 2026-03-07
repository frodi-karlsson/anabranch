/**
 * Error types for queue operations.
 */

/** Base error for all queue-related failures. */
export class QueueError extends Error {
  constructor(
    message: string,
    public readonly queue?: string,
    public readonly messageId?: string,
  ) {
    super(message);
    this.name = "QueueError";
  }
}

/** Connection establishment failed. */
export class QueueConnectionFailed extends QueueError {
  constructor(message: string, public readonly originalError?: unknown) {
    super(`Connection failed: ${message}`, undefined, undefined);
    this.name = "QueueConnectionFailed";
  }
}

/** Message send operation failed. */
export class QueueSendFailed extends QueueError {
  constructor(
    message: string,
    queue: string,
    public readonly originalError?: unknown,
  ) {
    super(message, queue);
    this.name = "QueueSendFailed";
  }
}

/** Message receive operation failed. */
export class QueueReceiveFailed extends QueueError {
  constructor(
    message: string,
    queue: string,
    public readonly originalError?: unknown,
  ) {
    super(message, queue);
    this.name = "QueueReceiveFailed";
  }
}

/** Acknowledgment operation failed. */
export class QueueAckFailed extends QueueError {
  constructor(
    message: string,
    queue: string,
    messageId: string,
    public readonly originalError?: unknown,
  ) {
    super(message, queue, messageId);
    this.name = "QueueAckFailed";
  }
}

/** Consumer handler failed unexpectedly. */
export class QueueConsumeFailed extends QueueError {
  constructor(
    message: string,
    queue: string,
    messageId: string,
    public readonly originalError?: unknown,
  ) {
    super(message, queue, messageId);
    this.name = "QueueConsumeFailed";
  }
}

/** Message exceeded maximum delivery attempts. */
export class QueueMaxAttemptsExceeded extends QueueError {
  constructor(
    queue: string,
    messageId: string,
    public readonly attempts: number,
  ) {
    super(
      `Message ${messageId} exceeded ${attempts} delivery attempts in queue ${queue}`,
      queue,
      messageId,
    );
    this.name = "QueueMaxAttemptsExceeded";
  }
}

/** Connection close operation failed. */
export class QueueCloseFailed extends QueueError {
  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "QueueCloseFailed";
  }
}
