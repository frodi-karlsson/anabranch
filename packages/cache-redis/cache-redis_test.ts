/**
 * Integration tests for cache-redis require a live Redis instance.
 * Set REDIS_URL environment variable to run them (e.g., redis://localhost:6379).
 */
import { assertEquals } from '@std/assert'
import { createRedisCache } from './index.ts'
import { Cache } from '@anabranch/cache'

const REDIS_URL = Deno.env.get('REDIS_URL')

Deno.test('createRedisCache - should return a valid connector', () => {
  const connector = createRedisCache('redis://localhost:6379')
  assertEquals(typeof connector.connect, 'function')
  assertEquals(typeof connector.end, 'function')
})

Deno.test('createRedisCache - should accept options object', () => {
  const connector = createRedisCache({
    connection: { host: 'localhost', port: 6379 },
    prefix: 'test',
  })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test({
  name: 'RedisCache - set and get',
  ignore: !REDIS_URL,
  async fn() {
    const key = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedisCache(REDIS_URL)
    const cache = await Cache.connect(connector).run()

    await cache.set(key, { name: 'Alice' }).run()
    const result = await cache.get<{ name: string }>(key).run()

    assertEquals(result, { name: 'Alice' })

    await cache.delete(key).run()
    await cache.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'RedisCache - get returns null for missing key',
  ignore: !REDIS_URL,
  async fn() {
    const connector = createRedisCache(REDIS_URL)
    const cache = await Cache.connect(connector).run()

    const result = await cache.get('nonexistent-key').run()
    assertEquals(result, null)

    await cache.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'RedisCache - has returns true/false correctly',
  ignore: !REDIS_URL,
  async fn() {
    const key = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedisCache(REDIS_URL)
    const cache = await Cache.connect(connector).run()

    assertEquals(await cache.has(key).run(), false)
    await cache.set(key, 'value').run()
    assertEquals(await cache.has(key).run(), true)

    await cache.delete(key).run()
    await cache.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'RedisCache - TTL expires entry',
  ignore: !REDIS_URL,
  async fn() {
    const key = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedisCache(REDIS_URL)
    const cache = await Cache.connect(connector).run()

    await cache.set(key, 'temporary', { ttl: 100 }).run()
    assertEquals(await cache.get<string>(key).run(), 'temporary')

    await new Promise((r) => setTimeout(r, 200))
    assertEquals(await cache.get<string>(key).run(), null)

    await cache.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'RedisCache - getOrSet computes on miss',
  ignore: !REDIS_URL,
  async fn() {
    const key = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedisCache(REDIS_URL)
    const cache = await Cache.connect(connector).run()

    let computed = 0
    const result = await cache.getOrSet<number>(key, () => {
      computed++
      return 42
    }).run()

    assertEquals(result, 42)
    assertEquals(computed, 1)

    // Second call should hit cache
    const cached = await cache.getOrSet<number>(key, () => {
      computed++
      return 99
    }).run()

    assertEquals(cached, 42)
    assertEquals(computed, 1)

    await cache.delete(key).run()
    await cache.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'RedisCache - delete is idempotent',
  ignore: !REDIS_URL,
  async fn() {
    const connector = createRedisCache(REDIS_URL)
    const cache = await Cache.connect(connector).run()

    // Deleting nonexistent key should not error
    await cache.delete('does-not-exist').run()

    await cache.close().run()
    await connector.end()
  },
})
