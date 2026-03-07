import { Source, Task } from "@anabranch/anabranch";
import type {
  QueueAdapter,
  QueueConnector,
  QueueMessage,
  SendOptions,
  StreamAdapter,
} from "./adapter.ts";
import {
  QueueAckFailed,
  QueueCloseFailed,
  QueueConnectionFailed,
  QueueMaxAttemptsExceeded,
  QueueReceiveFailed,
  QueueSendFailed,
} from "./errors.ts";

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timerId = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timerId);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Queue wrapper with Task/Stream semantics for error-tolerant message processing.
 *
 * @example Basic usage
 * ```ts
 * import { Queue, createInMemory } from "@anabranch/queue";
 *
 * const connector = createInMemory();
 * const queue = await Queue.connect(connector).run();
 *
 * await queue.send("notifications", { userId: 123 }).run();
 * await queue.ack("notifications", msg.id).run();
 *
 * await queue.close().run();
 * ```
 *
 * @example Stream with concurrent processing
 * ```ts
 * const { successes, errors } = await queue.stream("notifications")
 *   .withConcurrency(5)
 *   .map(async (msg) => await sendEmail(msg.data))
 *   .tapErr((err) => logError(err))
 *   .partition();
 * ```
 *
 * @example Continuous streaming
 * ```ts
 * const ac = new AbortController();
 *
 * queue.continuousStream("notifications", { signal: ac.signal })
 *   .withConcurrency(5)
 *   .tap(async (msg) => await processMessage(msg))
 *   .collect();
 *
 * ac.abort();
 * ```
 */
export class Queue {
  constructor(private readonly adapter: QueueAdapter) {}

  /**
   * Connect to a queue via a connector.
   *
   * @example
   * ```ts
   * const queue = await Queue.connect(createInMemory()).run();
   * ```
   */
  static connect(
    connector: QueueConnector,
  ): Task<Queue, QueueConnectionFailed> {
    return Task.of(async () => {
      try {
        return new Queue(await connector.connect());
      } catch (error) {
        throw new QueueConnectionFailed(
          error instanceof Error ? error.message : String(error),
          error,
        );
      }
    });
  }

  /**
   * Release the connection back to its source (e.g., pool).
   *
   * @example
   * ```ts
   * await queue.close().run();
   * ```
   */
  close(): Task<void, QueueCloseFailed> {
    return Task.of(async () => {
      try {
        await this.adapter.close();
      } catch (error) {
        throw new QueueCloseFailed(
          error instanceof Error ? error.message : String(error),
          error,
        );
      }
    });
  }

  /**
   * Send a message to a queue.
   *
   * @example Send with delay
   * ```ts
   * const id = await queue.send("notifications", payload, { delayMs: 30_000 }).run();
   * ```
   */
  send<T>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Task<string, QueueSendFailed> {
    return Task.of(async () => {
      try {
        return await this.adapter.send(queue, data, options);
      } catch (error) {
        throw new QueueSendFailed(
          error instanceof Error ? error.message : String(error),
          queue,
          error,
        );
      }
    });
  }

  /**
   * Send multiple messages to a queue in batch.
   *
   * @example Batch send
   * ```ts
   * const ids = await queue.sendBatch("notifications", [
   *   { to: "user1@example.com", subject: "Welcome!" },
   *   { to: "user2@example.com", subject: "Welcome!" },
   * ]).run();
   * ```
   *
   * @example Parallel batch send (for adapters that support it)
   * ```ts
   * const ids = await queue.sendBatch("notifications", items, { parallel: true }).run();
   * ```
   */
  sendBatch<T>(
    queue: string,
    data: T[],
    options?: SendOptions & { parallel?: boolean },
  ): Task<string[], QueueSendFailed> {
    return Task.of(async () => {
      const ids: string[] = [];

      if (options?.parallel) {
        const promises = data.map((item) =>
          this.adapter.send(queue, item, options).catch((e) => {
            throw new QueueSendFailed(
              e instanceof Error ? e.message : String(e),
              queue,
              e,
            );
          })
        );
        const results = await Promise.all(promises);
        return results;
      }

      for (const item of data) {
        const id = await this.adapter.send(queue, item, options);
        ids.push(id);
      }
      return ids;
    });
  }

  /**
   * Stream messages from a queue for memory-efficient concurrent processing.
   *
   * Messages are delivered one at a time but can be processed concurrently
   * using `withConcurrency()`. Errors are collected alongside successes,
   * allowing the stream to continue processing while you decide how to handle
   * failures later.
   *
   * @example
   * ```ts
   * const { successes, errors } = await queue.stream("notifications")
   *   .withConcurrency(10)
   *   .map(async (msg) => await sendNotification(msg.data))
   *   .tapErr((err) => console.error("Failed:", err))
   *   .partition();
   * ```
   */
  stream<T>(
    queue: string,
    options?: { count?: number; concurrency?: number },
  ): Source<QueueMessage<T>, QueueReceiveFailed> {
    const adapter = this.adapter;
    const count = options?.count ?? 10;
    return Source.from<QueueMessage<T>, QueueReceiveFailed>(
      async function* () {
        try {
          const messages = await adapter.receive<T>(queue, count);
          for (const msg of messages) {
            yield msg;
          }
        } catch (error) {
          throw new QueueReceiveFailed(
            error instanceof Error ? error.message : String(error),
            queue,
            error,
          );
        }
      },
    ).withConcurrency(options?.concurrency ?? Infinity);
  }

  /**
   * Continuous stream that polls for messages until stopped.
   *
   * Uses broker-native subscribe if available (StreamAdapter), otherwise
   * falls back to polling-based implementation. Errors from the adapter
   * are emitted as error results, allowing pipeline-style error handling
   * with .recover(), .tapErr(), etc. Use an AbortSignal to stop.
   *
   * @example
   * ```ts
   * const ac = new AbortController();
   *
   * queue.continuousStream("notifications", { signal: ac.signal, count: 5 })
   *   .withConcurrency(10)
   *   .tap(async (msg) => await processMessage(msg))
   *   .tapErr((err) => console.error("Receive failed:", err.message))
   *   .collect();
   *
   * ac.abort();
   * ```
   */
  continuousStream<T>(
    queue: string,
    options?: { count?: number; signal?: AbortSignal; prefetch?: number },
  ): Source<QueueMessage<T>, QueueReceiveFailed> {
    const count = options?.count ?? 10;
    const signal = options?.signal;
    const prefetch = options?.prefetch;
    const adapter = this.adapter;

    const isStreamAdapter = "subscribe" in adapter;

    return Source.fromResults<QueueMessage<T>, QueueReceiveFailed>(
      async function* () {
        if (isStreamAdapter) {
          const streamAdapter = adapter as StreamAdapter;
          const iterable = streamAdapter.subscribe<T>(queue, {
            signal,
            prefetch,
          });

          for await (const msg of iterable) {
            if (signal?.aborted) return;
            yield { type: "success", value: msg };
          }
          return;
        }

        const baseDelay = 50;
        let currentDelay = baseDelay;

        while (!signal?.aborted) {
          try {
            const messages = await adapter.receive<T>(queue, count);
            currentDelay = baseDelay;

            for (const msg of messages) {
              if (signal?.aborted) return;
              yield { type: "success", value: msg };
            }

            if (!signal?.aborted && messages.length === 0) {
              await sleep(currentDelay, signal);
              currentDelay = Math.min(currentDelay * 2, 5000);
            }
          } catch (error) {
            if (signal?.aborted) return;
            const queueError = new QueueReceiveFailed(
              error instanceof Error ? error.message : String(error),
              queue,
              error,
            );
            yield { type: "error", error: queueError };
          }
        }
      },
    );
  }

  /**
   * Acknowledge one or more messages as successfully processed.
   *
   * @example
   * ```ts
   * await queue.ack("notifications", msg1.id, msg2.id, msg3.id).run();
   * ```
   */
  ack(queue: string, ...ids: string[]): Task<void, QueueAckFailed> {
    return Task.of(async () => {
      if (ids.length === 0) return;
      try {
        await this.adapter.ack(queue, ...ids);
      } catch (error) {
        throw new QueueAckFailed(
          error instanceof Error ? error.message : String(error),
          queue,
          ids[0],
          error,
        );
      }
    });
  }

  /**
   * Negative acknowledgment - indicates processing failure.
   *
   * @example Requeue with delay
   * ```ts
   * await queue.nack("notifications", msg.id, { requeue: true, delay: 5_000 }).run();
   * ```
   *
   * @example Route to dead letter queue
   * ```ts
   * await queue.nack("notifications", msg.id, { deadLetter: true }).run();
   * ```
   */
  nack(
    queue: string,
    id: string,
    options?: {
      requeue?: boolean;
      delay?: number;
      deadLetter?: boolean;
    },
  ): Task<void, QueueAckFailed | QueueMaxAttemptsExceeded> {
    return Task.of(async () => {
      try {
        await this.adapter.nack(queue, id, options);
      } catch (error) {
        throw new QueueAckFailed(
          error instanceof Error ? error.message : String(error),
          queue,
          id,
          error,
        );
      }
    });
  }
}

/** Re-export QueueMessage for convenience */
export type { QueueMessage } from "./adapter.ts";
