import type { ErrorResult, Result, SuccessResult } from "./index.ts";
import { _StreamImpl } from "./streams/stream.ts";

export const success = <T, E = never>(value: T): SuccessResult<T, E> => ({
  type: "success",
  value,
});

export const failure = <T = never, E = never>(error: E): ErrorResult<T, E> => ({
  type: "error",
  error,
});

export const streamFrom = <T, E>(items: Result<T, E>[]) =>
  new _StreamImpl<T, E>(async function* () {
    for (const item of items) {
      yield item;
    }
  });

export const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
