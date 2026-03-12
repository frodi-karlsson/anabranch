/**
 * Integration tests for db-mysql.
 * Set MYSQL_URL or environment variables to run them.
 * CI uses GitHub Actions service containers for this.
 */
import { assertEquals } from '@std/assert'
import { ErrorResult, Task } from '@anabranch/anabranch'
import { ConstraintViolation, DB } from '@anabranch/db'
import { createMySQL } from './index.ts'

const MYSQL_URL = Deno.env.get('MYSQL_URL') ||
  (Deno.env.get('MYSQL_HOST') &&
    `mysql://${Deno.env.get('MYSQL_USER') ?? 'root'}:${
      Deno.env.get('MYSQL_PASSWORD') ?? ''
    }@${Deno.env.get('MYSQL_HOST')}:${Deno.env.get('MYSQL_PORT') ?? '3306'}/${
      Deno.env.get('MYSQL_DATABASE') ?? 'mysql'
    }`)

Deno.test({
  name: 'DB - should execute SELECT and return results',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const result = await DB.withConnection(
        connector,
        (db) =>
          Task.chain([
            () =>
              db.execute(
                `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
              ),
            () => db.execute(`INSERT INTO ${table} (name) VALUES ('Alice')`),
            () => db.execute(`INSERT INTO ${table} (name) VALUES ('Bob')`),

            () =>
              db.query<{ id: number; name: string }>(
                `SELECT * FROM ${table} ORDER BY id`,
              ),
          ]),
      ).run()

      assertEquals(result.length, 2)
      assertEquals(result[0].name, 'Alice')
      assertEquals(result[1].name, 'Bob')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB - should handle WHERE clause with parameters',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const result = await DB.withConnection(
        connector,
        (db) =>
          Task.chain([
            () =>
              db.execute(
                `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
              ),
            () => db.execute(`INSERT INTO ${table} (name) VALUES ('Alice')`),
            () => db.execute(`INSERT INTO ${table} (name) VALUES ('Bob')`),

            () =>
              db.query<{ id: number; name: string }>(
                `SELECT * FROM ${table} WHERE name = ?`,
                ['Alice'],
              ),
          ]),
      ).run()

      assertEquals(result.length, 1)
      assertEquals(result[0].name, 'Alice')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB.execute - should return affected row count',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      await DB.withConnection(connector, (db) =>
        Task.chain([
          () =>
            db.execute(
              `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
            ),
          () =>
            db.execute(`INSERT INTO ${table} (name) VALUES ('Alice')`).tap(
              (affected) => {
                assertEquals(affected, 1)
              },
            ),
          () =>
            db
              .execute(
                `UPDATE ${table} SET name = 'Bob' WHERE name = ?`,
                ['Alice'],
              )
              .tap((updateAffected) => {
                assertEquals(updateAffected, 1)
              }),
          () =>
            db.execute(`DELETE FROM ${table} WHERE name = ?`, ['Nonexistent'])
              .tap((affected) => {
                assertEquals(affected, 0)
              }),
          () =>
            db.execute(`INSERT INTO ${table} (name) VALUES ('Charlie')`).tap(
              (affected) => {
                assertEquals(affected, 1)
              },
            ),
          () =>
            db.execute(`DELETE FROM ${table} WHERE name iN (?)`, [[
              'Charlie',
              'Bob',
            ]]).tap((affected) => {
              assertEquals(affected, 2)
            }),
        ])).run()
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB.withTransaction - should commit on success',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const result = await DB.withConnection(
        connector,
        (db) =>
          Task.chain([
            () =>
              db
                .execute(
                  `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
                ),
            () =>
              db.withTransaction((tx) =>
                Task.chain([
                  () =>
                    tx
                      .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`),
                  () =>
                    tx
                      .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`),
                  () =>
                    tx
                      .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`),
                  () =>
                    tx.query<{ id: number; name: string }>(
                      `SELECT * FROM ${table} ORDER BY id`,
                    ),
                ]).run()
              ),
          ]),
      ).run()

      assertEquals(result.length, 3)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DB.withTransaction - should rollback on error',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`

      const result = await DB.withConnection(
        connector,
        (db) =>
          db.withTransaction((tx) =>
            Task.chain([
              () =>
                tx
                  .execute(
                    `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) UNIQUE)`,
                  ),
              () =>
                tx
                  .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`),
              () =>
                tx
                  .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`),
            ]).run()
          ),
      ).result()

      assertEquals(result.type, 'error')
      assertEquals(
        (result as ErrorResult<unknown, Error>).error.message.includes(
          'Duplicate entry',
        ),
        true,
      )
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'db-mysql - should throw ConstraintViolation on duplicate key',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
      await DB.withConnection(connector, (db) =>
        Task.of(async () => {
          await db.execute(
            `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) UNIQUE)`,
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
  name: 'db-mysql - should support executeBatch',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
      await DB.withConnection(connector, (db) =>
        Task.of(async () => {
          await db.execute(
            `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
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
  },
})

Deno.test({
  name: 'db-mysql - should support streaming',
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! })
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, '_')}`
      await DB.withConnection(connector, (db) =>
        Task.of(async () => {
          await db.execute(
            `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
          ).run()
          await db.executeBatch(
            `INSERT INTO ${table} (name) VALUES (?)`,
            [['Alice'], ['Bob']],
          ).run()

          const rows = await db.stream<{ id: number; name: string }>(
            `SELECT * FROM ${table} ORDER BY name`,
          ).collect()
          assertEquals(rows.length, 2)
          assertEquals(rows[0].name, 'Alice')
          assertEquals(rows[1].name, 'Bob')
        })).run()
    } finally {
      await connector.end()
    }
  },
})
