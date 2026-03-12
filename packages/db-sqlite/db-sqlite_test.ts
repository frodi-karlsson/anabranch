/**
 * Integration tests for db-sqlite.
 * Uses in-memory database by default for fast testing.
 */
import { assertEquals } from '@std/assert'
import { ErrorResult, Task } from '@anabranch/anabranch'
import { DB } from '@anabranch/db'
import { createSqlite } from './index.ts'

Deno.test('createSqlite - should return a valid connector', () => {
  const connector = createSqlite()
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createSqlite - should accept filename option', () => {
  const connector = createSqlite({ filename: ':memory:' })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createSqlite - should accept custom filename', () => {
  const connector = createSqlite({ filename: '/tmp/test.db' })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createSqlite.connect - should return adapter with all methods', async () => {
  const connector = createSqlite()
  try {
    const adapter = await connector.connect()

    assertEquals(typeof adapter.query, 'function')
    assertEquals(typeof adapter.execute, 'function')
    assertEquals(typeof adapter.close, 'function')

    await adapter.close()
  } finally {
    await connector.end()
  }
})

Deno.test('DB - should execute SELECT and return results', async () => {
  const connector = createSqlite()

  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

    const result = await DB.withConnection(
      connector,
      (db) =>
        Task.of(async () => {
          await db
            .execute(
              `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`,
            )
            .run()
          await db
            .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
            .run()
          await db
            .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
            .run()

          const users = await db.query<{ id: number; name: string }>(
            `SELECT * FROM ${table} ORDER BY id`,
          ).run()

          return users
        }),
    ).run()

    assertEquals(result.length, 2)
    assertEquals(result[0].name, 'Alice')
    assertEquals(result[1].name, 'Bob')
  } finally {
    await connector.end()
  }
})

Deno.test('DB - should handle WHERE clause with parameters', async () => {
  const connector = createSqlite()

  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

    const result = await DB.withConnection(
      connector,
      (db) =>
        Task.of(async () => {
          await db
            .execute(
              `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`,
            )
            .run()
          await db
            .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
            .run()
          await db
            .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
            .run()

          const users = await db.query<{ id: number; name: string }>(
            `SELECT * FROM ${table} WHERE name = ?`,
            ['Alice'],
          ).run()

          return users
        }),
    ).run()

    assertEquals(result.length, 1)
    assertEquals(result[0].name, 'Alice')
  } finally {
    await connector.end()
  }
})

Deno.test('DB.execute - should return affected row count', async () => {
  const connector = createSqlite()

  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

    await DB.withConnection(connector, (db) =>
      Task.of(async () => {
        await db
          .execute(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`)
          .run()

        const insertAffected = await db
          .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
          .run()

        assertEquals(insertAffected, 1)

        const updateAffected = await db
          .execute(
            `UPDATE ${table} SET name = 'Bob' WHERE name = ?`,
            ['Alice'],
          )
          .run()

        assertEquals(updateAffected, 1)

        const deleteAffected = await db
          .execute(`DELETE FROM ${table} WHERE name = ?`, ['Bob'])
          .run()

        assertEquals(deleteAffected, 1)
      })).run()
  } finally {
    await connector.end()
  }
})

Deno.test('DB.withTransaction - should commit on success', async () => {
  const connector = createSqlite()

  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

    const result = await DB.withConnection(
      connector,
      (db) =>
        db.withTransaction(async (tx) => {
          await tx
            .execute(
              `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`,
            )
            .run()
          await tx
            .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
            .run()
          await tx
            .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
            .run()

          return db
            .query<{ id: number; name: string }>(`SELECT * FROM ${table}`)
            .run()
        }),
    ).run()

    assertEquals(result.length, 2)
  } finally {
    await connector.end()
  }
})

Deno.test('DB.withTransaction - should rollback on error', async () => {
  const connector = createSqlite()

  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

    let threw = false
    let errorMsg = ''

    try {
      await DB.withConnection(
        connector,
        (db) =>
          db.withTransaction(async (tx) => {
            await tx
              .execute(
                `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT UNIQUE)`,
              )
              .run()
            await tx
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run()
            await tx
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run()
          }),
      ).run()
    } catch (e) {
      threw = true
      errorMsg = (e as Error).message
    }

    assertEquals(threw, true, `Expected error, got: ${errorMsg}`)
    assertEquals(errorMsg.includes('UNIQUE constraint'), true)
  } finally {
    await connector.end()
  }
})

Deno.test('createSqlite - should share database instance across connections', async () => {
  const connector = createSqlite()

  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

    await DB.withConnection(connector, (db) =>
      Task.of(async () => {
        await db
          .execute(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`)
          .run()
        await db
          .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
          .run()
      })).run()

    const result = await DB.withConnection(
      connector,
      (db) =>
        Task.of(() =>
          db
            .query<{ id: number; name: string }>(
              `SELECT * FROM ${table}`,
            )
            .run()
        ),
    ).run()

    assertEquals(result.length, 1)
    assertEquals(result[0].name, 'Alice')
  } finally {
    await connector.end()
  }
})

Deno.test('createSqlite - end() should close the database', async () => {
  const connector = createSqlite()

  await connector.end()
})

Deno.test('createSqlite - multiple connections share same database', async () => {
  const connector = createSqlite()

  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

    const adapter1 = await connector.connect()
    await adapter1.execute(
      `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`,
    )
    await adapter1.execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
    await adapter1.close()

    const adapter2 = await connector.connect()
    const result = await adapter2.query<{ id: number; name: string }>(
      `SELECT * FROM ${table}`,
    )
    await adapter2.close()

    assertEquals(result.length, 1)
    assertEquals(result[0].name, 'Alice')
  } finally {
    await connector.end()
  }
})

import { ConstraintViolation } from '@anabranch/db'

Deno.test('db-sqlite - should throw ConstraintViolation on duplicate key', async () => {
  const connector = createSqlite()
  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
    await DB.withConnection(connector, (db) =>
      Task.of(async () => {
        await db.execute(
          `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT UNIQUE)`,
        ).run()
        await db.execute(`INSERT INTO ${table} (id, name) VALUES (1, 'Alice')`)
          .run()

        const result = await db.execute(
          `INSERT INTO ${table} (id, name) VALUES (1, 'Alice')`,
        ).result()
        assertEquals(result.type, 'error')
        assertEquals(
          (result as ErrorResult<unknown, unknown>).error instanceof
            ConstraintViolation,
          true,
        )
      })).run()
  } finally {
    await connector.end()
  }
})

Deno.test('db-sqlite - should support executeBatch', async () => {
  const connector = createSqlite()
  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
    await DB.withConnection(connector, (db) =>
      Task.of(async () => {
        await db.execute(
          `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`,
        ).run()

        const results = await db.executeBatch(
          `INSERT INTO ${table} (name) VALUES (?)`,
          [['Alice'], ['Bob'], ['Charlie']],
        ).run()

        assertEquals(results, [1, 1, 1])
        const users = await db.query(`SELECT * FROM ${table}`).run()
        assertEquals(users.length, 3)
      })).run()
  } finally {
    await connector.end()
  }
})

Deno.test('db-sqlite - should support streaming', async () => {
  const connector = createSqlite()
  try {
    const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
    await DB.withConnection(connector, (db) =>
      Task.of(async () => {
        await db.execute(
          `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, name TEXT)`,
        ).run()
        await db.executeBatch(
          `INSERT INTO ${table} (name) VALUES (?)`,
          [['Alice'], ['Bob']],
        ).run()

        const rows = await db.stream<{ id: number; name: string }>(
          `SELECT * FROM ${table} ORDER BY name`,
        )
          .collect()
        assertEquals(rows.length, 2)
        assertEquals(rows[0].name, 'Alice')
        assertEquals(rows[1].name, 'Bob')
      })).run()
  } finally {
    await connector.end()
  }
})
