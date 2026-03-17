import { type Promisable } from '../util/util.ts'
import { _StreamImpl } from '../stream/stream-impl.ts'
import { _ChannelSource } from './channel-source.ts'

/**
 * Channel is a concurrency primitive for communicating between producers and consumers with backpressure support.
 *
 * Producers can send values to the channel using `send()`, and consumers can receive values by iterating over the channel.
 * The channel supports an optional buffer with a configurable size. If the buffer is full, new values will be dropped and an optional `onDrop` callback will be called.
 * Producers can wait for capacity in the channel using `waitForCapacity()`, which resolves when there the total number of buffered and pending values is less than the buffer size or when the channel is closed. If the channel is aborted via the signal, this will reject with an AbortError.
 * The channel can be closed by calling `close()`, which will signal to consumers that no more values will be sent and unblock any waiting producers.
 *
 * @example
 * ```ts
 * import { Channel } from "anabranch";
 *
 * const ch = Channel.create<number>()
 *   .withBufferSize(10)
 *   .withOnDrop((n) => console.log("dropped", n));
 *
 * ch.send(1);
 * ch.send(2);
 * ch.close();
 *
 * for await (const result of ch) {
 *   console.log(result);
 * }
 * ```
 */
export class Channel<T, E = never> extends _StreamImpl<T, E> {
  private sourceImpl: _ChannelSource<T, E>

  private constructor(
    sourceImpl: _ChannelSource<T, E>,
    private options: ChannelConfig<T>,
  ) {
    super(() => sourceImpl.generator(), Infinity, Infinity)
    this.sourceImpl = sourceImpl
  }

  /** Creates a new unbuffered channel. */
  static create<T, E = never>(): Channel<T, E> {
    const options: ChannelConfig<T> = {}
    return new Channel(new _ChannelSource<T, E>(options), options)
  }

  /** Returns a new channel with the given buffer size. */
  withBufferSize(bufferSize: number): Channel<T, E> {
    const next = { ...this.options, bufferSize }
    return new Channel(new _ChannelSource<T, E>(next), next)
  }

  /** Returns a new channel with the given drop callback, invoked when a value is dropped due to a full buffer. */
  withOnDrop(onDrop: (value: T) => void): Channel<T, E> {
    const next = { ...this.options, onDrop }
    return new Channel(new _ChannelSource<T, E>(next), next)
  }

  /** Returns a new channel with the given close callback, invoked when the channel's consumer finishes iterating. */
  withOnClose(onClose: () => Promisable<void>): Channel<T, E> {
    const next = { ...this.options, onClose }
    return new Channel(new _ChannelSource<T, E>(next), next)
  }

  /** Returns a new channel with the given abort signal. When aborted, the channel closes and all waiting producers are unblocked. */
  withSignal(signal: AbortSignal): Channel<T, E> {
    const next = { ...this.options, signal }
    return new Channel(new _ChannelSource<T, E>(next), next)
  }

  /**
   * Send a value to the channel. If the buffer is full, the value will be dropped and the optional `onDrop` callback will be called.
   * If the channel is closed, the value will be ignored.
   */
  send(value: T): void {
    this.sourceImpl.send(value)
  }

  /**
   * Fail the channel with an error. This will signal to consumers that an error has occurred.
   * If the channel is closed, the error will be ignored.
   */
  fail(error: E): void {
    this.sourceImpl.fail(error)
  }

  /**
   * Close the channel. This will signal to consumers that no more values will be sent and unblock any waiting producers.
   * If the channel is already closed, this will have no effect.
   */
  close(): void {
    this.sourceImpl.close()
  }

  /**
   * Wait for capacity in the channel. This resolves when there is capacity in the buffer or when the channel is closed.
   * If the channel is aborted via the signal, this will reject with an AbortError.
   */
  async waitForCapacity(): Promise<void> {
    await this.sourceImpl.waitForCapacity()
  }

  /** Check if the channel is closed. */
  isClosed(): boolean {
    return this.sourceImpl.isClosed()
  }
}

interface ChannelConfig<T> {
  bufferSize?: number
  onDrop?: (value: T) => void
  onClose?: () => Promisable<void>
  signal?: AbortSignal
}
