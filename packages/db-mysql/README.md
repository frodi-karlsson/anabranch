# @anabranch/db-mysql

MySQL database connector for the @anabranch/db package using `mysql2`.

Provides a `DBConnector` implementation with connection pooling for MySQL databases.

## Usage

```ts
import { DB } from "@anabranch/db";
import { createMySQL } from "@anabranch/db-mysql";

const db = new DB(
  await createMySQL({
    connectionString: "mysql://user:pass@localhost:3306/mydb",
  }).connect(),
);

// Query
const users = await db
  .query<{ id: number; name: string }>("SELECT * FROM users")
  .run();

// Transactions with automatic rollback on error
const result = await DB.withConnection(
  createMySQL({ connectionString }),
  (db) =>
    db.withTransaction(async (tx) => {
      await tx.execute("INSERT INTO users (name) VALUES ('Alice')");
      return db.query("SELECT * FROM users");
    }),
).run();
```

## API

### createMySQL(options)

Creates a MySQL connector with a connection pool.

```ts
import { createMySQL } from "@anabranch/db-mysql";

const connector = createMySQL({
  // Connection string (alternative to individual options)
  connectionString: "mysql://user:pass@localhost:3306/mydb",

  // Or individual options
  host: "localhost",
  port: 3306,
  user: "root",
  password: "secret",
  database: "mydb",

  // Pool options
  connectionLimit: 10,
  waitForConnections: true,
  connectionTimeoutMillis: 10000,
});

// Connect returns a DBAdapter
const adapter = await connector.connect();
await adapter.close();

// End terminates the connection pool (for cleanup)
await connector.end();
```

### Environment Variables

When individual connection options are not provided, defaults are read from
environment variables:

- `MYSQL_HOST` - MySQL host (default: "localhost")
- `MYSQL_PORT` - MySQL port (default: "3306")
- `MYSQL_USER` - MySQL user (default: "root")
- `MYSQL_PASSWORD` - MySQL password (default: "")
- `MYSQL_DATABASE` - MySQL database (default: "mysql")
- `MYSQL_URL` - Full connection string (overrides individual options)

## Requirements

- Node.js 18+ or Deno
- MySQL server (local or remote, version 5.7+ or 8.x)

## Installation

**Deno:**

```ts
import { createMySQL } from "@anabranch/db-mysql";
```

**Node.js:**

```bash
npm install @anabranch/db-mysql @anabranch/db mysql2
```

See [@anabranch/db](https://jsr.io/@anabranch/db) for the core database
abstraction.

See [generated documentation](https://frodi-karlsson.github.io/anabranch/db-mysql) for
full API details.