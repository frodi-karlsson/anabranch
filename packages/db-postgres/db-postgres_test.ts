/**
 * Integration tests for db-postgres require a live PostgreSQL database.
 * Set POSTGRES_URL or PGHOST environment variables to run them.
 * CI uses GitHub Actions service containers for this.
 */
import { assertEquals, assertInstanceOf } from '@std/assert'
import { ErrorResult, Task } from '@anabranch/anabranch'
import { ConstraintViolation, DB, ListenFailed } from '@anabranch/db'
import { createPostgres } from './index.ts'

const POSTGRES_URL = Deno.env.get('POSTGRES_URL') ||
  (Deno.env.get('PGHOST') &&
    `postgresql://${Deno.env.get('PGUSER') ?? 'postgres'}:${
      Deno.env.get('PGPASSWORD') ?? ''
    }@${Deno.env.get('PGHOST')}:${Deno.env.get('PGPORT') ?? '5432'}/${
      Deno.env.get('PGDATABASE') ?? 'postgres'
    }`)

Deno.test('createPostgres - should return a valid connector', () => {
  const connector = createPostgres({
    connectionString: 'postgresql://user:pass@localhost:5432/testdb',
  })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createPostgres - should accept connection string', () => {
  const connector = createPostgres({
    connectionString: 'postgresql://user:pass@localhost:5432/testdb',
  })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createPostgres - should accept individual options', () => {
  const connector = createPostgres({
    host: 'localhost',
    port: 5432,
    user: 'testuser',
    password: 'testpass',
    database: 'testdb',
  })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createPostgres - should accept pool options', () => {
  const connector = createPostgres({
    connectionString: 'postgresql://user:pass@localhost:5432/testdb',
    max: 20,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
  })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createPostgres - should use environment variables as defaults', () => {
  const connector = createPostgres()
  assertEquals(typeof connector.connect, 'function')
})

Deno.test({
  name: 'createPostgres.connect - should return adapter with all methods',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const adapter = await connector.connect()

      assertEquals(typeof adapter.query, 'function')
      assertEquals(typeof adapter.execute, 'function')
      assertEquals(typeof adapter.close, 'function')
      assertEquals(typeof adapter.stream, 'function')

      await adapter.close()
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB - should execute SELECT and return results',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const result = await DB.withConnection(
        connector,
        (db) =>
          Task.of(async () => {
            await db
              .execute(
                `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT)`,
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

            assertEquals(users.length, 2)
            assertEquals(users[0].name, 'Alice')
            assertEquals(users[1].name, 'Bob')
            return users
          }),
      ).run()

      assertEquals(result.length, 2)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB - should handle WHERE clause with parameters',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const result = await DB.withConnection(
        connector,
        (db) =>
          Task.of(async () => {
            await db
              .execute(
                `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT)`,
              )
              .run()
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run()
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
              .run()

            const users = await db.query<{ id: number; name: string }>(
              `SELECT * FROM ${table} WHERE name = $1`,
              ['Alice'],
            ).run()

            assertEquals(users.length, 1)
            assertEquals(users[0].name, 'Alice')
            return users
          }),
      ).run()

      assertEquals(result.length, 1)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB.execute - should return affected row count',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      await DB.withConnection(
        connector,
        (db) =>
          Task.of(async () => {
            await db
              .execute(
                `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT)`,
              )
              .run()

            const insertAffected = await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run()

            assertEquals(insertAffected, 1)

            const updateAffected = await db
              .execute(
                `UPDATE ${table} SET name = 'Bob' WHERE name = $1`,
                ['Alice'],
              )
              .run()

            assertEquals(updateAffected, 1)

            const deleteAffected = await db
              .execute(`DELETE FROM ${table} WHERE name = $1`, ['Bob'])
              .run()

            assertEquals(deleteAffected, 1)
          }),
      ).run()
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB.stream - should yield rows one at a time',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const users: { id: number; name: string }[] = []

      await DB.withConnection(
        connector,
        (db) =>
          Task.of(async () => {
            await db
              .execute(
                `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT)`,
              )
              .run()
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run()
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
              .run()

            for await (
              const row of db.stream<{ id: number; name: string }>(
                `SELECT * FROM ${table} ORDER BY id`,
              )
            ) {
              if (row.type === 'success') {
                users.push(row.value)
              }
            }

            return users
          }),
      ).run()

      assertEquals(users.length, 2)
      assertEquals(users[0].name, 'Alice')
      assertEquals(users[1].name, 'Bob')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB.withTransaction - should commit on success',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const result = await DB.withConnection(
        connector,
        (db) =>
          db.withTransaction(async (tx) => {
            await tx
              .execute(
                `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT)`,
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
  },
})

Deno.test({
  name: 'DB.withTransaction - should rollback on error',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
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
                  `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT UNIQUE)`,
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
      assertEquals(errorMsg.includes('duplicate key'), true)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'db-postgres - should throw ConstraintViolation on duplicate key',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
      await DB.withConnection(connector, (db) =>
        Task.of(async () => {
          await db.execute(
            `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT UNIQUE)`,
          ).run()
          await db.execute(`INSERT INTO ${table} (name) VALUES ('Alice')`).run()

          const result = await db.execute(
            `INSERT INTO ${table} (name) VALUES ('Alice')`,
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
  },
})

Deno.test({
  name:
    'PostgresConnector.listen - should fail for channel names exceeding 63 bytes',
  async fn() {
    const connector = createPostgres({
      connectionString: 'postgresql://user:pass@localhost:5432/testdb',
    })
    const result = await connector.listen('a'.repeat(64)).result()
    assertEquals(result.type, 'error')
    if (result.type === 'error') {
      assertInstanceOf(result.error, ListenFailed)
    }
  },
})

Deno.test({
  name:
    'PostgresConnector.notify - should fail for channel names exceeding 63 bytes',
  async fn() {
    const connector = createPostgres({
      connectionString: 'postgresql://user:pass@localhost:5432/testdb',
    })
    const result = await connector.notify('a'.repeat(64), 'payload').result()
    assertEquals(result.type, 'error')
    if (result.type === 'error') {
      assertInstanceOf(result.error, ListenFailed)
    }
  },
})

Deno.test({
  name:
    'PostgresConnector.notify - should deliver a notification to a listener',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const channel = `test_${crypto.randomUUID().replace(/-/g, '_')}`
      const ch = await connector.listen(channel).run()

      await connector.notify(channel, 'from-notify').run()

      const notifications = await ch.take(1).collect()
      assertEquals(notifications[0].payload, 'from-notify')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'PostgresConnector.listen - should receive a notification',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const channel = `test_${crypto.randomUUID().replace(/-/g, '_')}`
      const ch = await connector.listen(channel).run()

      await connector.notify(channel, 'hello').run()

      const notifications = await ch.take(1).collect()
      assertEquals(notifications.length, 1)
      assertEquals(notifications[0].payload, 'hello')
      assertEquals(notifications[0].channel, channel)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name:
    'PostgresConnector.listen - should receive multiple notifications in order',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const channel = `test_${crypto.randomUUID().replace(/-/g, '_')}`
      const ch = await connector.listen(channel).run()

      await connector.notify(channel, 'first').run()
      await connector.notify(channel, 'second').run()
      await connector.notify(channel, 'third').run()

      const notifications = await ch.take(3).collect()
      assertEquals(notifications[0].payload, 'first')
      assertEquals(notifications[1].payload, 'second')
      assertEquals(notifications[2].payload, 'third')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name:
    'PostgresConnector.listen - should UNLISTEN and disconnect on channel close',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const channel = `test_${crypto.randomUUID().replace(/-/g, '_')}`
      const ch = await connector.listen(channel).run()

      await connector.notify(channel, 'payload').run()
      await ch.take(1).collect()

      // Allow onClose to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // A fresh subscription on the same channel must work cleanly
      const ch2 = await connector.listen(channel).run()
      await connector.notify(channel, 'after-close').run()
      const notifications = await ch2.take(1).collect()
      assertEquals(notifications[0].payload, 'after-close')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'db-postgres - should support nested transactions via savepoints',
  ignore: !POSTGRES_URL,
  async fn() {
    const connector = createPostgres({ connectionString: POSTGRES_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
      await DB.withConnection(connector, (db) =>
        Task.of(async () => {
          await db.execute(
            `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT)`,
          ).run()

          await db.withTransaction(async (tx1) => {
            await tx1.execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run()

            await tx1.withTransaction(async (tx2) => {
              await tx2.execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
                .run()
            }).run()

            // Nested transaction that rolls back
            await tx1.withTransaction(async (tx3) => {
              await tx3.execute(
                `INSERT INTO ${table} (name) VALUES ('Charlie')`,
              ).run()
              throw new Error('rollback inner')
            }).result()
          }).run()

          const users = await db.query(`SELECT * FROM ${table} ORDER BY name`)
            .run()
          assertEquals(users.length, 2)
          assertEquals(users[0].name, 'Alice')
          assertEquals(users[1].name, 'Bob')
        })).run()
    } finally {
      await connector.end()
    }
  },
})
