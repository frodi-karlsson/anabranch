import { Promisable } from '@anabranch/anabranch'
import { _StreamImpl } from '../stream/stream.ts'
import type { Result } from '../util/util.ts'

class ChannelSource<T, E> {
  private queue: Result<T, E>[] = []
  private closed = false
  private consumers: Array<() => void> = []
  private producers: Array<() => void> = []
  private readonly bufferSize: number
  private readonly onDrop?: (value: T) => Promisable<void>
  private readonly onClose?: () => Promisable<void>

  constructor(options: ChannelOptions<T> = {}) {
    this.bufferSize = Number.isFinite(options.bufferSize)
      ? Math.max(1, options.bufferSize!)
      : Infinity
    this.onDrop = options.onDrop
    this.onClose = options.onClose
    const handleAbort = () => {
      this.closed = true
      this.wakeConsumers()
      for (const producer of this.producers) {
        producer()
      }
    }
    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort()
      } else {
        options.signal.addEventListener('abort', handleAbort, { once: true })
      }
    }
  }

  send(value: T): void {
    if (this.closed) {
      return
    }

    if (this.queue.length >= this.bufferSize && this.bufferSize !== Infinity) {
      this.onDrop?.(value)
      return
    }

    this.queue.push({ type: 'success', value } as Result<T, E>)
    this.wake()
  }

  fail(error: E): void {
    if (this.closed) {
      return
    }

    this.queue.push({ type: 'error', error } as Result<T, E>)
    this.wake()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.wake()
  }

  isClosed(): boolean {
    return this.closed
  }

  private wakeConsumers(): void {
    while (this.consumers.length > 0) {
      const consumer = this.consumers.shift()
      if (consumer) consumer()
    }
  }

  private wake(): void {
    this.wakeConsumers()

    while (this.producers.length > 0) {
      const producer = this.producers.shift()
      if (producer) producer()
    }
  }
  waitForCapacity(): Promise<void> {
    if (this.closed) {
      return Promise.resolve()
    }
    if (this.queue.length < this.bufferSize || this.bufferSize === Infinity) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.producers.push(() => resolve())
    })
  }

  async *generator(): AsyncGenerator<Result<T, E>> {
    try {
      while (true) {
        while (this.queue.length > 0) {
          const item = this.queue.shift()!

          if (this.producers.length > 0) {
            const producer = this.producers.shift()
            if (producer) producer()
          }

          yield item
        }

        if (this.closed) {
          return
        }
        await new Promise<void>((resolve) => {
          this.consumers.push(resolve)
        })
      }
    } finally {
      this.close()
      await this.onClose?.()
    }
  }
}

/**
 * Channel is a concurrency primitive for communicating between producers and consumers with backpressure support.
 *
 * Producers can send values to the channel using `send()`, and consumers can receive values by iterating over the channel.
 * The channel supports an optional buffer with a configurable size. If the buffer is full, new values will be dropped and an optional `onDrop` callback will be called.
 * Producers can wait for capacity in the channel using `waitForCapacity()`, which resolves when there the total number of buffered and pending values is less than the buffer size or when the channel is closed. If the channel is aborted via the signal, this will reject with an AbortError.
 * The channel can be closed by calling `close()`, which will signal to consumers that no more values will be sent and unblock any waiting producers.
 */
export class Channel<T, E = never> extends _StreamImpl<T, E> {
  private sourceImpl: ChannelSource<T, E>

  constructor(options: ChannelOptions<T> = {}) {
    const sourceImpl = new ChannelSource<T, E>(options)
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

interface ChannelOptions<T> {
  bufferSize?: number
  onDrop?: (value: T) => Promisable<void>
  onClose?: () => Promisable<void>
  signal?: AbortSignal
}
