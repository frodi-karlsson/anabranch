import { assertEquals, assertExists } from '@std/assert'
import { ErrorResult, Task } from '@anabranch/anabranch'
import { createInMemory, DB, DBAdapter } from './index.ts'

Deno.test('DB - should execute SELECT and return results', async () => {
  const db = DB.from(await createInMemory().connect())
  await db.execute('CREATE TABLE test (id INTEGER, name TEXT)').run()
  await db.execute("INSERT INTO test VALUES (1, 'alice')").run()

  const results = await db.query<{ id: number; name: string }>(
    'SELECT * FROM test',
  ).run()
  assertEquals(results, [{ id: 1, name: 'alice' }])
})

Deno.test('DB.query - should handle WHERE clause with params', async () => {
  const db = DB.from(await createInMemory().connect())
  await db.execute('CREATE TABLE test (id INTEGER)').run()
  await db.execute('INSERT INTO test VALUES (1)').run()
  await db.execute('INSERT INTO test VALUES (2)').run()

  const results = await db.query<{ id: number }>(
    'SELECT * FROM test WHERE id = ?',
    [2],
  ).run()
  assertEquals(results, [{ id: 2 }])
})

Deno.test('DB.execute - INSERT should return affected rows', async () => {
  const db = DB.from(await createInMemory().connect())
  await db.execute('CREATE TABLE test (id INTEGER)').run()
  const affected = await db.execute('INSERT INTO test VALUES (1)').run()
  assertEquals(affected, 1)
})

Deno.test('DB.execute - UPDATE should return affected rows', async () => {
  const db = DB.from(await createInMemory().connect())
  await db.execute('CREATE TABLE test (id INTEGER)').run()
  await db.execute('INSERT INTO test VALUES (1)').run()
  await db.execute('INSERT INTO test VALUES (2)').run()

  const affected = await db.execute('UPDATE test SET id = 3').run()
  assertEquals(affected, 2)
})

Deno.test('DB.execute - DELETE should return affected rows', async () => {
  const db = DB.from(await createInMemory().connect())
  await db.execute('CREATE TABLE test (id INTEGER)').run()
  await db.execute('INSERT INTO test VALUES (1)').run()

  const affected = await db.execute('DELETE FROM test').run()
  assertEquals(affected, 1)
})

Deno.test('DB.stream - should yield rows one at a time', async () => {
  const db = DB.from(await createInMemory().connect())
  await db.execute('CREATE TABLE test (id INTEGER)').run()
  await db.execute('INSERT INTO test VALUES (1)').run()
  await db.execute('INSERT INTO test VALUES (2)').run()

  const rows = await db.stream<{ id: number }>('SELECT * FROM test').collect()
  assertEquals(rows, [{ id: 1 }, { id: 2 }])
})

Deno.test('DB.stream - partition should collect successes and errors', async () => {
  const db = DB.from(await createInMemory().connect())
  await db.execute('CREATE TABLE test (id INTEGER)').run()
  await db.execute('INSERT INTO test VALUES (1)').run()

  const { successes, errors } = await db.stream<{ id: number }>(
    'SELECT * FROM test',
  ).partition()
  assertEquals(successes, [{ id: 1 }])
  assertEquals(errors.length, 0)
})

Deno.test(
  'DB.stream - should buffer results when adapter lacks stream method',
  async () => {
    const mockAdapter: DBAdapter = {
      query: <T>() => Promise.resolve([{ id: 1 }]) as Promise<T[]>,
      execute: () => Promise.resolve(0),
      executeBatch: () => Promise.resolve([]),
      close: () => Promise.resolve(),
    }

    const db = DB.from(mockAdapter)
    const rows = await db.stream<{ id: number }>('SELECT 1').collect()
    assertEquals(rows, [{ id: 1 }])
  },
)

Deno.test('DB.withConnection - should commit on success', async () => {
  const connector = createInMemory()
  const result = await DB.withConnection(connector, (db) => {
    return db.execute('CREATE TABLE test (id INTEGER)').flatMap(() =>
      db.execute('INSERT INTO test VALUES (1)')
    )
  }).run()

  assertEquals(result, 1)
})

Deno.test('DB.withConnection - should rollback on error', async () => {
  const connector = createInMemory()
  const result = await DB.withConnection(connector, (db) => {
    return db.execute('INVALID SQL')
  }).result()

  assertEquals(result.type, 'error')
  assertExists((result as ErrorResult<unknown, unknown>).error)
})

Deno.test('DB.withTransaction - should commit on success', async () => {
  let commitCount = 0
  let rollbackCount = 0

  const mockAdapter: DBAdapter = {
    query: () => Promise.resolve([]),
    execute: (sql: string) => {
      if (sql === 'ROLLBACK') rollbackCount++
      if (sql === 'COMMIT') commitCount++
      return Promise.resolve(0)
    },
    executeBatch: () => Promise.resolve([]),
    close: () => Promise.resolve(),
  }

  const db = DB.from(mockAdapter)
  await db.withTransaction(async (tx) => {
    await tx.execute('INSERT INTO test VALUES (1)').run()
  }).run()

  assertEquals(commitCount, 1, 'Should have committed once')
  assertEquals(rollbackCount, 0, 'Should NOT have rolled back')
})

Deno.test(
  'DB.withTransaction - should not redundant rollback on success',
  async () => {
    let commitCount = 0
    let rollbackCount = 0

    const mockAdapter: DBAdapter = {
      query: () => Promise.resolve([]),
      execute: (sql: string) => {
        if (sql === 'ROLLBACK') rollbackCount++
        if (sql === 'COMMIT') commitCount++
        return Promise.resolve(0)
      },
      executeBatch: () => Promise.resolve([]),
      close: () => Promise.resolve(),
    }

    const db = DB.from(mockAdapter)
    await db.withTransaction(async (tx) => {
      await tx.execute('INSERT INTO test VALUES (1)').run()
    }).run()

    assertEquals(commitCount, 1, 'Should have committed once')
    assertEquals(rollbackCount, 0, 'Should NOT have rolled back')
  },
)

Deno.test(
  'DB.withTransaction - should rollback on failure',
  async () => {
    let rollbackCount = 0

    const mockAdapter: DBAdapter = {
      query: () => Promise.resolve([]),
      execute: (sql: string) => {
        if (sql === 'ROLLBACK') rollbackCount++
        return Promise.resolve(0)
      },
      executeBatch: () => Promise.resolve([]),
      close: () => Promise.resolve(),
    }

    const db = DB.from(mockAdapter)
    try {
      await db.withTransaction(() => {
        throw new Error('fail')
      }).run()
    } catch {
      // expected
    }

    assertEquals(rollbackCount, 1, 'Should have rolled back exactly once')
  },
)

Deno.test(
  'DBTransaction.commit - should not commit twice when already settled',
  async () => {
    let commitCount = 0

    const mockAdapter: DBAdapter = {
      query: () => Promise.resolve([]),
      execute: (sql: string) => {
        if (sql === 'COMMIT') commitCount++
        return Promise.resolve(0)
      },
      executeBatch: () => Promise.resolve([]),
      close: () => Promise.resolve(),
    }

    const db = DB.from(mockAdapter)

    // Manually acquire a transaction so we can call commit() twice
    const tx = await db.withTransaction(async (tx) => {
      await tx.execute('INSERT INTO test VALUES (1)').run()
      // First commit via withTransaction's normal flow
      return tx
    }).run()

    // tx is now settled (committed). Calling commit again should be a no-op.
    await tx.commit().run()

    // Only 1 COMMIT should have been issued, not 2
    assertEquals(commitCount, 1, 'Should have committed exactly once')
  },
)

Deno.test('createInMemory - should return a valid connector', async () => {
  const connector = createInMemory()
  assertEquals(typeof connector.connect, 'function')

  const adapter = await connector.connect()
  assertEquals(typeof adapter.query, 'function')
  assertEquals(typeof adapter.execute, 'function')
  assertEquals(typeof adapter.executeBatch, 'function')
  assertEquals(typeof adapter.close, 'function')
  assertEquals(typeof adapter.stream, 'function')

  await adapter.close()
})

Deno.test(
  'Task.acquireRelease - should acquire, use, and release resource',
  async () => {
    const connector = createInMemory()
    const released: boolean[] = []

    const task = Task.acquireRelease({
      acquire: () =>
        connector.connect().finally(() => {
          released.push(true)
        }),
      release: (adapter) => {
        released.push(true)
        return adapter.close()
      },
      use: (adapter) =>
        Task.of(async () => {
          const db = DB.from(adapter)
          await db.execute('CREATE TABLE users (id INTEGER)').run()
          await db.execute('INSERT INTO users (id) VALUES (1)').run()
          const users = await db.query('SELECT * FROM users').run()
          return users.length
        }),
    })

    const result = await task.run()
    assertEquals(result, 1)
    assertEquals(released.length, 2)
  },
)

Deno.test(
  'DB.withTransaction - should support nested transactions via savepoints',
  async () => {
    const connector = createInMemory()
    const db = DB.from(await connector.connect())

    await db.execute('CREATE TABLE test (val TEXT)').run()

    await db.withTransaction(async (tx1) => {
      await tx1.execute("INSERT INTO test VALUES ('outer')").run()

      // Nested transaction that commits
      await tx1.withTransaction(async (tx2) => {
        await tx2.execute("INSERT INTO test VALUES ('inner-commit')").run()
      }).run()

      // Nested transaction that rolls back
      await tx1.withTransaction(async (tx3) => {
        await tx3.execute("INSERT INTO test VALUES ('inner-rollback')").run()
        throw new Error('rollback inner')
      }).result()

      const results = await tx1.query<{ val: string }>('SELECT * FROM test')
        .run()
      assertEquals(results.length, 2)
      assertEquals(results.map((r) => r.val).sort(), [
        'inner-commit',
        'outer',
      ])
    }).run()

    const finalResults = await db.query<{ val: string }>('SELECT * FROM test')
      .run()
    assertEquals(finalResults.length, 2)
  },
)
