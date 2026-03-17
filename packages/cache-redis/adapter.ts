import type { Redis as RedisClient } from 'npm:ioredis@^5'
import type { CacheAdapter, SetOptions } from '@anabranch/cache'

/** Redis-backed cache adapter using GET/SET/DEL with optional TTL via PX. */
export class RedisCacheAdapter implements CacheAdapter {
  constructor(
    private readonly redis: RedisClient,
    private readonly prefix: string,
  ) {}

  async get(key: string): Promise<unknown | null> {
    const raw = await this.redis.get(this.key(key))
    if (raw === null) return null
    return JSON.parse(raw)
  }

  async set(key: string, value: unknown, options?: SetOptions): Promise<void> {
    const k = this.key(key)
    const json = JSON.stringify(value)
    if (options?.ttl) {
      await this.redis.set(k, json, 'PX', options.ttl)
    } else {
      await this.redis.set(k, json)
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key))
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(this.key(key))) === 1
  }

  close(): Promise<void> {
    return Promise.resolve()
  }

  private key(key: string): string {
    return `${this.prefix}:${key}`
  }
}
