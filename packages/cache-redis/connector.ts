import { Redis } from 'npm:ioredis@^5'
import type { Redis as RedisClient, RedisOptions } from 'npm:ioredis@^5'
import type { CacheAdapter, CacheConnector } from '@anabranch/cache'
import { RedisCacheAdapter } from './adapter.ts'
import process from 'node:process'

/**
 * Creates a Redis cache connector.
 *
 * @example
 * ```ts
 * const connector = createRedisCache("redis://localhost:6379");
 * // or with options:
 * const connector = createRedisCache({
 *   connection: "redis://localhost:6379",
 *   prefix: "myapp",
 * });
 * ```
 */
export function createRedisCache(
  options?: string | RedisCacheOptions,
): RedisCacheConnector {
  const opts = typeof options === 'string'
    ? { connection: options }
    : (options ?? {
      connection: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    })
  const prefix = opts.prefix ?? 'abc'

  let client: RedisClient | undefined

  return {
    async connect(): Promise<CacheAdapter> {
      if (!client) {
        const conn = opts.connection
        client = typeof conn === 'string' ? new Redis(conn) : new Redis(conn)
        await client.ping()
      }
      return new RedisCacheAdapter(client, prefix)
    },

    async end(): Promise<void> {
      if (client) {
        try {
          await client.quit()
        } catch {
          // Ignore quit errors if connection is already dead
        } finally {
          client.disconnect()
          client = undefined
        }
      }
    },
  }
}

/** Options for creating a Redis cache connector. */
export interface RedisCacheOptions {
  /** Redis connection URL or ioredis options. */
  connection: string | RedisOptions
  /**
   * Key prefix for all cache entries.
   * @default "abc"
   */
  prefix?: string
}

/** Redis cache connector. */
export interface RedisCacheConnector extends CacheConnector {
  connect(): Promise<CacheAdapter>
  end(): Promise<void>
}
