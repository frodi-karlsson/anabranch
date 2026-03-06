import type { DBAdapter, DBConnector } from "@anabranch/db";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/** Creates a SQLite connector with a shared database instance. */
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
