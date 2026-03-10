/**
 * Error thrown when a document get operation fails.
 */
export class CollectionGetFailed extends Error {
  override name = 'CollectionGetFailed'
  /** Name of the collection. */
  readonly collection: string
  /** Key that was being retrieved. */
  readonly key: unknown

  constructor(
    collection: string,
    key: unknown,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to get ${key} from ${collection}: ${message}`, { cause })
    this.collection = collection
    this.key = key
  }
}

/**
 * Error thrown when a document put operation fails.
 */
export class CollectionPutFailed extends Error {
  override name = 'CollectionPutFailed'
  /** Name of the collection. */
  readonly collection: string
  /** Key that was being written. */
  readonly key: unknown

  constructor(
    collection: string,
    key: unknown,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to put ${key} in ${collection}: ${message}`, { cause })
    this.collection = collection
    this.key = key
  }
}

/**
 * Error thrown when a batch put operation fails.
 */
export class CollectionPutManyFailed extends Error {
  override name = 'CollectionPutManyFailed'
  /** Name of the collection. */
  readonly collection: string

  constructor(collection: string, message: string, cause?: unknown) {
    super(`Failed to put many in ${collection}: ${message}`, { cause })
    this.collection = collection
  }
}

/**
 * Error thrown when a document delete operation fails.
 */
export class CollectionDeleteFailed extends Error {
  override name = 'CollectionDeleteFailed'
  /** Name of the collection. */
  readonly collection: string
  /** Key that was being deleted. */
  readonly key: unknown

  constructor(
    collection: string,
    key: unknown,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to delete ${key} from ${collection}: ${message}`, { cause })
    this.collection = collection
    this.key = key
  }
}

/**
 * Error thrown when a query operation fails.
 */
export class CollectionFindFailed extends Error {
  override name = 'CollectionFindFailed'
  /** Name of the collection. */
  readonly collection: string

  constructor(collection: string, message: string, cause?: unknown) {
    super(`Failed to find in ${collection}: ${message}`, { cause })
    this.collection = collection
  }
}

/**
 * Error thrown when connecting to a collection fails.
 */
export class CollectionConnectionFailed extends Error {
  override name = 'CollectionConnectionFailed'
  /** Name of the collection. */
  readonly collection: string

  constructor(collection: string, message: string, cause?: unknown) {
    super(`Failed to connect to ${collection}: ${message}`, { cause })
    this.collection = collection
  }
}

/**
 * Error thrown when closing a collection connection fails.
 */
export class CollectionCloseFailed extends Error {
  override name = 'CollectionCloseFailed'
  /** Name of the collection. */
  readonly collection: string

  constructor(collection: string, message: string, cause?: unknown) {
    super(`Failed to close ${collection}: ${message}`, { cause })
    this.collection = collection
  }
}

/**
 * Registry of error constructors for instanceof checks.
 */
export const CollectionErrors = {
  CollectionGetFailed,
  CollectionPutFailed,
  CollectionPutManyFailed,
  CollectionDeleteFailed,
  CollectionFindFailed,
  CollectionConnectionFailed,
  CollectionCloseFailed,
} as const
