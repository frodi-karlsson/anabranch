import { _StreamImpl } from '../stream/stream.ts'
import type { Result } from '../util/util.ts'
import type { Task } from '../task/task.ts'

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
  /**
   * @param source An async generator function. Each yielded value becomes a
   * success result; any thrown error becomes an error result and terminates
   * the source.
   * @param concurrency Maximum number of concurrent operations. Defaults to `Infinity`.
   * @param bufferSize Maximum number of buffered results before backpressure is applied. Defaults to `Infinity`.
   */
  private constructor(
    private readonly resultSource: () => AsyncGenerator<Result<T, E>>,
    concurrency: number = Infinity,
    bufferSize: number = Infinity,
  ) {
    super(resultSource, concurrency, bufferSize)
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
  static from<T, E>(source: AsyncIterable<T>): Source<T, E>
  static from<T, E>(fn: () => AsyncGenerator<T>): Source<T, E>
  static from<T, E>(
    source: AsyncIterable<T> | (() => AsyncGenerator<T>),
  ): Source<T, E> {
    const fn = typeof source === 'function' ? source : async function* () {
      yield* source
    }

    const resultSource = async function* () {
      try {
        for await (const value of fn()) {
          yield { type: 'success', value } as Result<T, E>
        }
      } catch (error) {
        yield { type: 'error', error: error as E } as Result<T, E>
      }
    }

    return new Source(resultSource)
  }
  /**
   * Creates a {@link Source} from an async generator that yields {@link Result}
   * values directly. This is useful when you want to yield both successes and
   * errors from the source without terminating it on the first error.
   */
  static fromResults<T, E>(
    source: () => AsyncGenerator<Result<T, E>>,
  ): Source<T, E> {
    return new Source(source)
  }

  /**
   * Creates a {@link Source} from a Task.
   */
  static fromTask<T, E>(task: Task<T, E>): Source<T, E> {
    return Source.fromResults<T, E>(async function* () {
      yield await task.result()
    })
  }

  /**
   * Creates a {@link Source} from an array of values.
   */
  static fromArray<T>(items: T[]): Source<T, never> {
    return Source.from(async function* () {
      yield* items
    })
  }

  /**
   * Creates a {@link Source} that emits a range of numbers from `start` (inclusive) to `end` (exclusive).
   * Each number is emitted as a success result.
   */
  static fromRange(start: number, end: number): Source<number, never> {
    return Source.from(async function* () {
      for (let i = start; i < end; i++) {
        yield i
      }
    })
  }

  /**
   * Sets the maximum number of concurrent operations for the stream.
   */
  withConcurrency(n: number): Source<T, E> {
    return new Source(this.resultSource, n, this.bufferSize)
  }

  /**
   * Sets the maximum number of buffered results before backpressure is applied to the stream. If the buffer is full, the stream will pause until there is space in the buffer for new results.
   */
  withBufferSize(n: number): Source<T, E> {
    return new Source(this.resultSource, this.concurrency, n)
  }
}
