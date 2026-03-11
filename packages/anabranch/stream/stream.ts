import { _ChannelSource } from '../channel/channel-source.ts'
import { type Promisable, type Result } from '../util/util.ts'

/**
 * A TypeScript library that provides a powerful and flexible way to handle
 * errors in asynchronous streams. It allows you to collect and manage errors
 * alongside successful values in a stream, enabling you to process data while
 * gracefully handling any issues that may arise.
 *
 * The core concept is the `Stream`, which is an asynchronous iterable that
 * emits results as either successful values or errors. You can use various
 * methods on the `Stream` to transform, filter, and reduce both successful
 * values and errors in a way that suits your application's needs.
 */
export interface Stream<T, E> extends AsyncIterable<Result<T, E>> {
  /**
   * Similar to `Array.prototype.map`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * When concurrency is greater than 1, results may be emitted out of order.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
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
   * @see {@link Stream.mapErr}
   */
  map<U, E2 = E>(
    fn: (value: T, arrivalIndex: number) => Promisable<U>,
  ): Stream<U, E | E2>
  /**
   * Maps successful values with `fn` and transforms errors with `errFn`. Both
   * receive the original value so you can contextualize the mapping.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<number, Error>(async function* () {
   *   yield 1;
   *   throw new Error("failed");
   *   yield 3;
   * });
   *
   * const result = stream.tryMap(
   *   (value) => value * 2,
   *   (err, value) => new Error(`Failed on ${value}: ${err.message}`),
   * );
   * ```
   *
   * @see {@link Stream.map}
   * @see {@link Stream.mapErr}
   */
  tryMap<U, F = never>(
    fn: (value: T, arrivalIndex: number) => Promisable<U>,
    errFn: (error: unknown, value: T, arrivalIndex: number) => Promisable<F>,
  ): Stream<U, E | F>
  /**
   * Similar to `Array.prototype.flatMap`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * When concurrency is greater than 1, results may be emitted out of order.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
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
      arrivalIndex: number,
    ) => Promisable<AsyncIterable<U> | Iterable<U>>,
  ): Stream<U, E>
  /**
   * Similar to `Array.prototype.filter`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
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
   * @see {@link Stream.filterErr}
   */
  filter<U extends T>(
    fn: (value: T, arrivalIndex: number) => value is U,
  ): Stream<U, E>
  filter(
    fn: (value: T, arrivalIndex: number) => Promisable<boolean>,
  ): Stream<T, E>
  /**
   * Runs a side-effect function on each successful value without transforming it. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in place of the original value.
   *
   * @example
   * ```ts
   * const stream = source.tap((value) => console.log("Got:", value));
   * ```
   */
  tap(fn: (value: T, arrivalIndex: number) => Promisable<void>): Stream<T, E>
  /**
   * Runs a side-effect function on each error without transforming it. If the provided function throws an error or returns a rejected promise, the new error replaces the original.
   *
   * @example
   * ```ts
   * const stream = source.tapErr((error) => console.error("Error:", error));
   * ```
   */
  tapErr(fn: (error: E, arrivalIndex: number) => Promisable<void>): Stream<T, E>
  /**
   * Limits the stream to at most `n` successful values. Errors pass through
   * without counting against the limit. After `n` successes are yielded, the
   * stream stops immediately (any pending errors from earlier in the pipeline
   * may still be yielded before stopping).
   *
   * @example
   * ```ts
   * const first3 = source.take(3);
   * ```
   */
  take(n: number): Stream<T, E>
  /**
   * Yields successful values while the predicate returns true. Once the predicate returns false, iteration stops. Errors pass through until the stream is stopped. If the predicate throws, an error result is emitted and iteration stops.
   *
   * @example
   * ```ts
   * const belowTen = source.takeWhile((value) => value < 10);
   * ```
   */
  takeWhile(
    fn: (value: T, arrivalIndex: number) => Promisable<boolean>,
  ): Stream<T, E>
  /**
   * Similar to `Array.prototype.reduce`, but works on the stream of results. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * If any error results are present in the stream, they will be thrown as an
   * `AggregateError` after the stream is exhausted. Use `filterErr(() => false)`
   * upstream to explicitly drop errors if you want to fold only the successes.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
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
   * @throws {AggregateError} If any error results were present in the stream.
   * @see {@link Stream.foldErr}
   */
  fold<U>(
    fn: (acc: U, value: T, arrivalIndex: number) => Promisable<U>,
    initialValue: U,
  ): Promise<U>
  /**
   * Like `fold` but emits the running accumulator after each successful value,
   * allowing downstream operations to react to intermediate states.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<number, Error>(async function* () {
   *   yield 1;
   *   yield 2;
   *   yield 3;
   * });
   *
   * const scanned = stream.scan((sum, n) => sum + n, 0);
   * // Emits: { type: "success", value: 1 }, { type: "success", value: 3 }, { type: "success", value: 6 }
   * ```
   * @see {@link Stream.fold}
   */
  scan<U>(
    fn: (acc: U, value: T, arrivalIndex: number) => Promisable<U>,
    initialValue: U,
  ): Stream<U, E>

  /**
   * Like `scan` but works on the stream of errors. Emits the running accumulator after each error, allowing downstream operations to react to intermediate error states. If the provided function throws an error or returns a rejected promise, the new error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
   *   yield 1;
   *   throw new Error("First error");
   *   yield 2;
   *   throw new Error("Second error");
   * });
   *
   * const errorScan = stream.scanErr((acc, err) => {
   *   return acc ? `${acc}; ${err.message}` : err.message;
   * }, "");
   *
   * for await (const result of errorScan) {
   *   if (result.type === "error") {
   *     console.error("Accumulated error:", result.error);
   *   }
   * }
   * ```
   * @see {@link Stream.foldErr}
   */
  scanErr<F>(
    fn: (acc: F, error: E, arrivalIndex: number) => Promisable<F>,
    initialValue: F,
  ): Stream<T, F>
  /**
   * Similar to `Array.prototype.map`, but works on the stream of errors. If the provided function throws an error or returns a rejected promise, the new error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const mappedErrorStream = stream.mapErr(async (error) => {
   *   return `Mapped error: ${error}`;
   * });
   * ```
   *
   * @see {@link Stream.map}
   */
  mapErr<F>(fn: (error: E, arrivalIndex: number) => Promisable<F>): Stream<T, F>
  /**
   * Similar to `Array.prototype.filter`, but works on the stream of errors. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const filteredErrorStream = stream.filterErr(async (error) => {
   *   return error.includes("Value cannot be 2");
   * });
   * ```
   * @see {@link Stream.filter}
   */
  filterErr<F extends E>(
    fn: (error: E, arrivalIndex: number) => error is F,
  ): Stream<T, F>
  filterErr(
    fn: (error: E, arrivalIndex: number) => Promisable<boolean>,
  ): Stream<T, E>
  /**
   * Similar to `Array.prototype.reduce`, but works on the stream of errors. If the provided function throws an error or returns a rejected promise, the new error will be collected and emitted as an error result in the stream.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
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
   * @see {@link Stream.fold}
   */
  foldErr<F>(
    fn: (acc: F, error: E, arrivalIndex: number) => Promisable<F>,
    initialValue: F,
  ): Promise<F>
  /**
   * Recovers from specific error types by applying the provided function to transform them into successful values. This allows you to handle specific errors gracefully while still collecting other errors in the stream.
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, "aaaah!" | "eeeek!">(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const recoveredStream = stream.recoverWhen(e => e === "aaaah!" as const, e => 42);
   * ```
   */
  recoverWhen<E2 extends E, U>(
    guard: (error: E, arrivalIndex: number) => error is E2,
    fn: (error: E2, arrivalIndex: number) => Promisable<U>,
  ): Stream<T | U, Exclude<E, E2>>
  /**
   * Recovers from all errors by applying the provided function to transform them into successful values. This allows you to handle all errors gracefully while still collecting successful values in the stream.
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const recoveredStream = stream.recover(e => 0);
   * ```
   *
   * Note! If the recovery function itself throws an error or returns a rejected promise, the new error will be emitted as an error result in the stream.
   * This means the type lies in this scenario. Try to keep your recovery simple if you can.
   */
  recover<U>(
    fn: (error: E, arrivalIndex: number) => Promisable<U>,
  ): Stream<T | U, never>
  /**
   * Throws the specified error types if they are encountered in the stream. This allows you to handle specific errors immediately while continuing to process other errors.
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, "aaaah!" | "eeeek!">(async function* () {
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
  ): Stream<T, Exclude<E, E2>>
  /**
   * Returns an async iterable of all successful values emitted by the stream. If any errors were collected during the stream processing, they will be ignored in this iterable.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * for await (const value of stream.successes()) {
   *   console.log("Success:", value);
   * }
   * ```
   */
  successes(): AsyncIterable<T>
  /**
   * Returns an async iterable of all errors collected during the stream processing. If any successful values were emitted during the stream processing, they will be ignored in this iterable.
   *
   * @example
   * ```ts
   * import { Stream } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * for await (const error of stream.errors()) {
   *   console.error("Error:", error);
   * }
   * ```
   */
  errors(): AsyncIterable<E>
  /**
   * Collects all successful values emitted by the stream into an array. If any
   * errors were collected during the stream processing, they will be thrown as
   * an `AggregateError` containing all collected errors.
   *
   * @throws {AggregateError} If any errors were collected during the stream processing.
   */
  collect(): Promise<T[]>
  /**
   * Collects all results into separate `successes` and `errors` arrays. Unlike `collect()`, this never throws.
   *
   * @example
   * ```ts
   * const { successes, errors } = await source.partition();
   * ```
   */
  partition(): Promise<{ successes: T[]; errors: E[] }>
  /**
   * Collects all results emitted by the stream into an array of `Result`
   * objects, which can represent either successful values or errors. This
   * method allows you to see the full outcome of the stream processing,
   * including both successes and errors, without throwing an aggregate error.
   */
  toArray(): Promise<Result<T, E>[]>
  /**
   * Collects consecutive successful values into fixed-size arrays. Errors pass
   * through without breaking the current chunk.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<number, Error>(async function* () {
   *   yield 1;
   *   yield 2;
   *   yield 3;
   *   yield 4;
   *   yield 5;
   * });
   *
   * const chunked = stream.chunks(2);
   * // Emits: { type: "success", value: [1, 2] }, { type: "success", value: [3, 4] }, { type: "success", value: [5] }
   * ```
   */
  chunks(size: number): Stream<T[], E>
  /**
   * Combines this stream with another into tuples, yielding one result per
   * pair of values. The shorter stream determines when zipping completes.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream1 = Source.from<number, never>(async function* () {
   *   yield 1;
   *   yield 2;
   *   yield 3;
   * });
   *
   * const stream2 = Source.from<string, never>(async function* () {
   *   yield "a";
   *   yield "b";
   * });
   *
   * const zipped = stream1.zip(stream2);
   * // Emits: { type: "success", value: [1, "a"] }, { type: "success", value: [2, "b"] }
   * ```
   */
  zip<U, F>(other: Stream<U, F>): Stream<[T, U], E | F>
  /**
   * Merges two streams by interleaving their results. Both streams must have
   * compatible error types. The merged stream yields values from either stream
   * as they become available.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream1 = Source.from<number, never>(async function* () {
   *   yield 1;
   *   yield 3;
   * });
   *
   * const stream2 = Source.from<number, never>(async function* () {
   *   yield 2;
   *   yield 4;
   * });
   *
   * const merged = stream1.merge(stream2);
   * // Emits values in completion order: 1, 2, 3, 4 (order may vary)
   * ```
   */
  merge(other: Stream<T, E>): Stream<T, E>

  /**
   * Splits the stream into `n` separate streams that each receive the same results.
   *
   * If one of the split streams is slower than the others, it will cause backpressure on the source stream and all other splits until it catches up. Use with caution to avoid unintended bottlenecks.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<number, never>(async function* () {
   *   yield 1;
   *   yield 2;
   *   yield 3;
   * });
   *
   * const [streamA, streamB] = stream.splitN(2, 10);
   *
   * for await (const value of streamA) {
   *   console.log("Stream A:", value);
   * }
   *
   * for await (const value of streamB) {
   *   console.log("Stream B:", value);
   * }
   * ```
   */
  splitN(n: 0 | 1, bufferSize: number): [Stream<T, E | PumpError>]
  splitN(
    n: 2,
    bufferSize: number,
  ): [Stream<T, E | PumpError>, Stream<T, E | PumpError>]
  splitN(
    n: 3,
    /**
     * Because `splitN` creates internal buffers to hold values for slower consumers,
     * we force you to specify a buffer size to ensure you're aware of the potential memory implications.
     * If you called this on a stream with the default Infinity buffer size, it would be easy to accidentally create an unbounded buffer that grows indefinitely if one of the split streams is slow or stalls.
     */
    bufferSize: number,
  ): [
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
  ]
  splitN(
    n: 4,
    bufferSize: number,
  ): [
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
  ]
  splitN(n: number, bufferSize: number): Stream<T, E | PumpError>[]

  /**
   * Splits the stream into separate streams based on computed keys. Each result is sent to the stream corresponding to its computed key. If a result's key does not match any of the provided keys, an error result is emitted for that value. The split streams share the same source, so they are not independent; if one split stream is slower than the others, it will cause backpressure on the source stream and all other splits until it catches up. Use with caution to avoid unintended bottlenecks.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<{ type: "a" | "b"; value: number }, never>(async function* () {
   *   yield { type: "a", value: 1 };
   *   yield { type: "b", value: 2 };
   *   yield { type: "a", value: 3 };
   * });
   *
   * const splits = stream.splitBy(
   *   ["a", "b"] as const,
   *   (item) => item.type,
   *   10
   * );
   *
   * await Promise.all([
   *   splits.a.tap(v => console.log("Stream A:", v)).toArray(),
   *   splits.b.tap(v => console.log("Stream B:", v)).toArray(),
   * ]);
   * ```
   *
   * Be mindful of consuming all splits to avoid unintended backpressure.
   * If one of the split streams is slower further down the pipeline, the backpressure will propagate all the way up to the source and affect all other splits, even if they are fast. Always ensure that you consume all split streams at a reasonable pace to keep the data flowing smoothly.
   */
  splitBy<K extends string | number | symbol>(
    keys: readonly K[],
    cb: (value: T, arrivalIndex: number) => Promisable<K>,
    bufferSize: number,
  ): Record<K, Stream<T, E | MissingKeyError | PumpError | NoKeysError>>

  /**
   * Flattens a stream of iterables into a stream of individual values. If the provided function throws an error or returns a rejected promise, the error will be collected and emitted as an error result in the stream.
   * Handles concurrency via the `flatMap` method, so if the inner iterables are produced out of order due to concurrency, the flattened results will reflect that order.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * const stream = Source.from<number, string>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * const flattened = stream.flatten();
   * // If the original stream emitted [1, 2], this will emit 1, then 2 as separate results.
   * ```
   */
  flatten<U>(this: Stream<Iterable<U> | AsyncIterable<U>, E>): Stream<U, E>

  [Symbol.asyncIterator](): AsyncIterator<Result<T, E>>
}

/**
 * An error thrown by the internal pump of `splitN` if one of the split streams throws an error. This is a separate error type to allow users to distinguish between errors from the source stream and errors from the pump itself.
 */
export class PumpError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'PumpError'
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

/**
 * An error thrown by `splitBy` when no key exists for the computed key. This is a separate error type to allow users to distinguish between missing keys and other types of errors.
 */
export class MissingKeyError extends Error {
  constructor(public key: unknown) {
    super(`Missing key: ${String(key)}`)
    this.name = 'MissingKeyError'
  }
}

/**
 * An error thrown by `splitBy` when no keys are provided
 */
export class NoKeysError extends Error {
  constructor() {
    super(`At least one key must be provided for splitBy`)
    this.name = 'NoKeysError'
  }
}
