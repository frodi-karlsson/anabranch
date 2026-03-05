/**
 * Thrown by {@link AnabranchStream.collect} and {@link AnabranchStream.fold} when one or more error results were collected during stream processing.
 */
export class AnabranchAggregateError extends Error {
  /** The errors collected during stream processing. */
  constructor(public errors: unknown[]) {
    super(`AggregateError: ${errors.length} errors`);

    this.name = "AnabranchAggregateError";
    this.errors = errors;
  }
}

/**
 * A result emitted by an {@link AnabranchStream}. Either a successful value or a collected error.
 */
export type AnabranchResult<T, E> = E extends never
  ? AnabranchSuccessResult<T, E>
  : T extends never ? AnabranchErrorResult<T, E>
  : AnabranchSuccessResult<T, E> | AnabranchErrorResult<T, E>;

/**
 * A value that is either already resolved or a `Promise` that resolves to it. Used throughout the API to allow callbacks to be synchronous or asynchronous.
 */
export type AnabranchPromisable<T> = T | Promise<T>;

/**
 * An error result emitted by an {@link AnabranchStream}.
 */
export type AnabranchErrorResult<_T, E> = {
  type: "error";
  error: E;
};

/**
 * A successful result emitted by an {@link AnabranchStream}.
 */
export type AnabranchSuccessResult<T, _E> = {
  type: "success";
  value: T;
};
