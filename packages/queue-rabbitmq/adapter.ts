import { Buffer } from "node:buffer";
import type { Channel, ConsumeMessage, Message } from "npm:amqplib@^0.10";
import type {
  NackOptions,
  QueueMessage,
  QueueOptions,
  SendOptions,
  StreamAdapter,
} from "@anabranch/queue";
import { QueueReceiveFailed, QueueSendFailed } from "@anabranch/queue";

interface StoredEnvelope<T> {
  id: string;
  data: T;
  timestamp: number;
  attempt: number;
  headers?: Record<string, string>;
}

interface QueueConfig {
  maxAttempts: number;
  deadLetterQueue: string;
}

interface AdapterOptions {
  channel: Channel;
  prefix: string;
  queueConfigs: Record<string, QueueOptions>;
  defaultPrefetch: number;
}

export class RabbitMQAdapter implements StreamAdapter {
  private readonly channel: Channel;
  private readonly prefix: string;
  private readonly queueConfigs: Record<string, QueueOptions>;
  private readonly defaultPrefetch: number;
  private readonly configs: Map<string, QueueConfig> = new Map();

  private readonly inflight: Map<string, Message> = new Map();

  private readonly assertedQueues = new Set<string>();
  private readonly dlqNames = new Set<string>();
  private readonly pendingAssertions = new Map<string, Promise<void>>();

  constructor(options: AdapterOptions) {
    this.channel = options.channel;
    this.prefix = options.prefix;
    this.queueConfigs = options.queueConfigs;
    this.defaultPrefetch = options.defaultPrefetch;
  }

  private key(queue: string): string {
    return `${this.prefix}.${queue}`;
  }

  private getConfig(queue: string): QueueConfig {
    if (!this.configs.has(queue)) {
      const raw = this.queueConfigs[queue] ?? {};
      const dlqName = raw.deadLetterQueue
        ? this.key(raw.deadLetterQueue)
        : `${this.key(queue)}.failed`;
      this.dlqNames.add(dlqName);
      this.configs.set(queue, {
        maxAttempts: raw.maxAttempts ?? 3,
        deadLetterQueue: dlqName,
      });
    }
    return this.configs.get(queue)!;
  }

  private async assertQueue(queue: string): Promise<void> {
    const queueName = this.key(queue);
    if (this.assertedQueues.has(queueName)) return;

    const pending = this.pendingAssertions.get(queueName);
    if (pending) {
      return pending;
    }

    const isDlq = this.dlqNames.has(queueName);

    let assertionPromise: Promise<void>;
    if (isDlq) {
      assertionPromise = (async () => {
        await this.channel.assertQueue(queueName, { durable: true });
        this.assertedQueues.add(queueName);
      })();
    } else {
      const config = this.getConfig(queue);
      const dlqName = config.deadLetterQueue;

      assertionPromise = (async () => {
        if (!this.assertedQueues.has(dlqName)) {
          await this.channel.assertQueue(dlqName, { durable: true });
          this.assertedQueues.add(dlqName);
        }

        await this.channel.assertQueue(queueName, {
          durable: true,
          arguments: {
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": dlqName,
          },
        });
        this.assertedQueues.add(queueName);
      })();
    }

    this.pendingAssertions.set(queueName, assertionPromise);
    try {
      await assertionPromise;
    } finally {
      this.pendingAssertions.delete(queueName);
    }
  }

  async send<T>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string> {
    try {
      await this.assertQueue(queue);

      const id = crypto.randomUUID();
      const envelope: StoredEnvelope<T> = {
        id,
        data,
        timestamp: Date.now(),
        attempt: 1,
        headers: options?.headers,
      };

      if (options?.delayMs || options?.scheduledAt) {
        throw new Error(
          "Delayed messages require the rabbitmq-delayed-message-exchange plugin. " +
            "Install it or use a broker that supports x-delayed-message.",
        );
      }

      const content = Buffer.from(JSON.stringify(envelope));
      this.channel.sendToQueue(this.key(queue), content, {
        persistent: true,
        messageId: id,
        headers: options?.headers ?? {},
        priority: options?.priority,
      });

      return id;
    } catch (error) {
      throw new QueueSendFailed(
        error instanceof Error ? error.message : String(error),
        queue,
        error,
      );
    }
  }

  async receive<T>(queue: string, count = 10): Promise<QueueMessage<T>[]> {
    try {
      await this.assertQueue(queue);

      const queueName = this.key(queue);
      const messages: QueueMessage<T>[] = [];
      for (let i = 0; i < count; i++) {
        const msg = await this.channel.get(queueName, { noAck: false });
        if (!msg) break;

        const envelope: StoredEnvelope<T> = JSON.parse(msg.content.toString());

        this.inflight.set(envelope.id, msg);

        messages.push({
          id: envelope.id,
          data: envelope.data,
          attempt: envelope.attempt,
          timestamp: envelope.timestamp,
          metadata: {
            headers: envelope.headers,
          },
        });
      }

      return messages;
    } catch (error) {
      throw new QueueReceiveFailed(
        error instanceof Error ? error.message : String(error),
        queue,
        error,
      );
    }
  }

  ack(_queue: string, ...ids: string[]): Promise<void> {
    for (const id of ids) {
      const msg = this.inflight.get(id);
      if (msg) {
        this.channel.ack(msg);
        this.inflight.delete(id);
      }
    }
    return Promise.resolve();
  }

  nack(
    _queue: string,
    id: string,
    _options?: NackOptions,
  ): Promise<void> {
    const msg = this.inflight.get(id);
    if (!msg) return Promise.resolve();

    this.inflight.delete(id);

    if (_options?.deadLetter) {
      this.channel.nack(msg, false, false);
      return Promise.resolve();
    }

    if (_options?.requeue) {
      const envelope: StoredEnvelope<unknown> = JSON.parse(
        msg.content.toString(),
      );
      envelope.attempt += 1;

      const content = Buffer.from(JSON.stringify(envelope));

      this.channel.sendToQueue(
        msg.fields.routingKey,
        content,
        {
          persistent: true,
          messageId: envelope.id,
          headers: msg.properties.headers,
          priority: msg.properties.priority,
        },
      );

      this.channel.ack(msg);
      return Promise.resolve();
    }

    this.channel.nack(msg, false, false);
    return Promise.resolve();
  }

  async close(): Promise<void> {
    await this.channel.close();
  }

  subscribe<T>(
    queue: string,
    options?: { signal?: AbortSignal; prefetch?: number },
  ): AsyncIterable<QueueMessage<T>> {
    const channel = this.channel;
    const inflight = this.inflight;
    const assertQueueFn = this.assertQueue.bind(this);
    const key = this.key(queue);
    const prefetch = options?.prefetch ?? this.defaultPrefetch;
    const signal = options?.signal;

    return {
      [Symbol.asyncIterator]() {
        let consumerTag: string | undefined;
        let resolve:
          | ((value: IteratorResult<QueueMessage<T>>) => void)
          | undefined;
        let reject: ((reason: unknown) => void) | undefined;
        const pending: QueueMessage<T>[] = [];
        let done = false;

        const enqueue = (msg: QueueMessage<T>) => {
          if (resolve) {
            const r = resolve;
            resolve = undefined;
            r({ value: msg, done: false });
          } else {
            pending.push(msg);
          }
        };

        const finish = () => {
          done = true;
          if (resolve) {
            resolve({
              value: undefined as unknown as QueueMessage<T>,
              done: true,
            });
          }
        };

        const start = async () => {
          try {
            await assertQueueFn(queue);
            await channel.prefetch(prefetch);

            const { consumerTag: tag } = await channel.consume(
              key,
              (raw: ConsumeMessage | null) => {
                if (!raw) {
                  finish();
                  return;
                }

                const envelope: StoredEnvelope<T> = JSON.parse(
                  raw.content.toString(),
                );
                inflight.set(envelope.id, raw);

                enqueue({
                  id: envelope.id,
                  data: envelope.data,
                  attempt: envelope.attempt,
                  timestamp: envelope.timestamp,
                  metadata: { headers: envelope.headers },
                });
              },
              { noAck: false },
            );

            consumerTag = tag;

            signal?.addEventListener("abort", () => {
              channel.cancel(consumerTag!).then(finish);
            }, { once: true });
          } catch (error) {
            finish();
            if (reject) {
              reject(error);
            }
          }
        };

        const startPromise = start();

        return {
          async next(): Promise<IteratorResult<QueueMessage<T>>> {
            try {
              await startPromise;

              if (pending.length > 0) {
                return { value: pending.shift()!, done: false };
              }

              if (done) {
                return {
                  value: undefined as unknown as QueueMessage<T>,
                  done: true,
                };
              }

              return new Promise((res, rej) => {
                resolve = res;
                reject = rej;
              });
            } catch {
              return {
                value: undefined as unknown as QueueMessage<T>,
                done: true,
              };
            }
          },

          async return(): Promise<IteratorResult<QueueMessage<T>>> {
            if (consumerTag) {
              await channel.cancel(consumerTag);
            }
            finish();
            return {
              value: undefined as unknown as QueueMessage<T>,
              done: true,
            };
          },
        };
      },
    };
  }
}
