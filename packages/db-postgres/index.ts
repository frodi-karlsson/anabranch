import pg from "npm:pg@^8.11.0";
import Cursor from "npm:pg-cursor@^2.0.0";
import type { DBAdapter, DBConnector } from "@anabranch/db";
import process from "node:process";

const { Pool } = pg;

export interface PostgresOptions {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface PostgresConnector extends DBConnector {
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
