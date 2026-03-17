# @anabranch/db

Type-safe database abstraction with query building, transactions, and streaming
support.

Provides a unified API across PostgreSQL, MySQL, and SQLite through adapter
packages.

## Usage

```ts
import { DB } from '@anabranch/db'
import { createPostgres } from '@anabranch/db-postgres'

const db = DB.from(
  await createPostgres({ connectionString: 'postgresql://...' }).connect(),
)

// Query with type inference
const users = await db
  .query<{ id: number; name: string }>('SELECT * FROM users')
  .run()

// Transactions with automatic rollback on error
await DB.withConnection(
  createPostgres({}),
  (db) =>
    db.withTransaction(async (tx) => {
      await tx.execute("INSERT INTO users (name) VALUES ('Alice')")
    }),
).run()

// Stream large result sets
for await (const row of db.stream('SELECT * FROM large_table')) {
  if (row.type === 'success') {
    console.log(row.value)
  }
}
```

## Adapters

- [@anabranch/db-postgres](https://jsr.io/@anabranch/db-postgres) - PostgreSQL
- [@anabranch/db-mysql](https://jsr.io/@anabranch/db-mysql) - MySQL
- [@anabranch/db-sqlite](https://jsr.io/@anabranch/db-sqlite) - SQLite

## API

### DB.from(adapter)

Creates a DB instance from a connected adapter.

```ts
import { DB } from '@anabranch/db'

const db = DB.from(adapter)
```

### query(sql, params?)

Executes a SELECT query and returns results.

```ts
const users = await db
  .query<{ id: number; name: string }>('SELECT * FROM users WHERE active = ?', [
    true,
  ])
  .run()
```

### execute(sql, params?)

Executes INSERT, UPDATE, DELETE or DDL statements.

```ts
const result = await db
  .execute('INSERT INTO users (name) VALUES (?)', ['Alice'])
  .run()
console.log(result.affectedRows)
```

### stream(sql, params?)

Streams rows from a query result.

```ts
for await (const row of db.stream('SELECT * FROM users')) {
  if (row.type === 'success') {
    console.log(row.value)
  }
}
```

### withTransaction(fn)

Executes a callback within a transaction, automatically committing on success or
rolling back on error.

```ts
await db.withTransaction(async (tx) => {
  await tx.execute('INSERT INTO accounts (balance) VALUES (100)')
  await tx.execute('INSERT INTO accounts (balance) VALUES (-100)')
}).run()
```

### DB.withConnection(connector, fn)

Acquires a connection, runs a callback, and releases the connection. Supports
transactions.

```ts
const result = await DB.withConnection(
  createPostgres({}),
  (db) =>
    db.withTransaction(async (tx) => {
      await tx.execute('INSERT INTO orders DEFAULT VALUES')
      return tx.query('SELECT LAST_INSERT_ID()')
    }),
).run()
```
