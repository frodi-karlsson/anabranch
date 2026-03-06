import { _StreamImpl } from "./stream.ts";
import type { Result } from "./util.ts";

/**
 * The entry point for creating a {@link Stream}. Wraps an async generator so
 * that yielded values become success results and any thrown error becomes a
 * single error result.
 *
 * Use {@link Source.from} to create a source from an existing `AsyncIterable`
 * or generator function. Use {@link Source.withConcurrency} and
 * {@link Source.withBufferSize} to configure parallel execution.
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
 * const results = await stream.collect();
 * ```
 */
export class Source<T, E> extends _StreamImpl<T, E> {
  private readonly rawSource: () => AsyncGenerator<T>;

  /**
   * @param source An async generator function. Each yielded value becomes a
   * success result; any thrown error becomes an error result and terminates
   * the source.
   * @param concurrency Maximum number of concurrent operations. Defaults to `Infinity`.
   * @param bufferSize Maximum number of buffered results before backpressure is applied. Defaults to `Infinity`.
   */
  private constructor(
    source: () => AsyncGenerator<T>,
    concurrency: number = Infinity,
    bufferSize: number = Infinity,
  ) {
    const wrappedSource = async function* () {
      try {
        for await (const value of source()) {
          yield { type: "success", value } as Result<T, E>;
        }
      } catch (error) {
        yield { type: "error", error: error as E } as Result<T, E>;
      }
    };

    super(wrappedSource, concurrency, bufferSize);
    this.rawSource = source;
  }

  /**
   * Creates a {@link Source} from an existing `AsyncIterable` or async
   * generator function. Each value emitted becomes a success result; any
   * thrown error becomes an error result.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * // From a generator function
   * const stream = Source.from<number, Error>(async function* () {
   *   yield 1;
   *   yield 2;
   * });
   *
   * // From an AsyncIterable
   * async function* generate() {
   *   yield 1;
   *   yield 2;
   * }
   * const stream2 = Source.from<number, Error>(generate());
   * ```
   */
  static from<T, E>(source: AsyncIterable<T>): Source<T, E>;
  static from<T, E>(fn: () => AsyncGenerator<T>): Source<T, E>;
  static from<T, E>(
    source: AsyncIterable<T> | (() => AsyncGenerator<T>),
  ): Source<T, E> {
    if (typeof source === "function") {
      return new Source(source);
    }
    return new Source(
      async function* () {
        yield* source;
      },
    );
  }

  /**
   * Sets the maximum number of concurrent operations for the stream.
   */
  withConcurrency(n: number): Source<T, E> {
    return new Source(this.rawSource, n, this.bufferSize);
  }

  /**
   * Sets the maximum number of buffered results before backpressure is applied to the stream. If the buffer is full, the stream will pause until there is space in the buffer for new results.
   */
  withBufferSize(n: number): Source<T, E> {
    return new Source(this.rawSource, this.concurrency, n);
  }
}
