import type { DBAdapter, DBConnector } from "@anabranch/db";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/**
 * Creates a SQLite connector with a shared database instance.
 *
 * Uses Node.js built-in `node:sqlite` for in-memory or file-based databases.
 * Ideal for testing or lightweight applications. The shared database instance
 * supports reference counting for multiple concurrent connections.
 *
 * @example In-memory database for testing
 * ```ts
 * import { DB, createInMemory } from "@anabranch/db";
 * import { createSqlite } from "@anabranch/db-sqlite";
 *
 * const db = new DB(await createSqlite().connect());
 * await db.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
 * await db.execute("INSERT INTO users (name) VALUES (?)", ["Alice"]);
 * const users = await db.query("SELECT * FROM users").run();
 * ```
 *
 * @example Using withConnection for automatic cleanup
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createSqlite } from "@anabranch/db-sqlite";
 *
 * const result = await DB.withConnection(createSqlite(), (db) =>
 *   db.withTransaction(async (tx) => {
 *     await tx.execute("INSERT INTO users (name) VALUES (?)", ["Bob"]);
 *     return tx.query("SELECT * FROM users");
 *   })
 * ).run();
 * ```
 *
 * @example Stream processing with error collection
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createSqlite } from "@anabranch/db-sqlite";
 *
 * const { successes, errors } = await DB.withConnection(createSqlite(), (db) =>
 *   db.stream("SELECT * FROM users")
 *     .map(user => validateUser(user))
 *     .partition()
 * ).run();
 * ```
 */
export function createSqlite(options: SQLiteOptions = {}): SQLiteConnector {
  const filename = options.filename ?? ":memory:";

  let db: DatabaseSync | null = null;
  let refCount = 0;

  function getDb() {
    if (!db) {
      db = new DatabaseSync(filename);
    }
    return db;
  }

  return {
    connect(_signal?: AbortSignal): Promise<DBAdapter> {
      const database = getDb();
      refCount++;

      return Promise.resolve({
        query: (sql, params) => {
          const stmt = database.prepare(sql);
          return Promise.resolve(
            stmt.all(...(params ?? []) as SQLInputValue[]) as unknown[],
          );
        },
        execute: (sql, params) => {
          const stmt = database.prepare(sql);
          const result = stmt.run(
            ...(params ?? []) as SQLInputValue[],
          );
          return Promise.resolve(Number(result.changes));
        },
        close: () => {
          refCount--;
          return Promise.resolve();
        },
      });
    },
    end(): Promise<void> {
      if (db) {
        db.close();
        db = null;
      }
      return Promise.resolve();
    },
  };
}

/** SQLite database connector. */
export interface SQLiteConnector extends DBConnector {
  /** Closes the database connection. */
  end(): Promise<void>;
}

/** Connection options for SQLite. */
export interface SQLiteOptions {
  /** @default ":memory:" */
  filename?: string;
}
