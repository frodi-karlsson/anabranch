import pg from "npm:pg@^8.11.0";
import Cursor from "npm:pg-cursor@^2.0.0";
import type { DBAdapter } from "@anabranch/db";
import process from "node:process";

const { Pool } = pg;

/**
 * Creates a PostgreSQL connector with connection pooling.
 *
 * Returns a connector that can be used with {@link DB.withConnection} to
 * acquire connections. Each call to `connect()` returns a new adapter with
 * query, execute, and stream methods. The stream method uses pg-cursor for
 * memory-efficient streaming of large result sets.
 *
 * @example Connect and query with error handling
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createPostgres } from "@anabranch/db-postgres";
 *
 * const users = await DB.withConnection(createPostgres(), (db) =>
 *   db.query("SELECT * FROM users WHERE active = ?", [true])
 * ).run();
 * ```
 *
 * @example Stream large result sets with concurrency
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createPostgres } from "@anabranch/db-postgres";
 *
 * const { successes, errors } = await DB.withConnection(createPostgres(), (db) =>
 *   db.stream("SELECT * FROM large_table")
 *     .withConcurrency(10)
 *     .map(row => processRow(row))
 *     .partition()
 * ).run();
 * ```
 *
 * @example Transactions with automatic rollback
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createPostgres } from "@anabranch/db-postgres";
 *
 * const result = await DB.withConnection(createPostgres(), (db) =>
 *   db.withTransaction(async (tx) => {
 *     await tx.execute("INSERT INTO orders (user_id) VALUES (?)", [userId]);
 *     return tx.query("SELECT last_insert_rowid()");
 *   })
 * ).run();
 * ```
 */
export function createPostgres(
  options: PostgresOptions = {},
): PostgresConnector {
  const pool = new Pool(toPoolConfig(options));

  return {
    async connect(signal?: AbortSignal): Promise<DBAdapter> {
      const client = await pool.connect();

      const onAbort = () => client.release(true);
      signal?.addEventListener("abort", onAbort, { once: true });

      return {
        query: (sql, params) =>
          client
            .query(sql, params as unknown[])
            .then((r: { rows: unknown[] }) => r.rows),
        execute: (sql, params) =>
          client
            .query(sql, params as unknown[])
            .then((r: { rowCount: number | bigint | null }) =>
              Number(r.rowCount ?? 0)
            ),
        close: () => {
          signal?.removeEventListener("abort", onAbort);
          client.release();
          return Promise.resolve();
        },
        stream: async function* (sql, params) {
          const cursor = client.query(new Cursor(sql, params as unknown[]));
          try {
            while (true) {
              const rows = await cursor.read(100);
              if (rows.length === 0) break;
              yield* rows;
            }
          } finally {
            await cursor.close();
          }
        },
      };
    },
    end(): Promise<void> {
      return pool.end();
    },
  };
}

/** Connection options for PostgreSQL. */
export type PostgresOptions = {
  /** @default "localhost" */
  host?: string;
  /** @default 5432 */
  port?: number;
  /** @default "postgres" */
  user?: string;
  /** @default "" */
  password?: string;
  /** @default "postgres" */
  database?: string;
  connectionString?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
};

/** PostgreSQL database connector. */
export interface PostgresConnector {
  /** Connects and returns a DBAdapter for query execution. */
  connect(signal?: AbortSignal): Promise<DBAdapter>;
  /** Closes the connection pool. */
  end(): Promise<void>;
}

function toPoolConfig(options: PostgresOptions) {
  if (options.connectionString) {
    return {
      connectionString: options.connectionString,
      max: options.max,
      idleTimeoutMillis: options.idleTimeoutMillis,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
    };
  }
  return {
    host: options.host ?? process.env.PGHOST ?? "localhost",
    port: options.port ?? parseInt(process.env.PGPORT ?? "5432"),
    user: options.user ?? process.env.PGUSER ?? "postgres",
    password: options.password ?? process.env.PGPASSWORD ?? "",
    database: options.database ?? process.env.PGDATABASE ?? "postgres",
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
  };
}
