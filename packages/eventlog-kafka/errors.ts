/**
 * Error thrown when a Kafka event log connection cannot be established.
 */
export class EventLogKafkaConnectionFailed extends Error {
  override name = 'EventLogKafkaConnectionFailed'
  constructor(message: string, cause?: unknown) {
    super(`Kafka event log connection failed: ${message}`, { cause })
  }
}

/** Error thrown when an append operation fails. */
export class EventLogKafkaAppendFailed extends Error {
  override name = 'EventLogKafkaAppendFailed'
  constructor(topic: string, message: string, cause?: unknown) {
    super(`Failed to append to ${topic}: ${message}`, { cause })
  }
}

/** Error thrown when consuming events fails. */
export class EventLogKafkaConsumeFailed extends Error {
  override name = 'EventLogKafkaConsumeFailed'
  constructor(
    topic: string,
    consumerGroup: string,
    message: string,
    cause?: unknown,
  ) {
    super(
      `Failed to consume events from ${topic} (${consumerGroup}): ${message}`,
      { cause },
    )
  }
}

/** Error thrown when getting an event fails. */
export class EventLogKafkaGetFailed extends Error {
  override name = 'EventLogKafkaGetFailed'
  constructor(
    topic: string,
    partition: number,
    offset: string,
    message: string,
    cause?: unknown,
  ) {
    super(
      `Failed to get event from ${topic}[${partition}]@${offset}: ${message}`,
      { cause },
    )
  }
}

/** Error thrown when listing events fails. */
export class EventLogKafkaListFailed extends Error {
  override name = 'EventLogKafkaListFailed'
  constructor(topic: string, message: string, cause?: unknown) {
    super(`Failed to list events from ${topic}: ${message}`, { cause })
  }
}

/** Error thrown when committing a cursor fails. */
export class EventLogKafkaCommitCursorFailed extends Error {
  override name = 'EventLogKafkaCommitCursorFailed'
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
export class EventLogKafkaGetCursorFailed extends Error {
  override name = 'EventLogKafkaGetCursorFailed'
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
export class EventLogKafkaCloseFailed extends Error {
  override name = 'EventLogKafkaCloseFailed'
  constructor(message: string, cause?: unknown) {
    super(`Kafka event log close failed: ${message}`, { cause })
  }
}
