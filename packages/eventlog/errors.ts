/**
 * Error thrown when an event log connection cannot be established.
 */
export class EventLogConnectionFailed extends Error {
  override name = 'EventLogConnectionFailed'
  constructor(message: string, cause?: unknown) {
    super(`Event log connection failed: ${message}`, { cause })
  }
}

/** Error thrown when an append operation fails. */
export class EventLogAppendFailed extends Error {
  override name = 'EventLogAppendFailed'
  constructor(topic: string, message: string, cause?: unknown) {
    super(`Failed to append to ${topic}: ${message}`, { cause })
  }
}

/** Error thrown when consuming events fails. */
export class EventLogConsumeFailed extends Error {
  override name = 'EventLogConsumeFailed'
  constructor(topic: string, message: string, cause?: unknown) {
    super(`Failed to consume events from ${topic}: ${message}`, { cause })
  }
}

/** Error thrown when committing a cursor fails. */
export class EventLogCommitCursorFailed extends Error {
  override name = 'EventLogCommitCursorFailed'
  constructor(
    topic: string,
    consumerGroup: string,
    message: string,
    cause?: unknown,
  ) {
    super(
      `Failed to commit cursor for ${consumerGroup} on ${topic}: ${message}`,
      { cause },
    )
  }
}

/** Error thrown when getting a cursor fails. */
export class EventLogGetCursorFailed extends Error {
  override name = 'EventLogGetCursorFailed'
  constructor(
    topic: string,
    consumerGroup: string,
    message: string,
    cause?: unknown,
  ) {
    super(
      `Failed to get cursor for ${consumerGroup} on ${topic}: ${message}`,
      { cause },
    )
  }
}

/** Error thrown when closing an event log connection fails. */
export class EventLogCloseFailed extends Error {
  override name = 'EventLogCloseFailed'
  constructor(message: string, cause?: unknown) {
    super(`Event log close failed: ${message}`, { cause })
  }
}
