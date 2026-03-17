# @anabranch/db-postgres

PostgreSQL database connector for the @anabranch/db package using `node:pg`.

Provides a `DBConnector` implementation that creates a connection pool and
returns adapters with cursor-based streaming support via `pg-cursor`.

## Usage

```ts
import { DB } from '@anabranch/db'
import { createPostgres } from '@anabranch/db-postgres'

const db = DB.from(
  await createPostgres({
    connectionString: 'postgresql://user:pass@localhost:5432/mydb',
  }).connect(),
)

// Query
const users = await db
  .query<{ id: number; name: string }>('SELECT * FROM users')
  .run()

// Stream large result sets
for await (
  const row of db.stream<{ id: number; name: string }>(
    'SELECT * FROM large_table',
  )
) {
  if (row.type === 'success') {
    console.log(row.value)
  }
}

// Transactions with automatic rollback on error
const result = await DB.withConnection(
  createPostgres({ connectionString }),
  (db) =>
    db.withTransaction(async (tx) => {
      await tx.execute("INSERT INTO users (name) VALUES ('Alice')")
      return db.query('SELECT * FROM users')
    }),
).run()
```

## API

### createPostgres(options)

Creates a PostgreSQL connector with a connection pool.

```ts
import { createPostgres } from '@anabranch/db-postgres'

const connector = createPostgres({
  // Connection string (alternative to individual options)
  connectionString: 'postgresql://user:pass@localhost:5432/mydb',

  // Or individual options
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'secret',
  database: 'mydb',

  // Pool options
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// Connect returns a DBAdapter
const adapter = await connector.connect()
await adapter.close()

// End terminates the connection pool (for cleanup)
await connector.end()
```

### Environment Variables

When individual connection options are not provided, defaults are read from
environment variables:

- `PGHOST` - PostgreSQL host (default: "localhost")
- `PGPORT` - PostgreSQL port (default: "5432")
- `PGUSER` - PostgreSQL user (default: "postgres")
- `PGPASSWORD` - PostgreSQL password (default: "")
- `PGDATABASE` - PostgreSQL database (default: "postgres")
- `POSTGRES_URL` - Full connection string (overrides individual options)

## Requirements

- Node.js 24+ or Deno
- PostgreSQL server (local or remote)

## Installation

**Deno:**

```ts
import { createPostgres } from '@anabranch/db-postgres'
```

**Node.js:**

```bash
npm install @anabranch/db-postgres @anabranch/db pg pg-cursor
```

See [@anabranch/db](https://jsr.io/@anabranch/db) for the core database
abstraction.

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/db-postgres)
for full API details.
