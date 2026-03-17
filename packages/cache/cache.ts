import { type Promisable, Task } from '@anabranch/anabranch'
import type { CacheAdapter, CacheConnector, SetOptions } from './adapter.ts'
import {
  CacheCloseFailed,
  CacheConnectionFailed,
  CacheDeleteFailed,
  CacheGetFailed,
  CacheSetFailed,
} from './errors.ts'

/**
 * Cache wrapper with Task semantics for composable error handling.
 *
 * @example
 * ```ts
 * import { Cache, createInMemory } from "@anabranch/cache";
 *
 * const cache = await Cache.connect(createInMemory()).run();
 *
 * await cache.set("user:1", { name: "Alice" }, { ttl: 60_000 }).run();
 * const user = await cache.get("user:1").run();
 *
 * // Cache-aside pattern
 * const data = await cache.getOrSet("expensive", () => computeExpensive(), { ttl: 30_000 }).run();
 * ```
 */
export class Cache {
  private constructor(private readonly adapter: CacheAdapter) {}

  /**
   * Connect to a cache via a connector.
   *
   * @example
   * ```ts
   * const cache = await Cache.connect(createInMemory()).run();
   * ```
   */
  static connect(
    connector: CacheConnector,
  ): Task<Cache, CacheConnectionFailed> {
    return Task.of(async () => new Cache(await connector.connect()))
      .mapErr((error) =>
        new CacheConnectionFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /** Release the connection. */
  close(): Task<void, CacheCloseFailed> {
    return Task.of(async () => await this.adapter.close())
      .mapErr((error) =>
        new CacheCloseFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /**
   * Retrieve a value by key. Returns null on cache miss.
   *
   * @example
   * ```ts
   * const user = await cache.get<User>("user:1").run();
   * if (user) console.log(user.name);
   * ```
   */
  get<T>(key: string): Task<T | null, CacheGetFailed> {
    return Task.of(async () => await this.adapter.get(key) as T | null)
      .mapErr((error) =>
        new CacheGetFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /**
   * Store a value with an optional TTL.
   *
   * @example
   * ```ts
   * await cache.set("session:abc", sessionData, { ttl: 3600_000 }).run();
   * ```
   */
  set(
    key: string,
    value: unknown,
    options?: SetOptions,
  ): Task<void, CacheSetFailed> {
    return Task.of(async () => await this.adapter.set(key, value, options))
      .mapErr((error) =>
        new CacheSetFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /** Remove a key. No error if the key does not exist. */
  delete(key: string): Task<void, CacheDeleteFailed> {
    return Task.of(async () => await this.adapter.delete(key))
      .mapErr((error) =>
        new CacheDeleteFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /** Check whether a key exists. */
  has(key: string): Task<boolean, CacheGetFailed> {
    return Task.of(async () => await this.adapter.has(key))
      .mapErr((error) =>
        new CacheGetFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /**
   * Get a value, or compute and store it on cache miss.
   *
   * @example
   * ```ts
   * const user = await cache.getOrSet<User>(
   *   `user:${id}`,
   *   () => db.query("SELECT * FROM users WHERE id = ?", [id]),
   *   { ttl: 60_000 },
   * ).run();
   * ```
   */
  getOrSet<T>(
    key: string,
    fn: () => Promisable<T>,
    options?: SetOptions,
  ): Task<T, CacheGetFailed | CacheSetFailed> {
    return Task.of<T, CacheGetFailed | CacheSetFailed>(async () => {
      const existing = await this.adapter.get(key) as T | null
      if (existing !== null) return existing
      const value = await fn()
      await this.adapter.set(key, value, options)
      return value
    }).mapErr((error) =>
      new CacheGetFailed(
        key,
        (error as Error).message ?? String(error),
        error,
      )
    )
  }
}
