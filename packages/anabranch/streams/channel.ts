import { _StreamImpl } from "./stream.ts";
import type { Result } from "./util.ts";

interface ChannelOptions<T> {
  bufferSize?: number;
  onDrop?: (value: T) => void;
}

class ChannelSource<T, E> {
  private queue: Result<T, E>[] = [];
  private closed = false;
  private consumers: Array<() => void> = [];
  private readonly bufferSize: number;
  private readonly onDrop?: (value: T) => void;

  constructor(options: ChannelOptions<T> = {}) {
    this.bufferSize = Number.isFinite(options.bufferSize)
      ? Math.max(1, options.bufferSize!)
      : Infinity;
    this.onDrop = options.onDrop;
  }

  send(value: T): void {
    if (this.closed) {
      return;
    }

    if (this.queue.length >= this.bufferSize && this.bufferSize !== Infinity) {
      this.onDrop?.(value);
      return;
    }

    this.queue.push({ type: "success", value } as Result<T, E>);
    this.wake();
  }

  fail(error: E): void {
    if (this.closed) {
      return;
    }
    this.queue.push({ type: "error", error } as Result<T, E>);
    this.wake();
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.wake();
  }

  private wake(): void {
    while (this.consumers.length > 0) {
      const consumer = this.consumers.shift();
      if (consumer) consumer();
    }
  }

  async *generator(): AsyncGenerator<Result<T, E>> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }

      if (this.closed && this.queue.length === 0) {
        return;
      }

      if (this.queue.length === 0) {
        await new Promise<void>((resolve) => {
          this.consumers.push(resolve);
        });
      }
    }
  }
}

export class Channel<T, E = never> extends _StreamImpl<T, E> {
  private sourceImpl: ChannelSource<T, E>;

  constructor(options: ChannelOptions<T> = {}) {
    const sourceImpl = new ChannelSource<T, E>(options);
    super(() => sourceImpl.generator(), Infinity, Infinity);
    this.sourceImpl = sourceImpl;
  }

  send(value: T): void {
    this.sourceImpl.send(value);
  }

  fail(error: E): void {
    this.sourceImpl.fail(error);
  }

  close(): void {
    this.sourceImpl.close();
  }
}
