import {
  AnabranchAggregateError,
  type AnabranchPromisable,
  type AnabranchResult,
} from "./util.ts";

const isPromise = <T>(value: AnabranchPromisable<T>): value is Promise<T> =>
  value != null && typeof (value as Promise<T>).then === "function";

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> => {
  if (value === null || value === undefined) {
    return false;
  }
  return Symbol.asyncIterator in Object(value);
};

const isIterable = <T>(value: unknown): value is Iterable<T> => {
  if (value === null || value === undefined) {
    return false;
  }
  return Symbol.iterator in Object(value);
};

const toAsyncIterable = <T>(
  iterable: AsyncIterable<T> | Iterable<T>,
): AsyncIterable<T> => {
  if (isAsyncIterable<T>(iterable)) {
    return iterable;
  }
  if (isIterable<T>(iterable)) {
    return (async function* () {
      yield* iterable;
    })();
  }
  throw new TypeError("flatMap function must return an iterable");
};

/**
 * Anabranch is a TypeScript library that provides a powerful and flexible way to handle errors in asynchronous streams. It allows you to collect and manage errors alongside successful values in a stream, enabling you to process data while gracefully handling any issues that may arise.
 *
 * The core concept of Anabranch is the `AnabranchStream`, which is an asynchronous iterable that emits results as either successful values or errors. You can use various methods on the `AnabranchStream` to transform, filter, and reduce both successful values and errors in a way that suits your application's needs.
 */
export interface AnabranchStream<T, E>
  extends AsyncIterable<AnabranchResult<T, E>> {
  /**
   * Similar to `Array.prototype.map`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * When concurrency is greater than 1, results may be emitted out of order.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const mappedStream = stream.map(async (value) => {
   *   if (value === 2) {
   *     throw new Error("Value cannot be 2");
   *   }
   *   return value * 2;
   * });
   * ```
   * @see {@link AnabranchStream.mapErr}
   */
  map<U>(fn: (value: T) => AnabranchPromisable<U>): AnabranchStream<U, E>;
  /**
   * Similar to `Array.prototype.flatMap`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * When concurrency is greater than 1, results may be emitted out of order.
   *
   * @example
   * ```ts
   * import { AnabranchSource } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const flattened = stream.flatMap((value) => [value, value * 10]);
   * ```
   */
  flatMap<U>(
    fn: (
      value: T,
    ) => AnabranchPromisable<AsyncIterable<U> | Iterable<U>>,
  ): AnabranchStream<U, E>;
  /**
   * Similar to `Array.prototype.filter`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const filteredStream = stream.filter(async (value) => {
   *   if (value === 2) {
   *     throw new Error("Value cannot be 2");
   *   }
   *   return value % 2 === 1;
   * });
   * ```
   *
   * @see {@link AnabranchStream.filterErr}
   */
  filter<U extends T>(
    fn: (value: T) => value is U,
  ): AnabranchStream<U, E>;
  filter(fn: (value: T) => AnabranchPromisable<boolean>): AnabranchStream<T, E>;
  /**
   * Runs a side-effect function on each successful value without transforming it. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in place of the original value.
   *
   * @example
   * ```ts
   * const stream = source.tap((value) => console.log("Got:", value));
   * ```
   */
  tap(fn: (value: T) => AnabranchPromisable<void>): AnabranchStream<T, E>;
  /**
   * Runs a side-effect function on each error without transforming it. If the provided function throws an error or returns a rejected promise, the new error replaces the original.
   *
   * @example
   * ```ts
   * const stream = source.tapErr((error) => console.error("Error:", error));
   * ```
   */
  tapErr(fn: (error: E) => AnabranchPromisable<void>): AnabranchStream<T, E>;
  /**
   * Limits the stream to at most `n` successful values. Errors pass through without counting against the limit.
   *
   * @example
   * ```ts
   * const first3 = source.take(3);
   * ```
   */
  take(n: number): AnabranchStream<T, E>;
  /**
   * Yields successful values while the predicate returns true. Once the predicate returns false, iteration stops. Errors pass through until the stream is stopped. If the predicate throws, an error result is emitted and iteration stops.
   *
   * @example
   * ```ts
   * const belowTen = source.takeWhile((value) => value < 10);
   * ```
   */
  takeWhile(
    fn: (value: T) => AnabranchPromisable<boolean>,
  ): AnabranchStream<T, E>;
  /**
   * Similar to `Array.prototype.reduce`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const sum = await stream.fold(async (acc, value) => {
   *   if (value === 2) {
   *     throw new Error("Value cannot be 2");
   *   }
   *   return acc + value;
   * }, 0);
   *
   * console.log("Sum:", sum);
   * ```
   *
   * @see {@link AnabranchStream.foldErr}
   */
  fold<U>(
    fn: (acc: U, value: T) => AnabranchPromisable<U>,
    initialValue: U,
  ): Promise<U>;
  /**
   * Similar to `Array.prototype.map`, but works on the stream of errors. If the provided function throws an error or returns a rejected promise, the new error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const mappedErrorStream = stream.mapErr(async (error) => {
   *   return `Mapped error: ${error}`;
   * });
   * ```
   *
   * @see {@link AnabranchStream.map}
   */
  mapErr<F>(fn: (error: E) => AnabranchPromisable<F>): AnabranchStream<T, F>;
  /**
   * Similar to `Array.prototype.filter`, but works on the stream of errors. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const filteredErrorStream = stream.filterErr(async (error) => {
   *   return error.includes("Value cannot be 2");
   * });
   * ```
   * @see {@link AnabranchStream.filter}
   */
  filterErr<F extends E>(
    fn: (error: E) => error is F,
  ): AnabranchStream<T, F>;
  filterErr(
    fn: (error: E) => AnabranchPromisable<boolean>,
  ): AnabranchStream<T, E>;
  /**
   * Similar to `Array.prototype.reduce`, but works on the stream of errors. If the provided function throws an error or returns a rejected promise, the new error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const concatenatedErrors = await stream.foldErr(async (acc, error) => {
   *   return `${acc}; ${error}`;
   * }, "");
   *
   * console.log("Concatenated Errors:", concatenatedErrors);
   * ```
   * @see {@link AnabranchStream.fold}
   */
  foldErr<F>(
    fn: (acc: F, error: E) => AnabranchPromisable<F>,
    initialValue: F,
  ): Promise<F>;
  /**
   * Recovers from specific error types by applying the provided function to transform them into successful values. This allows you to handle specific errors gracefully while still collecting other errors in the stream.
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, "aaaah!" | "eeeek!">(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const recoveredStream = stream.recoverWhen(e => e === "aaaah!" as const, e => 42);
   * ```
   */
  recoverWhen<E2 extends E, U>(
    guard: (error: E) => error is E2,
    fn: (error: E2) => AnabranchPromisable<U>,
  ): AnabranchStream<T | U, Exclude<E, E2>>;
  /**
   * Recovers from all errors by applying the provided function to transform them into successful values. This allows you to handle all errors gracefully while still collecting successful values in the stream.
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const recoveredStream = stream.recover(e => 0);
   * ```
   */
  recover<U>(
    fn: (error: E) => AnabranchPromisable<U>,
  ): AnabranchStream<T | U, never>;
  /**
   * Throws the specified error types if they are encountered in the stream. This allows you to handle specific errors immediately while continuing to process other errors.
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, "aaaah!" | "eeeek!">(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const streamWithThrownErrors = stream.throwOn(e => e === "eeeek!");
   *
   * try {
   *   for await (const value of streamWithThrownErrors.successes()) {
   *     console.log("Value:", value);
   *   }
   * } catch (error) {
   *   console.error("Caught error:", error); // This will catch "eeeek!" errors thrown by throwOn
   * }
   * ```
   */
  throwOn<E2 extends E>(
    guard: (error: E) => error is E2,
  ): AnabranchStream<T, Exclude<E, E2>>;
  /**
   * Returns an async iterable of all successful values emitted by the stream. If any errors were collected during the stream processing, they will be ignored in this iterable.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * for await (const value of stream.successes()) {
   *   console.log("Success:", value);
   * }
   * ```
   */
  successes(): AsyncIterable<T>;
  /**
   * Returns an async iterable of all errors collected during the stream processing. If any successful values were emitted during the stream processing, they will be ignored in this iterable.
   *
   * @example
   * ```ts
   * import { AnabranchStream } from "anabranch";
   *
   * const stream = new AnabranchSource<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * for await (const error of stream.errors()) {
   *   console.error("Error:", error);
   * }
   * ```
   */
  errors(): AsyncIterable<E>;
  /**
   * Collects all successful values emitted by the stream into an array. If any errors were collected during the stream processing, they will be thrown as an `AnabranchAggregateError` containing all collected errors.
   *
   * @throws {AnabranchAggregateError} If any errors were collected during the stream processing.
   */
  collect(): Promise<T[]>;
  /**
   * Collects all results into separate `successes` and `errors` arrays. Unlike `collect()`, this never throws.
   *
   * @example
   * ```ts
   * const { successes, errors } = await source.partition();
   * ```
   */
  partition(): Promise<{ successes: T[]; errors: E[] }>;
  /**
   * Collects all results emitted by the stream into an array of `AnabranchResult` objects, which can represent either successful values or errors. This method allows you to see the full outcome of the stream processing, including both successes and errors, without throwing an aggregate error.
   */
  toArray(): Promise<AnabranchResult<T, E>[]>;

  [Symbol.asyncIterator](): AsyncIterator<AnabranchResult<T, E>>;
}

export class _AnabranchStreamImpl<T, E> implements AnabranchStream<T, E> {
  constructor(
    protected readonly source: () => AsyncGenerator<AnabranchResult<T, E>>,
    protected readonly concurrency: number = Infinity,
    protected readonly bufferSize: number = Infinity,
  ) {}

  async toArray(): Promise<AnabranchResult<T, E>[]> {
    const results: AnabranchResult<T, E>[] = [];
    for await (const result of this.source()) {
      results.push(result);
    }
    return results;
  }

  async collect(): Promise<T[]> {
    const successes: T[] = [];
    const errors: E[] = [];

    for await (const result of this.source()) {
      if (result.type === "success") {
        successes.push(result.value);
      } else {
        errors.push(result.error);
      }
    }

    if (errors.length) {
      throw new AnabranchAggregateError(errors);
    }
    return successes;
  }

  successes(): AsyncIterable<T> {
    const source = this.source;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const result of source()) {
          if (result.type === "success") {
            yield result.value;
          }
        }
      },
    };
  }

  errors(): AsyncIterable<E> {
    const source = this.source;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const result of source()) {
          if (result.type === "error") {
            yield result.error;
          }
        }
      },
    };
  }

  [Symbol.asyncIterator](): AsyncIterator<AnabranchResult<T, E>> {
    return this.source()[Symbol.asyncIterator]();
  }

  private transform<U, E2>(
    handler: (
      result: AnabranchResult<T, E>,
    ) => AnabranchPromisable<AnabranchResult<U, E2>[]>,
  ): AnabranchStream<U, E2> {
    const source = this.source;
    const concurrency = this.concurrency;
    const bufferSize = this.bufferSize;
    return new _AnabranchStreamImpl<U, E2>(
      async function* () {
        for await (const result of source()) {
          const outputs = await handler(result);
          for (const output of outputs) {
            yield output;
          }
        }
      },
      concurrency,
      bufferSize,
    );
  }

  private concurrentMap<U>(
    fn: (value: T) => AnabranchPromisable<U>,
    concurrency: number,
    bufferSize: number,
  ): AsyncGenerator<AnabranchResult<U, E>> {
    const source = this.source;
    const maxConcurrency = Number.isFinite(concurrency)
      ? Math.max(1, concurrency)
      : Infinity;
    const maxBufferSize = Number.isFinite(bufferSize)
      ? Math.max(1, bufferSize)
      : Infinity;

    return (async function* () {
      const queue: AnabranchResult<U, E>[] = [];
      let head = 0;
      let inFlight = 0;
      let done = false;
      const waiters: Array<() => void> = [];

      const wake = () => {
        while (waiters.length > 0) {
          const resolve = waiters.shift();
          if (resolve) {
            resolve();
          }
        }
      };

      const sleep = () =>
        new Promise<void>((resolve) => {
          waiters.push(resolve);
        });

      const push = (result: AnabranchResult<U, E>) => {
        queue.push(result);
        wake();
      };

      const size = () => queue.length - head;

      (async () => {
        try {
          for await (const result of source()) {
            while (inFlight >= maxConcurrency || size() >= maxBufferSize) {
              await sleep();
            }

            if (result.type === "error") {
              push(result as unknown as AnabranchResult<U, E>);
              continue;
            }

            inFlight += 1;
            Promise.resolve()
              .then(() => fn(result.value))
              .then((value) =>
                push({ type: "success", value } as AnabranchResult<U, E>)
              )
              .catch((error) =>
                push(
                  { type: "error", error: error as E } as AnabranchResult<U, E>,
                )
              )
              .finally(() => {
                inFlight -= 1;
                wake();
              });
          }
        } catch (error) {
          push({ type: "error", error: error as E } as AnabranchResult<U, E>);
        }
        done = true;
        wake();
      })();

      while (true) {
        while (size() === 0 && (!done || inFlight > 0)) {
          await sleep();
        }

        if (size() === 0) {
          break;
        }

        const next = queue[head];
        queue[head] = undefined as unknown as AnabranchResult<U, E>;
        head += 1;
        if (head > 256 && head * 2 >= queue.length) {
          queue.splice(0, head);
          head = 0;
        }
        if (next) {
          yield next;
          wake();
        }
      }
    })();
  }

  private sequentialMap<U>(
    fn: (value: T) => AnabranchPromisable<U>,
  ): AsyncGenerator<AnabranchResult<U, E>> {
    const source = this.source;
    return (async function* () {
      for await (const result of source()) {
        if (result.type === "success") {
          try {
            const mappedValue = fn(result.value);
            if (isPromise(mappedValue)) {
              yield {
                type: "success",
                value: await mappedValue,
              } as AnabranchResult<U, E>;
            } else {
              yield {
                type: "success",
                value: mappedValue,
              } as AnabranchResult<U, E>;
            }
          } catch (error) {
            yield { type: "error", error: error as E } as AnabranchResult<U, E>;
          }
        } else {
          yield result as unknown as AnabranchResult<U, E>;
        }
      }
    })();
  }

  map<U>(fn: (value: T) => AnabranchPromisable<U>): AnabranchStream<U, E> {
    const concurrency = this.concurrency;
    const bufferSize = this.bufferSize;
    if (Number.isFinite(concurrency) && concurrency > 1) {
      return new _AnabranchStreamImpl<U, E>(
        () => this.concurrentMap(fn, concurrency, bufferSize),
        concurrency,
        bufferSize,
      );
    }
    return new _AnabranchStreamImpl<U, E>(
      () => this.sequentialMap(fn),
      concurrency,
      bufferSize,
    );
  }

  flatMap<U>(
    fn: (
      value: T,
    ) => AnabranchPromisable<AsyncIterable<U> | Iterable<U>>,
  ): AnabranchStream<U, E> {
    return this.transform(async (result) => {
      if (result.type !== "success") {
        return [result as unknown as AnabranchResult<U, E>];
      }

      try {
        const mapped = await fn(result.value);
        const outputs: AnabranchResult<U, E>[] = [];
        for await (const value of toAsyncIterable<U>(mapped)) {
          outputs.push({ type: "success", value } as AnabranchResult<U, E>);
        }
        return outputs;
      } catch (error) {
        return [{ type: "error", error: error as E } as AnabranchResult<U, E>];
      }
    });
  }

  filter(
    fn: (value: T) => AnabranchPromisable<boolean>,
  ): AnabranchStream<T, E> {
    const source = this.source;
    const concurrency = this.concurrency;
    const bufferSize = this.bufferSize;
    return new _AnabranchStreamImpl<T, E>(
      async function* () {
        for await (const result of source()) {
          if (result.type === "success") {
            try {
              const shouldInclude = fn(result.value);
              if (isPromise(shouldInclude)) {
                if (await shouldInclude) {
                  yield result;
                }
              } else if (shouldInclude) {
                yield result;
              }
            } catch (error) {
              yield { type: "error", error: error as E } as AnabranchResult<
                T,
                E
              >;
            }
          } else {
            yield result;
          }
        }
      },
      concurrency,
      bufferSize,
    );
  }

  tap(fn: (value: T) => AnabranchPromisable<void>): AnabranchStream<T, E> {
    const source = this.source;
    const concurrency = this.concurrency;
    const bufferSize = this.bufferSize;
    return new _AnabranchStreamImpl<T, E>(
      async function* () {
        for await (const result of source()) {
          if (result.type === "success") {
            try {
              const ret = fn(result.value);
              if (isPromise(ret)) await ret;
              yield result;
            } catch (error) {
              yield { type: "error", error: error as E } as AnabranchResult<T, E>;
            }
          } else {
            yield result;
          }
        }
      },
      concurrency,
      bufferSize,
    );
  }

  tapErr(fn: (error: E) => AnabranchPromisable<void>): AnabranchStream<T, E> {
    const source = this.source;
    const concurrency = this.concurrency;
    const bufferSize = this.bufferSize;
    return new _AnabranchStreamImpl<T, E>(
      async function* () {
        for await (const result of source()) {
          if (result.type === "error") {
            try {
              const ret = fn(result.error);
              if (isPromise(ret)) await ret;
              yield result;
            } catch (error) {
              yield { type: "error", error: error as E } as AnabranchResult<T, E>;
            }
          } else {
            yield result;
          }
        }
      },
      concurrency,
      bufferSize,
    );
  }

  take(n: number): AnabranchStream<T, E> {
    const source = this.source;
    const concurrency = this.concurrency;
    const bufferSize = this.bufferSize;
    return new _AnabranchStreamImpl<T, E>(
      async function* () {
        let count = 0;
        for await (const result of source()) {
          if (result.type === "success") {
            if (count >= n) break;
            count += 1;
          }
          yield result;
          if (result.type === "success" && count >= n) break;
        }
      },
      concurrency,
      bufferSize,
    );
  }

  takeWhile(
    fn: (value: T) => AnabranchPromisable<boolean>,
  ): AnabranchStream<T, E> {
    const source = this.source;
    const concurrency = this.concurrency;
    const bufferSize = this.bufferSize;
    return new _AnabranchStreamImpl<T, E>(
      async function* () {
        for await (const result of source()) {
          if (result.type === "success") {
            try {
              const shouldContinue = fn(result.value);
              if (isPromise(shouldContinue) ? !(await shouldContinue) : !shouldContinue) {
                break;
              }
              yield result;
            } catch (error) {
              yield { type: "error", error: error as E } as AnabranchResult<T, E>;
              break;
            }
          } else {
            yield result;
          }
        }
      },
      concurrency,
      bufferSize,
    );
  }

  async partition(): Promise<{ successes: T[]; errors: E[] }> {
    const successes: T[] = [];
    const errors: E[] = [];
    for await (const result of this.source()) {
      if (result.type === "success") {
        successes.push(result.value);
      } else {
        errors.push(result.error);
      }
    }
    return { successes, errors };
  }

  async fold<U>(
    fn: (acc: U, value: T) => AnabranchPromisable<U>,
    initialValue: U,
  ): Promise<U> {
    let accumulator = initialValue;
    for await (const result of this.source()) {
      if (result.type === "success") {
        accumulator = await fn(accumulator, result.value);
      }
    }
    return accumulator;
  }

  mapErr<F>(fn: (error: E) => AnabranchPromisable<F>): AnabranchStream<T, F> {
    return this.transform(async (result) => {
      if (result.type === "error") {
        try {
          const mappedError = await fn(result.error);
          return [
            { type: "error", error: mappedError } as AnabranchResult<T, F>,
          ];
        } catch (error) {
          return [
            { type: "error", error: error as F } as AnabranchResult<T, F>,
          ];
        }
      }
      return [result as unknown as AnabranchResult<T, F>];
    });
  }

  filterErr(
    fn: (error: E) => AnabranchPromisable<boolean>,
  ): AnabranchStream<T, E> {
    return this.transform(async (result) => {
      if (result.type === "error") {
        try {
          const shouldInclude = await fn(result.error);
          if (shouldInclude) {
            return [result];
          }
          return [];
        } catch (error) {
          return [
            { type: "error", error: error as E } as AnabranchResult<T, E>,
          ];
        }
      }
      return [result];
    });
  }

  async foldErr<F>(
    fn: (acc: F, error: E) => AnabranchPromisable<F>,
    initialValue: F,
  ): Promise<F> {
    let accumulator = initialValue;
    for await (const result of this.source()) {
      if (result.type === "error") {
        accumulator = await fn(accumulator, result.error);
      }
    }
    return accumulator;
  }

  recoverWhen<E2 extends E, U>(
    guard: (error: E) => error is E2,
    fn: (error: E2) => AnabranchPromisable<U>,
  ): AnabranchStream<T | U, Exclude<E, E2>> {
    return this.transform(async (result) => {
      if (result.type === "error" && guard(result.error)) {
        try {
          const recoveredValue = await fn(result.error);
          return [
            {
              type: "success",
              value: recoveredValue,
            } as AnabranchResult<T | U, Exclude<E, E2>>,
          ];
        } catch (error) {
          return [
            {
              type: "error",
              error: error as Exclude<E, E2>,
            } as AnabranchResult<T | U, Exclude<E, E2>>,
          ];
        }
      }
      return [result as unknown as AnabranchResult<T | U, Exclude<E, E2>>];
    });
  }

  recover<U>(
    fn: (error: E) => AnabranchPromisable<U>,
  ): AnabranchStream<T | U, never> {
    return this.transform(async (result) => {
      if (result.type === "error") {
        try {
          const recoveredValue = await fn(result.error);
          return [
            {
              type: "success",
              value: recoveredValue,
            } as AnabranchResult<T | U, never>,
          ];
        } catch (error) {
          return [
            { type: "error", error: error as never } as AnabranchResult<
              T | U,
              never
            >,
          ];
        }
      }
      return [result as unknown as AnabranchResult<T | U, never>];
    });
  }

  throwOn<E2 extends E>(
    guard: (error: E) => error is E2,
  ): AnabranchStream<T, Exclude<E, E2>> {
    const source = this.source;
    return new _AnabranchStreamImpl<T, Exclude<E, E2>>(
      async function* () {
        for await (const result of source()) {
          if (result.type === "error" && guard(result.error)) {
            // throwOn intentionally terminates iteration instead of collecting.
            throw result.error;
          }
          yield result as unknown as AnabranchResult<T, Exclude<E, E2>>;
        }
      },
      this.concurrency,
      this.bufferSize,
    );
  }
}
