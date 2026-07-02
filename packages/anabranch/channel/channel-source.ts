import { Promisable, Result } from '../util/util.ts'

export class _ChannelSource<T, E> {
  private queue: Result<T, E>[] = []
  private head = 0
  private closed = false
  private consumers: Array<() => void> = []
  private producers: Array<() => void> = []
  private readonly bufferSize: number
  private readonly onDrop?: (value: T) => void
  private readonly onClose?: () => Promisable<void>
  private readonly abortHandler?: () => void
  private readonly signal?: AbortSignal
  private started = false

  constructor(options: _ChannelOptions<T> = {}) {
    this.bufferSize = Number.isFinite(options.bufferSize)
      ? Math.max(1, options.bufferSize!)
      : Infinity
    this.onDrop = options.onDrop
    this.onClose = options.onClose
    this.signal = options.signal

    this.abortHandler = () => {
      this.closed = true
      this.wakeConsumers()
      const currentProducers = this.producers
      this.producers = []
      for (const producer of currentProducers) {
        producer()
      }
    }

    if (this.signal) {
      if (this.signal.aborted) {
        this.abortHandler()
      } else {
        this.signal.addEventListener('abort', this.abortHandler, {
          once: true,
        })
      }
    }
  }

  private queueSize(): number {
    return this.queue.length - this.head
  }

  /**
   * Send a value, blocking until capacity is available. Resolves silently
   * if the channel is closed or aborted (the value is dropped) — this is
   * Go-like: no rejection, the producer should check `isClosed()` if it
   * needs to distinguish delivery from close.
   *
   * Completion order across concurrent senders is not strictly FIFO —
   * fast-path sends (capacity immediately available) bypass the producer
   * queue entirely.
   */
  async send(value: T): Promise<void> {
    this.started = true
    if (this.closed) return

    while (
      !this.closed && this.queueSize() >= this.bufferSize &&
      this.bufferSize !== Infinity
    ) {
      await this.waitForCapacity()
    }
    if (this.closed) return

    this.queue.push({ type: 'success', value } as Result<T, E>)
    this.wakeConsumers()
  }

  /**
   * Sync fire-and-forget send. Returns true if the value was enqueued, false
   * if the buffer was full (onDrop is invoked) or the channel was closed.
   */
  trySend(value: T): boolean {
    this.started = true
    if (this.closed) return false

    if (this.queueSize() >= this.bufferSize && this.bufferSize !== Infinity) {
      this.onDrop?.(value)
      return false
    }

    this.queue.push({ type: 'success', value } as Result<T, E>)
    this.wakeConsumers()
    return true
  }

  fail(error: E): void {
    this.started = true
    if (this.closed) return

    this.queue.push({ type: 'error', error } as Result<T, E>)
    this.wakeConsumers()
  }

  close(): void {
    this.started = true
    if (this.closed) return
    this.closed = true
    if (this.signal && this.abortHandler) {
      this.signal.removeEventListener('abort', this.abortHandler)
    }
    this.wakeConsumers()
    const currentProducers = this.producers
    this.producers = []
    for (const producer of currentProducers) {
      producer()
    }
  }

  isClosed(): boolean {
    return this.closed
  }

  /** Returns true after any of send, fail, close, waitForCapacity, or generator has been called. */
  isStarted(): boolean {
    return this.started
  }

  private wakeConsumers(): void {
    const currentConsumers = this.consumers
    this.consumers = []
    for (const consumer of currentConsumers) {
      consumer()
    }
  }

  /**
   * Wait for capacity in the channel. Resolves when there is capacity in the
   * buffer or when the channel is closed or aborted (resolves silently, never
   * rejects).
   */
  waitForCapacity(): Promise<void> {
    this.started = true
    if (this.closed) {
      return Promise.resolve()
    }
    if (this.queueSize() < this.bufferSize || this.bufferSize === Infinity) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.producers.push(resolve)
    })
  }

  async *generator(): AsyncGenerator<Result<T, E>> {
    this.started = true
    try {
      while (true) {
        while (this.queueSize() > 0) {
          const item = this.queue[this.head]
          this.queue[this.head] = undefined as unknown as Result<T, E>
          this.head++

          if (this.head > 256 && this.head * 2 >= this.queue.length) {
            this.queue.splice(0, this.head)
            this.head = 0
          }

          const producer = this.producers.shift()
          if (producer) producer()

          yield item
        }

        if (this.closed) return

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

export interface _ChannelOptions<T> {
  bufferSize?: number
  onDrop?: (value: T) => void
  onClose?: () => Promisable<void>
  signal?: AbortSignal
}
