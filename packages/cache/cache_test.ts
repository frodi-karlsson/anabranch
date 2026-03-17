import { assertEquals } from '@std/assert'
import { Cache, createInMemory } from './index.ts'

Deno.test('Cache.get - should return null for missing key', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  const result = await cache.get<string>('missing').run()
  assertEquals(result, null)
  await cache.close().run()
})

Deno.test('Cache.set/get - should store and retrieve a value', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  await cache.set('key', { name: 'Alice' }).run()
  const result = await cache.get<{ name: string }>('key').run()
  assertEquals(result, { name: 'Alice' })
  await cache.close().run()
})

Deno.test('Cache.set - should overwrite existing value', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  await cache.set('key', 'first').run()
  await cache.set('key', 'second').run()
  assertEquals(await cache.get<string>('key').run(), 'second')
  await cache.close().run()
})

Deno.test('Cache.delete - should remove a key', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  await cache.set('key', 'value').run()
  await cache.delete('key').run()
  assertEquals(await cache.get<string>('key').run(), null)
  await cache.close().run()
})

Deno.test('Cache.delete - should be idempotent on missing key', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  await cache.delete('nope').run()
  await cache.close().run()
})

Deno.test('Cache.has - should return true for existing key', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  await cache.set('key', 'value').run()
  assertEquals(await cache.has('key').run(), true)
  await cache.close().run()
})

Deno.test('Cache.has - should return false for missing key', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  assertEquals(await cache.has('missing').run(), false)
  await cache.close().run()
})

Deno.test('Cache.set - should respect TTL', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  await cache.set('key', 'value', { ttl: 50 }).run()
  assertEquals(await cache.get<string>('key').run(), 'value')

  await new Promise((r) => setTimeout(r, 80))
  assertEquals(await cache.get<string>('key').run(), null)
  await cache.close().run()
})

Deno.test('Cache.getOrSet - should return existing value without calling fn', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  await cache.set('key', 'existing').run()

  let called = false
  const result = await cache.getOrSet<string>('key', () => {
    called = true
    return 'computed'
  }).run()

  assertEquals(result, 'existing')
  assertEquals(called, false)
  await cache.close().run()
})

Deno.test('Cache.getOrSet - should compute and store on miss', async () => {
  const cache = await Cache.connect(createInMemory()).run()

  const result = await cache.getOrSet<string>('key', () => 'computed').run()

  assertEquals(result, 'computed')
  assertEquals(await cache.get<string>('key').run(), 'computed')
  await cache.close().run()
})

Deno.test('Cache.getOrSet - should pass TTL to set', async () => {
  const cache = await Cache.connect(createInMemory()).run()

  await cache.getOrSet<string>('key', () => 'value', { ttl: 50 }).run()
  assertEquals(await cache.get<string>('key').run(), 'value')

  await new Promise((r) => setTimeout(r, 80))
  assertEquals(await cache.get<string>('key').run(), null)
  await cache.close().run()
})

Deno.test('Cache.getOrSet - should propagate fn errors as task errors', async () => {
  const cache = await Cache.connect(createInMemory()).run()

  const result = await cache.getOrSet<string>('key', () => {
    throw new Error('compute failed')
  }).result()

  assertEquals(result.type, 'error')
  await cache.close().run()
})

Deno.test('Cache - connector.end() should clean up', async () => {
  const connector = createInMemory()
  const cache = await Cache.connect(connector).run()
  await cache.set('key', 'value').run()
  await cache.close().run()
  await connector.end()
})

Deno.test('Cache - should handle complex objects', async () => {
  const cache = await Cache.connect(createInMemory()).run()
  const obj = { users: [{ id: 1, name: 'Alice' }], count: 1 }
  await cache.set('data', obj).run()
  assertEquals(await cache.get('data').run(), obj)
  await cache.close().run()
})
