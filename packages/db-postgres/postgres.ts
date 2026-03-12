import pg from 'npm:pg@^8.11.0'
import Cursor from 'npm:pg-cursor@^2.0.0'
import {
  ConstraintViolation,
  type DBAdapter,
  type DBConnector,
  QueryFailed,
} from '@anabranch/db'
import process from 'node:process'

const { Pool } = pg

/**
 * Creates a PostgreSQL connector with connection pooling.
 */
export function createPostgres(
  options: PostgresOptions = {},
): PostgresConnector {
  const pool = new Pool(toPoolConfig(options))

  return {
    async connect(signal?: AbortSignal): Promise<DBAdapter> {
      const client = await pool.connect()

      const onAbort = () => client.release(true)
      signal?.addEventListener('abort', onAbort, { once: true })

      return {
        query: <T extends Record<string, unknown> = Record<string, unknown>>(
          sql: string,
          params?: unknown[],
        ) =>
          client
            .query(sql, params)
            .then((r: { rows: T[] }) => r.rows)
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err)
              if (isConstraintViolation(err)) {
                throw new ConstraintViolation(sql, message)
              }
              throw new QueryFailed(sql, message)
            }),
        execute: (sql, params) =>
          client
            .query(sql, params)
            .then((r: { rowCount: number | bigint | null }) =>
              Number(r.rowCount ?? 0)
            )
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err)
              if (isConstraintViolation(err)) {
                throw new ConstraintViolation(sql, message)
              }
              throw new QueryFailed(sql, message)
            }),
        executeBatch: async (sql, paramsArray) => {
          try {
            const results: number[] = []
            for (const params of paramsArray) {
              const r = await client.query(sql, params)
              results.push(Number(r.rowCount ?? 0))
            }
            return results
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            if (isConstraintViolation(err)) {
              throw new ConstraintViolation(sql, message)
            }
            throw new QueryFailed(sql, message)
          }
        },
        close: () => {
          signal?.removeEventListener('abort', onAbort)
          client.release()
          return Promise.resolve()
        },
        stream: async function* <
          T extends Record<string, unknown> = Record<string, unknown>,
        >(sql: string, params?: unknown[]) {
          const cursor = client.query(new Cursor(sql, params))
          try {
            while (true) {
              const rows = await cursor.read(100)
              if (rows.length === 0) break
              yield* rows as T[]
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            if (isConstraintViolation(err)) {
              throw new ConstraintViolation(sql, message)
            }
            throw new QueryFailed(sql, message)
          } finally {
            await cursor.close()
          }
        },
      }
    },
    end(): Promise<void> {
      return pool.end()
    },
  }
}

/** Connection options for PostgreSQL. */
export type PostgresOptions = {
  /** @default "localhost" */
  host?: string
  /** @default 5432 */
  port?: number
  /** @default "postgres" */
  user?: string
  /** @default "" */
  password?: string
  /** @default "postgres" */
  database?: string
  connectionString?: string
  max?: number
  idleTimeoutMillis?: number
  connectionTimeoutMillis?: number
}

/** PostgreSQL database connector. */
export interface PostgresConnector extends DBConnector {
  /** Connects and returns a DBAdapter for query execution. */
  connect(signal?: AbortSignal): Promise<DBAdapter>
  /** Closes the connection pool. */
  end(): Promise<void>
}

function toPoolConfig(options: PostgresOptions) {
  if (options.connectionString) {
    return {
      connectionString: options.connectionString,
      max: options.max,
      idleTimeoutMillis: options.idleTimeoutMillis,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
    }
  }
  return {
    host: options.host ?? process.env.PGHOST ?? 'localhost',
    port: options.port ?? parseInt(process.env.PGPORT ?? '5432'),
    user: options.user ?? process.env.PGUSER ?? 'postgres',
    password: options.password ?? process.env.PGPASSWORD ?? '',
    database: options.database ?? process.env.PGDATABASE ?? 'postgres',
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
  }
}

function isConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('23')
  )
}
