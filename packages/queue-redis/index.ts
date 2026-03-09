/**
 * @anabranch/queue-redis
 *
 * Redis adapter for @anabranch/queue using `ioredis`.
 *
 * Provides a `QueueConnector` implementation backed by Redis, using sorted sets
 * for pending/inflight message tracking and hashes for message data storage.
 * Supports delayed messages, dead letter queues, and visibility timeout.
 *
 * @example
 * ```ts
 * import { Queue } from "@anabranch/queue";
 * import { createRedis } from "@anabranch/queue-redis";
 *
 * const connector = createRedis({
 *   connection: "redis://localhost:6379",
 *   prefix: "my-app",
 *   queues: {
 *     orders: { maxAttempts: 3, deadLetterQueue: "orders-dlq" },
 *   },
 * });
 * const queue = await Queue.connect(connector).run();
 *
 * await queue.send("orders", { orderId: "123", total: 99 }).run();
 * ```
 *
 * @module
 */
export { createRedis } from './connector.ts'
export type { RedisConnector, RedisQueueOptions } from './connector.ts'
export { RedisAdapter } from './adapter.ts'
