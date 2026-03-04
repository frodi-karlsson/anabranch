export class AnabranchAggregateError extends Error {
  constructor(public errors: unknown[]) {
    super(`AggregateError: ${errors.length} errors`);

    this.name = "AnabranchAggregateError";
    this.errors = errors;
  }
}

export type AnabranchResult<T, E> = E extends never
  ? AnabranchSuccessResult<T, E>
  : T extends never ? AnabranchErrorResult<T, E>
  : AnabranchSuccessResult<T, E> | AnabranchErrorResult<T, E>;

export type AnabranchPromisable<T> = T | Promise<T>;

export type AnabranchErrorResult<_T, E> = {
  type: "error";
  error: E;
};

export type AnabranchSuccessResult<T, _E> = {
  type: "success";
  value: T;
};
