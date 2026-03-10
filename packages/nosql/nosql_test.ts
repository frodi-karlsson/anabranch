import { assertEquals, assertExists } from '@std/assert'
import { Collection, createInMemory, InMemoryQuery } from './index.ts'

interface User {
  name: string
  status: 'active' | 'pending' | 'inactive'
}

Deno.test({
  name: 'Collection.connect - should connect and return a Collection',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    assertExists(users)
    await connector.end()
  },
})

Deno.test({
  name: 'Collection.create - should create with adapter directly',
  async fn() {
    const connector = createInMemory<User, string>()
    const adapter = await connector.connect()
    const users = Collection.create(adapter, 'users')

    assertExists(users)
    await connector.end()
  },
})

Deno.test({
  name: 'Collection.put - should store a document',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await users.put('user-1', { name: 'Alice', status: 'active' }).run()

    const doc = await users.get('user-1').run()
    assertExists(doc)
    assertEquals(doc.name, 'Alice')
    assertEquals(doc.status, 'active')

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.get - should return null for non-existent key',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    const doc = await users.get('non-existent').run()
    assertEquals(doc, null)

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.put - should overwrite existing document',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await users.put('user-1', { name: 'Alice', status: 'active' }).run()
    await users.put('user-1', { name: 'Alice', status: 'inactive' }).run()

    const doc = await users.get('user-1').run()
    assertEquals(doc?.status, 'inactive')

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.delete - should remove a document',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await users.put('user-1', { name: 'Alice', status: 'active' }).run()
    await users.delete('user-1').run()

    const doc = await users.get('user-1').run()
    assertEquals(doc, null)

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.putMany - should store multiple documents',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await users.putMany([
      { key: 'user-1', doc: { name: 'Alice', status: 'active' } },
      { key: 'user-2', doc: { name: 'Bob', status: 'pending' } },
    ]).run()

    const doc1 = await users.get('user-1').run()
    const doc2 = await users.get('user-2').run()

    assertEquals(doc1?.name, 'Alice')
    assertEquals(doc2?.name, 'Bob')

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.find - should yield all documents',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await users.putMany([
      { key: 'user-1', doc: { name: 'Alice', status: 'active' } },
      { key: 'user-2', doc: { name: 'Bob', status: 'pending' } },
      { key: 'user-3', doc: { name: 'Charlie', status: 'active' } },
    ]).run()

    const { successes, errors } = await users.find(() => true).partition()

    assertEquals(errors.length, 0)
    assertEquals(successes.length, 3)

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.find - should filter by predicate',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await users.putMany([
      { key: 'user-1', doc: { name: 'Alice', status: 'active' } },
      { key: 'user-2', doc: { name: 'Bob', status: 'pending' } },
      { key: 'user-3', doc: { name: 'Charlie', status: 'active' } },
    ]).run()

    const { successes } = await users
      .find((u) => u.status === 'active')
      .partition()

    assertEquals(successes.length, 2)
    assertEquals(successes.map((u) => u.name).sort(), ['Alice', 'Charlie'])

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.find - should support concurrent processing',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    for (let i = 0; i < 5; i++) {
      await users.put(`user-${i}`, { name: `User ${i}`, status: 'active' })
        .run()
    }

    const { successes } = await users
      .find(() => true)
      .withConcurrency(3)
      .map(async (user) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return user.name
      })
      .partition()

    assertEquals(successes.length, 5)

    await connector.end()
  },
})

Deno.test({
  name:
    'Collection.get - should throw CollectionGetFailed after connector ended',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await connector.end()

    try {
      await users.get('user-1').run()
      throw new Error('Expected error')
    } catch (e) {
      assertEquals((e as Error).name, 'CollectionGetFailed')
    }
  },
})

Deno.test({
  name: 'Collection - connector.end() should clean up resources',
  async fn() {
    const connector = createInMemory<User, string>()
    const adapter = await connector.connect()

    await connector.end()

    let putError: Error | undefined
    try {
      await adapter.put('user-1', { name: 'Alice', status: 'active' })
    } catch (e) {
      putError = e as Error
    }
    assertExists(putError)
  },
})

Deno.test({
  name: 'Collection.putMany - should throw on error after connector ended',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await connector.end()

    try {
      await users
        .putMany([{ key: 'user-1', doc: { name: 'Alice', status: 'active' } }])
        .run()
      throw new Error('Expected error')
    } catch (e) {
      assertEquals((e as Error).name, 'CollectionPutManyFailed')
    }
  },
})

Deno.test({
  name: 'Collection.find - should emit CollectionFindFailed on adapter error',
  async fn() {
    const connector = createInMemory<User, string>()
    const adapter = await connector.connect()

    const errorAdapter = {
      ...adapter,
      query: async function* (
        _predicate: InMemoryQuery<User>,
      ): AsyncIterable<User> {
        yield { name: 'temp', status: 'active' }
        throw new Error('Query failed')
      },
    }

    const users = Collection.create(errorAdapter, 'users')

    const { errors } = await users.find(() => true).partition()

    assertEquals(errors.length, 1)
    const err = errors[0] as Error & { name?: string }
    assertEquals(err.name, 'CollectionFindFailed')

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.connect - should throw CollectionConnectionFailed on error',
  async fn() {
    const failingConnector: {
      connect(): Promise<never>
      end(): Promise<void>
    } = {
      connect(): Promise<never> {
        return Promise.reject(new Error('Connection refused'))
      },
      end(): Promise<void> {
        return Promise.resolve()
      },
    }

    try {
      await Collection
        .connect(failingConnector, 'users')
        .run()
      throw new Error('Expected error')
    } catch (e) {
      assertEquals((e as Error).name, 'CollectionConnectionFailed')
    }
  },
})

Deno.test({
  name: 'Collection - error types should include collection name',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await connector.end()

    try {
      await users.get('user-1').run()
      throw new Error('Expected error')
    } catch (e) {
      const err = e as Error & { collection?: string }
      assertEquals(err.collection, 'users')
    }
  },
})

Deno.test({
  name: 'Collection - error types should include key for relevant operations',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    await connector.end()

    try {
      await users.get('my-key').run()
      throw new Error('Expected error')
    } catch (e) {
      const err = e as Error & { key?: unknown }
      assertEquals(err.key, 'my-key')
    }

    try {
      await users.put('my-key', { name: 'Alice', status: 'active' }).run()
      throw new Error('Expected error')
    } catch (e) {
      const err = e as Error & { key?: unknown }
      assertEquals(err.key, 'my-key')
    }

    try {
      await users.delete('my-key').run()
      throw new Error('Expected error')
    } catch (e) {
      const err = e as Error & { key?: unknown }
      assertEquals(err.key, 'my-key')
    }
  },
})

Deno.test({
  name: 'Collection - multiple concurrent puts should all succeed',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    const concurrency = 100
    const promises: Promise<void>[] = []
    for (let i = 0; i < concurrency; i++) {
      promises.push(
        users.put(`user-${i}`, { name: `User ${i}`, status: 'active' }).run(),
      )
    }

    await Promise.all(promises)

    const { successes } = await users.find(() => true).partition()
    assertEquals(successes.length, concurrency)

    await connector.end()
  },
})

Deno.test({
  name: 'Collection.find - should handle empty results',
  async fn() {
    const connector = createInMemory<User, string>()
    const users = await Collection.connect(connector, 'users').run()

    const { successes } = await users.find(() => true).partition()
    assertEquals(successes.length, 0)

    await connector.end()
  },
})
