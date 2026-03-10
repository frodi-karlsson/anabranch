/**
 * Error thrown when a Datastore connection fails.
 */
export class DatastoreConnectionFailed extends Error {
  override name = 'DatastoreConnectionFailed'

  constructor(message: string, cause?: unknown) {
    super(`Datastore connection failed: ${message}`, { cause })
  }
}

/**
 * Error thrown when a Datastore query execution fails.
 */
export class DatastoreQueryFailed extends Error {
  override name = 'DatastoreQueryFailed'
  readonly kind: string

  constructor(kind: string, message: string, cause?: unknown) {
    super(`Datastore query failed (${kind}): ${message}`, { cause })
    this.kind = kind
  }
}

/**
 * Registry of error constructors for instanceof checks.
 */
export const DatastoreErrors = {
  DatastoreConnectionFailed,
  DatastoreQueryFailed,
} as const
