import { Channel } from '@anabranch/anabranch'
import type { Annotation } from './annotation.ts'

export interface BatcherConfig<E = never> {
  channel: Channel<Annotation, E>
  batchSize: number
  flushInterval: number
  onFlush: (annotations: Annotation[]) => Promise<void>
  clock?: () => number
}

export class AnnotationBatcher<E = never> {
  private config: BatcherConfig<E>
  private buffer: Annotation[] = []
  private running = false
  private flushing = false
  private flushPromise?: Promise<void>
  private lastFlushTime: number
  private intervalTimer?: number
  private loopPromise?: Promise<void>

  constructor(config: BatcherConfig<E>) {
    if (config.batchSize > 50) {
      throw new Error('batchSize cannot exceed 50')
    }
    this.config = config
    this.lastFlushTime = (config.clock ?? Date.now)()
  }

  start(): void {
    this.running = true
    this.startIntervalCheck()
    this.loopPromise = this.runLoop()
  }

  private startIntervalCheck(): void {
    const clock = this.config.clock ?? Date.now
    const checkInterval = Math.max(
      10,
      Math.min(this.config.flushInterval / 10, 1000),
    )
    this.intervalTimer = setInterval(() => {
      if (!this.running || this.flushing) return
      const now = clock()
      if (
        now - this.lastFlushTime >= this.config.flushInterval &&
        this.buffer.length > 0
      ) {
        this.flush()
      }
    }, checkInterval) as unknown as number
  }

  private stopIntervalCheck(): void {
    if (this.intervalTimer !== undefined) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = undefined
    }
  }

  private async runLoop(): Promise<void> {
    const source = this.config.channel

    try {
      for await (const result of source) {
        if (result.type === 'success') {
          this.buffer.push(result.value)

          if (this.buffer.length >= this.config.batchSize) {
            await this.flush()
          }
        }
      }
    } finally {
      this.stopIntervalCheck()
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) return

    this.flushing = true
    const toFlush = this.buffer
    this.buffer = []
    this.lastFlushTime = (this.config.clock ?? Date.now)()

    try {
      this.flushPromise = this.config.onFlush(toFlush)
      await this.flushPromise
    } finally {
      this.flushing = false
      this.flushPromise = undefined
    }
  }

  async close(): Promise<void> {
    this.running = false
    this.stopIntervalCheck()
    this.config.channel.close()

    if (this.loopPromise) {
      await this.loopPromise
    }

    // Wait for any in-flight flush to complete before draining remaining buffer
    if (this.flushPromise) {
      await this.flushPromise
    }

    if (this.buffer.length > 0) {
      await this.flush()
    }
  }
}
