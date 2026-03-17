/**
 * Redis adapter for {@link @anabranch/cache}.
 *
 * Uses ioredis for Redis connectivity with JSON serialization and
 * native TTL support via `SET ... PX`.
 *
 * @example
 * ```ts
 * import { Cache } from "@anabranch/cache";
 * import { createRedisCache } from "@anabranch/cache-redis";
 *
 * const cache = await Cache.connect(createRedisCache("redis://localhost:6379")).run();
 * await cache.set("key", { value: 1 }, { ttl: 60_000 }).run();
 * const data = await cache.get("key").run();
 * ```
 *
 * @module
 */
export { RedisCacheAdapter } from './adapter.ts'
export { createRedisCache } from './connector.ts'
export type { RedisCacheConnector, RedisCacheOptions } from './connector.ts'
