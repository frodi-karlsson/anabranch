/**
 * Thrown by {@link Stream.collect} and {@link Stream.fold} when one or more
 * error results were collected during stream processing.
 */
export class AggregateError extends Error {
  /** The errors collected during stream processing. */
  constructor(public errors: unknown[]) {
    super(`AggregateError: ${errors.length} errors`)

    this.name = 'AggregateError'
    this.errors = errors
  }
}

/**
 * A result emitted by a {@link Stream}. Either a successful value or a
 * collected error.
 */
export type Result<T, E> = [T] extends [never] ? ErrorResult<T, E>
  : [E] extends [never] ? SuccessResult<T, E>
  : SuccessResult<T, E> | ErrorResult<T, E>

/**
 * A value that is either already resolved or a `Promise` that resolves to it. Used throughout the API to allow callbacks to be synchronous or asynchronous.
 */
export type Promisable<T> = T | Promise<T>

/**
 * An error result emitted by a {@link Stream}.
 */
export type ErrorResult<_T, E> = {
  type: 'error'
  error: E
}

/**
 * A successful result emitted by a {@link Stream}.
 */
export type SuccessResult<T, _E> = {
  type: 'success'
  value: T
}

export function isSuccess<T, E>(
  result: Result<T, E>,
): result is Result<T, E> & SuccessResult<T, E> {
  return result.type === 'success'
}

export function isError<T, E>(
  result: Result<T, E>,
): result is Result<T, E> & ErrorResult<T, E> {
  return result.type === 'error'
}
