# @anabranch/db-sqlite

SQLite database connector for the @anabranch/db package using Node.js built-in
`node:sqlite`.

Provides a `DBConnector` implementation using SQLite's synchronous database for
in-memory or file-based databases.

## Usage

```ts
import { DB } from '@anabranch/db'
import { createSqlite } from '@anabranch/db-sqlite'

const db = DB.from(
  await createSqlite({ filename: './mydb.sqlite' }).connect(),
)

// Query
const users = await db
  .query<{ id: number; name: string }>('SELECT * FROM users')
  .run()

// In-memory database for testing
const testDb = DB.from(
  await createSqlite().connect(),
)
```

## API

### createSqlite(options)

Creates a SQLite connector with a shared database instance.

```ts
import { createSqlite } from '@anabranch/db-sqlite'

const connector = createSqlite({
  // Database file path (default: ":memory:" for in-memory)
  filename: './mydb.sqlite',
})

// Connect returns a DBAdapter
const adapter = await connector.connect()
await adapter.close()

// End closes the database connection
await connector.end()
```

### Environment Variables

No environment variables are used. All options must be passed explicitly.

## Requirements

- Node.js 22.5+ or Deno 2.x+
- For file-based databases, ensure the process has write access to the parent
  directory

## Installation

**Deno:**

```ts
import { createSqlite } from '@anabranch/db-sqlite'
```

**Node.js:**

```bash
npm install @anabranch/db-sqlite @anabranch/db
```

See [@anabranch/db](https://jsr.io/@anabranch/db) for the core database
abstraction.

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/db-sqlite)
for full API details.
