/**
 * Cache primitives with Task semantics for composable error handling.
 *
 * The core abstraction is {@link Cache}, which wraps a {@link CacheAdapter}
 * with typed errors and Task-based operations. Use {@link createInMemory}
 * for testing or implement {@link CacheAdapter} for your cache backend.
 *
 * @example Basic usage
 * ```ts
 * import { Cache, createInMemory } from "@anabranch/cache";
 *
 * const cache = await Cache.connect(createInMemory()).run();
 *
 * await cache.set("user:1", { name: "Alice" }, { ttl: 60_000 }).run();
 * const user = await cache.get<{ name: string }>("user:1").run();
 * ```
 *
 * @example Cache-aside pattern
 * ```ts
 * const user = await cache.getOrSet<User>(
 *   `user:${id}`,
 *   () => db.query("SELECT * FROM users WHERE id = ?", [id]),
 *   { ttl: 60_000 },
 * ).run();
 * ```
 *
 * @module
 */
export { Cache } from './cache.ts'
export type { CacheAdapter, CacheConnector, SetOptions } from './adapter.ts'
export * from './errors.ts'
export { createInMemory } from './in-memory.ts'
export type { InMemoryConnector } from './in-memory.ts'
