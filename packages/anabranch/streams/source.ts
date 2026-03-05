import { _StreamImpl } from "./stream.ts";
import type { Result } from "./util.ts";

/**
 * The entry point for creating a {@link Stream}. Wraps an async generator so
 * that yielded values become success results and any thrown error becomes a
 * single error result.
 *
 * Use {@link Source.from} to create a source from an existing `AsyncIterable`.
 * Use {@link Source.withConcurrency} and {@link Source.withBufferSize} to
 * configure parallel execution.
 *
 * @example
 * ```ts
 * import { Source } from "anabranch";
 *
 * const stream = new Source<number, Error>(async function* () {
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
  constructor(
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
   * Creates a {@link Source} from an existing `AsyncIterable`. Each value
   * emitted by the iterable becomes a success result; any thrown error becomes
   * an error result.
   *
   * @example
   * ```ts
   * import { Source } from "anabranch";
   *
   * async function* generate() {
   *   yield 1;
   *   yield 2;
   * }
   *
   * const stream = Source.from<number, Error>(generate());
   * ```
   */
  static from<T, E>(
    source: AsyncIterable<T>,
    concurrency: number = Infinity,
    bufferSize: number = Infinity,
  ): Source<T, E> {
    return new Source(
      async function* () {
        yield* source;
      },
      concurrency,
      bufferSize,
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
