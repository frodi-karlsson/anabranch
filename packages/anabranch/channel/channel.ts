import { _StreamImpl } from '../stream/stream.ts'
import { _ChannelOptions, _ChannelSource } from './channel-source.ts'

/**
 * Channel is a concurrency primitive for communicating between producers and consumers with backpressure support.
 *
 * Producers can send values to the channel using `send()`, and consumers can receive values by iterating over the channel.
 * The channel supports an optional buffer with a configurable size. If the buffer is full, new values will be dropped and an optional `onDrop` callback will be called.
 * Producers can wait for capacity in the channel using `waitForCapacity()`, which resolves when there the total number of buffered and pending values is less than the buffer size or when the channel is closed. If the channel is aborted via the signal, this will reject with an AbortError.
 * The channel can be closed by calling `close()`, which will signal to consumers that no more values will be sent and unblock any waiting producers.
 */
export class Channel<T, E = never> extends _StreamImpl<T, E> {
  private sourceImpl: _ChannelSource<T, E>

  constructor(options: _ChannelOptions<T> = {}) {
    const sourceImpl = new _ChannelSource<T, E>(options)
    super(() => sourceImpl.generator(), Infinity, Infinity)
    this.sourceImpl = sourceImpl
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

/**
 * Error thrown when a channel is aborted via the signal. This is used to distinguish between a normal channel close and an abort signal.
 */
export class ChannelAbortError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'AbortError'
  }
}
