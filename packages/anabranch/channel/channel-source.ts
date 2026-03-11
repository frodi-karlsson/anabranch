import { Promisable, Result } from '../util/util.ts'

export class _ChannelSource<T, E> {
  private queue: Result<T, E>[] = []
  private head = 0
  private closed = false
  private consumers: Array<() => void> = []
  private producers: Array<() => void> = []
  private readonly bufferSize: number
  private readonly onDrop?: (value: T) => Promisable<void>
  private readonly onClose?: () => Promisable<void>

  constructor(options: _ChannelOptions<T> = {}) {
    this.bufferSize = Number.isFinite(options.bufferSize)
      ? Math.max(1, options.bufferSize!)
      : Infinity
    this.onDrop = options.onDrop
    this.onClose = options.onClose

    const handleAbort = () => {
      this.closed = true
      this.wakeConsumers()
      // Swap array to resolve in O(1)
      const currentProducers = this.producers
      this.producers = []
      for (const producer of currentProducers) {
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

  private queueSize(): number {
    return this.queue.length - this.head
  }

  send(value: T): void {
    if (this.closed) return

    if (this.queueSize() >= this.bufferSize && this.bufferSize !== Infinity) {
      this.onDrop?.(value)
      return
    }

    this.queue.push({ type: 'success', value } as Result<T, E>)
    this.wake()
  }

  fail(error: E): void {
    if (this.closed) return

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
    const currentConsumers = this.consumers
    this.consumers = []
    for (const consumer of currentConsumers) {
      consumer()
    }
  }

  private wake(): void {
    this.wakeConsumers()
    const currentProducers = this.producers
    this.producers = []
    for (const producer of currentProducers) {
      producer()
    }
  }

  waitForCapacity(): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.queueSize() < this.bufferSize || this.bufferSize === Infinity) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.producers.push(resolve)
    })
  }

  async *generator(): AsyncGenerator<Result<T, E>> {
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

          const producer = this.producers.pop()
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
  onDrop?: (value: T) => Promisable<void>
  onClose?: () => Promisable<void>
  signal?: AbortSignal
}
