import { _AnabranchStreamImpl } from "./stream.ts";
import type { AnabranchResult } from "./util.ts";

export class AnabranchSource<T, E> extends _AnabranchStreamImpl<T, E> {
  private readonly rawSource: () => AsyncGenerator<T>;

  constructor(
    source: () => AsyncGenerator<T>,
    concurrency: number = Infinity,
    bufferSize: number = Infinity,
  ) {
    const wrappedSource = async function* () {
      try {
        for await (const value of source()) {
          yield { type: "success", value } as AnabranchResult<T, E>;
        }
      } catch (error) {
        yield { type: "error", error: error as E } as AnabranchResult<T, E>;
      }
    };

    super(wrappedSource, concurrency, bufferSize);
    this.rawSource = source;
  }

  static from<T, E>(
    source: AsyncIterable<T>,
    concurrency: number = Infinity,
    bufferSize: number = Infinity,
  ): AnabranchSource<T, E> {
    return new AnabranchSource(
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
  withConcurrency(n: number): AnabranchSource<T, E> {
    return new AnabranchSource(this.rawSource, n, this.bufferSize);
  }

  /**
   * Sets the maximum number of buffered results before backpressure is applied to the stream. If the buffer is full, the stream will pause until there is space in the buffer for new results.
   */
  withBufferSize(n: number): AnabranchSource<T, E> {
    return new AnabranchSource(this.rawSource, this.concurrency, n);
  }
}
