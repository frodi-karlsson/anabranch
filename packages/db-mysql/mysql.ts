import type { DBAdapter, DBConnector } from "@anabranch/db";
import process from "node:process";

/**
 * Creates a MySQL connector with connection pooling.
 *
 * Uses mysql2 with promise API for MySQL databases. The connection pool
 * manages multiple connections for concurrent operations. Each adapter
 * acquisition gets a connection from the pool; releasing returns it.
 *
 * @example Connect with connection string
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createMySQL } from "@anabranch/db-mysql";
 *
 * const users = await DB.withConnection(
 *   createMySQL({ connectionString: "mysql://user:pass@localhost:3306/mydb" }),
 *   (db) => db.query("SELECT * FROM users")
 * ).run();
 * ```
 *
 * @example Concurrent processing with retry on failure
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createMySQL } from "@anabranch/db-mysql";
 *
 * const { successes, errors } = await DB.withConnection(createMySQL(), (db) =>
 *   db.stream("SELECT * FROM users")
 *     .withConcurrency(5)
 *     .map(async (user) => {
 *       const profile = await fetchProfile(user.id);
 *       return enrichUser(user, profile);
 *     })
 *     .retry({ attempts: 3, delay: 100 })
 *     .partition()
 * ).run();
 * ```
 *
 * @example Transactions with error handling
 * ```ts
 * import { DB, ConstraintViolation } from "@anabranch/db";
 * import { createMySQL } from "@anabranch/db-mysql";
 *
 * const result = await DB.withConnection(createMySQL(), (db) =>
 *   db.withTransaction(async (tx) => {
 *     await tx.execute("INSERT INTO orders (user_id, total) VALUES (?, ?)", [userId, total]);
 *     await tx.execute("UPDATE users SET order_count = order_count + 1 WHERE id = ?", [userId]);
 *     return tx.query("SELECT LAST_INSERT_ID()");
 *   })
 * ).recoverWhen(
 *   (e) => e instanceof ConstraintViolation,
 *   (e) => ({ id: 0, error: e.message })
 * ).run();
 * ```
 */
export function createMySQL(options: MySQLOptions = {}): MySQLConnector {
  let mysql2: typeof import("npm:mysql2@^3");
  let pool: null | ReturnType<typeof mysql2.createPool> = null;

  async function getPool() {
    if (!pool) {
      mysql2 = await import("npm:mysql2@^3");
      let config: Parameters<typeof mysql2.createPool>[0];

      if (options.connectionString) {
        const url = new URL(options.connectionString);
        config = {
          host: url.hostname,
          port: parseInt(url.port || "3306"),
          user: url.username,
          password: url.password,
          database: url.pathname.slice(1),
          connectionLimit: options.connectionLimit,
          waitForConnections: options.waitForConnections,
          connectTimeout: options.connectionTimeoutMillis,
        };
      } else {
        config = {
          host: options.host || process.env.MYSQL_HOST || "localhost",
          port: options.port || parseInt(process.env.MYSQL_PORT || "3306"),
          user: options.user || process.env.MYSQL_USER || "root",
          password: options.password || process.env.MYSQL_PASSWORD || "",
          database: options.database || process.env.MYSQL_DATABASE || "mysql",
          connectionLimit: options.connectionLimit,
          waitForConnections: options.waitForConnections,
          connectTimeout: options.connectionTimeoutMillis,
        };
      }

      pool = mysql2.createPool(config);
    }
    return pool.promise();
  }

  return {
    async connect(signal?: AbortSignal): Promise<DBAdapter> {
      const p = await getPool();
      const connection = await p.getConnection();

      const onAbort = () => connection.destroy();
      signal?.addEventListener("abort", onAbort, { once: true });

      return {
        query: (sql, params) =>
          connection
            .query(sql, params as Parameters<typeof connection.query>[1])
            .then(([rows]) => rows as unknown[]),
        execute: (sql, params) =>
          connection
            .query(sql, params as Parameters<typeof connection.query>[1])
            .then(([result]) =>
              (result as { affectedRows?: number }).affectedRows ?? 0
            ),
        close: () => {
          signal?.removeEventListener("abort", onAbort);
          connection.destroy();
          return Promise.resolve();
        },
      };
    },
    async end(): Promise<void> {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },
  };
}

/** MySQL database connector. */
export interface MySQLConnector extends DBConnector {
  /** Closes the connection pool. */
  end(): Promise<void>;
}

/** Connection options for MySQL. */
export interface MySQLOptions {
  /** @default "localhost" */
  host?: string;
  /** @default 3306 */
  port?: number;
  /** @default "root" */
  user?: string;
  /** @default "" */
  password?: string;
  /** @default "mysql" */
  database?: string;
  connectionString?: string;
  connectionLimit?: number;
  waitForConnections?: boolean;
  connectionTimeoutMillis?: number;
}
