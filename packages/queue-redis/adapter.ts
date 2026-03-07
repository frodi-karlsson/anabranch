import type { Redis as RedisClient } from "npm:ioredis@^5";
import type {
  NackOptions,
  QueueAdapter,
  QueueMessage,
  QueueOptions,
  SendOptions,
} from "@anabranch/queue";
import { QueueReceiveFailed, QueueSendFailed } from "@anabranch/queue";

interface StoredMessage<T> {
  id: string;
  data: T;
  attempt: number;
  timestamp: number;
  metadata?: {
    headers?: Record<string, string>;
    [key: string]: unknown;
  };
}

interface AdapterOptions {
  redis: RedisClient;
  prefix: string;
  queueConfigs: Record<string, QueueOptions>;
  defaultVisibility: number;
  defaultMaxAttempts: number;
}

interface QueueConfig {
  maxAttempts: number;
  visibilityTimeout: number;
  deadLetterQueue: string;
}

export class RedisAdapter implements QueueAdapter {
  private readonly redis: RedisClient;
  private readonly prefix: string;
  private readonly queueConfigs: Record<string, QueueOptions>;
  private readonly configs: Map<string, QueueConfig> = new Map();
  private readonly defaultVisibility: number;
  private readonly defaultMaxAttempts: number;

  constructor(options: AdapterOptions) {
    this.redis = options.redis;
    this.prefix = options.prefix;
    this.queueConfigs = options.queueConfigs;
    this.defaultVisibility = options.defaultVisibility;
    this.defaultMaxAttempts = options.defaultMaxAttempts;

    for (const [name, config] of Object.entries(options.queueConfigs)) {
      this.configs.set(name, {
        maxAttempts: config.maxAttempts ?? this.defaultMaxAttempts,
        visibilityTimeout: config.visibilityTimeout ?? this.defaultVisibility,
        deadLetterQueue: config.deadLetterQueue ?? "",
      });
    }
  }

  private getConfig(queue: string): QueueConfig {
    if (!this.configs.has(queue)) {
      this.configs.set(queue, {
        maxAttempts: this.defaultMaxAttempts,
        visibilityTimeout: this.defaultVisibility,
        deadLetterQueue: "",
      });
    }
    return this.configs.get(queue)!;
  }

  private key(queue: string, suffix: string): string {
    return `${this.prefix}:${queue}:${suffix}`;
  }

  async send<T>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string> {
    try {
      const id = crypto.randomUUID();
      const now = Date.now();
      const delayMs = options?.delayMs ??
        (options?.scheduledAt
          ? Math.max(0, options.scheduledAt.getTime() - now)
          : 0);

      const envelope: StoredMessage<T> = {
        id,
        data,
        attempt: 1,
        timestamp: now,
        metadata: options?.headers ? { headers: options.headers } : undefined,
      };

      const availableAt = now + delayMs;
      const target = delayMs > 0
        ? this.key(queue, "delayed")
        : this.key(queue, "pending");

      await this.redis.pipeline()
        .hset(this.key(queue, "data"), id, JSON.stringify(envelope))
        .zadd(target, availableAt, id)
        .exec();

      return id;
    } catch (error) {
      throw new QueueSendFailed(
        error instanceof Error ? error.message : String(error),
        queue,
        error,
      );
    }
  }

  async receive<T>(
    queue: string,
    count?: number,
  ): Promise<QueueMessage<T>[]> {
    try {
      const now = Date.now();
      const n = count ?? 10;

      await this.expireInflight(queue);

      const delayedKey = this.key(queue, "delayed");
      const pendingKey = this.key(queue, "pending");

      const ready = await this.redis.zrangebyscore(delayedKey, 0, now);
      if (ready.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const id of ready) {
          pipeline.zadd(pendingKey, now, id);
          pipeline.zrem(delayedKey, id);
        }
        await pipeline.exec();
      }

      const ids = await this.redis.zrangebyscore(
        pendingKey,
        0,
        now,
        "LIMIT",
        0,
        n,
      );
      if (ids.length === 0) return [];

      const inflightKey = this.key(queue, "inflight");
      const dataKey = this.key(queue, "data");

      const pipeline = this.redis.pipeline();
      for (const id of ids) {
        pipeline.zrem(pendingKey, id);
        pipeline.hset(inflightKey, id, String(now));
        pipeline.hget(dataKey, id);
      }
      const results = await pipeline.exec();

      const messages: QueueMessage<T>[] = [];
      for (let i = 0; i < ids.length; i++) {
        const raw = results![i * 3 + 2]?.[1] as string | null;
        if (!raw) continue;

        const envelope: StoredMessage<T> = JSON.parse(raw);

        messages.push({
          id: envelope.id,
          data: envelope.data,
          attempt: envelope.attempt,
          timestamp: envelope.timestamp,
          metadata: envelope.metadata,
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

  async ack(queue: string, ...ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.hdel(this.key(queue, "inflight"), id);
      pipeline.hdel(this.key(queue, "data"), id);
    }
    await pipeline.exec();
  }

  async nack(
    queue: string,
    id: string,
    options?: NackOptions,
  ): Promise<void> {
    const inflightKey = this.key(queue, "inflight");
    const dataKey = this.key(queue, "data");
    const config = this.getConfig(queue);

    await this.redis.hdel(inflightKey, id);

    if (options?.deadLetter && config.deadLetterQueue) {
      await this.routeToDlq(queue, id, config.deadLetterQueue);
      return;
    }

    if (options?.requeue) {
      const raw = await this.redis.hget(dataKey, id);
      if (!raw) return;

      const envelope: StoredMessage<unknown> = JSON.parse(raw);

      envelope.attempt += 1;

      if (envelope.attempt > config.maxAttempts && config.deadLetterQueue) {
        await this.routeToDlq(queue, id, config.deadLetterQueue);
        return;
      }

      const delay = options.delay ?? 0;
      const target = delay > 0
        ? this.key(queue, "delayed")
        : this.key(queue, "pending");
      const score = Date.now() + delay;

      await this.redis.pipeline()
        .hset(dataKey, id, JSON.stringify(envelope))
        .zadd(target, score, id)
        .exec();
      return;
    }

    await this.redis.hdel(dataKey, id);
  }

  async close(): Promise<void> {
    // Connection is managed by the connector
  }

  private async expireInflight(queue: string): Promise<void> {
    const inflightKey = this.key(queue, "inflight");
    const pendingKey = this.key(queue, "pending");
    const config = this.getConfig(queue);
    const cutoff = Date.now() - config.visibilityTimeout;

    const entries = await this.redis.hgetall(inflightKey);
    const expired: string[] = [];

    for (const [id, deliveredAt] of Object.entries(entries)) {
      if (Number(deliveredAt) <= cutoff) {
        expired.push(id);
      }
    }

    if (expired.length > 0) {
      const pipeline = this.redis.pipeline();
      for (const id of expired) {
        pipeline.hdel(inflightKey, id);
        pipeline.zadd(pendingKey, Date.now(), id);
      }
      await pipeline.exec();
    }
  }

  /**
   * Routes a message to the dead letter queue when attempt > maxAttempts.
   * This mirrors the in-memory adapter behavior: messages are only DLQ'd
   * after exceeding maxAttempts, not when equal to it. This means a message
   * with maxAttempts=2 will be delivered 2 times before being DLQ'd on the
   * 3rd delivery attempt.
   */
  private async routeToDlq(
    sourceQueue: string,
    id: string,
    dlqName: string,
  ): Promise<void> {
    const dataKey = this.key(sourceQueue, "data");
    const raw = await this.redis.hget(dataKey, id);
    if (!raw) return;

    const original = JSON.parse(raw);
    const dlqEnvelope = {
      id: crypto.randomUUID(),
      data: {
        originalId: id,
        originalQueue: sourceQueue,
        data: original.data,
        attempt: original.attempt,
        timestamp: original.timestamp,
      },
      attempt: 1,
      timestamp: Date.now(),
    };

    await this.redis.pipeline()
      .hset(
        this.key(dlqName, "data"),
        dlqEnvelope.id,
        JSON.stringify(dlqEnvelope),
      )
      .zadd(this.key(dlqName, "pending"), Date.now(), dlqEnvelope.id)
      .hdel(dataKey, id)
      .exec();
  }
}
