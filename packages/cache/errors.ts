/** Base error for all cache-related failures. */
export class CacheError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CacheError'
  }
}

/** Connection establishment failed. */
export class CacheConnectionFailed extends CacheError {
  constructor(message: string, cause?: unknown) {
    super(`Cache connection failed: ${message}`)
    this.name = 'CacheConnectionFailed'
    if (cause !== undefined) this.cause = cause
  }
}

/** Get operation failed. */
export class CacheGetFailed extends CacheError {
  constructor(
    public readonly key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Cache get failed for ${key}: ${message}`)
    this.name = 'CacheGetFailed'
    if (cause !== undefined) this.cause = cause
  }
}

/** Set operation failed. */
export class CacheSetFailed extends CacheError {
  constructor(
    public readonly key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Cache set failed for ${key}: ${message}`)
    this.name = 'CacheSetFailed'
    if (cause !== undefined) this.cause = cause
  }
}

/** Delete operation failed. */
export class CacheDeleteFailed extends CacheError {
  constructor(
    public readonly key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Cache delete failed for ${key}: ${message}`)
    this.name = 'CacheDeleteFailed'
    if (cause !== undefined) this.cause = cause
  }
}

/** Close operation failed. */
export class CacheCloseFailed extends CacheError {
  constructor(message: string, cause?: unknown) {
    super(`Cache close failed: ${message}`)
    this.name = 'CacheCloseFailed'
    if (cause !== undefined) this.cause = cause
  }
}
