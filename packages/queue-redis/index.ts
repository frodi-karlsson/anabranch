/**
 * @anabranch/queue-redis
 *
 * Redis adapter for @anabranch/queue using ioredis.
 *
 * ## Usage
 *
 * ```ts
 * import { Queue } from "@anabranch/queue";
 * import { createRedis } from "@anabranch/queue-redis";
 *
 * const connector = createRedis("redis://localhost:6379");
 * const queue = await Queue.connect(connector).run();
 *
 * await queue.send("notifications", { userId: 123 }).run();
 * ```
 *
 * @module
 */
export { createRedis } from "./connector.ts";
export type { RedisConnector, RedisQueueOptions } from "./connector.ts";
export { RedisAdapter } from "./adapter.ts";
