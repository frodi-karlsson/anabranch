import {
  ConstraintViolation,
  type DBAdapter,
  type DBConnector,
  QueryFailed,
} from '@anabranch/db'
import process from 'node:process'
import * as mysql from 'npm:mysql2@^3'

/**
 * Creates a MySQL connector with connection pooling.
 */
export function createMySQL(options: MySQLOptions = {}): MySQLConnector {
  let pool: mysql.Pool | null = null

  function getPool() {
    if (!pool) {
      let config: mysql.PoolOptions

      if (options.connectionString) {
        const url = new URL(options.connectionString)
        config = {
          host: url.hostname,
          port: parseInt(url.port || '3306'),
          user: url.username,
          password: url.password,
          database: url.pathname.slice(1),
          connectionLimit: options.connectionLimit,
          waitForConnections: options.waitForConnections,
          connectTimeout: options.connectionTimeoutMillis,
        }
      } else {
        config = {
          host: options.host || process.env.MYSQL_HOST || 'localhost',
          port: options.port || parseInt(process.env.MYSQL_PORT || '3306'),
          user: options.user || process.env.MYSQL_USER || 'root',
          password: options.password || process.env.MYSQL_PASSWORD || '',
          database: options.database || process.env.MYSQL_DATABASE || 'mysql',
          connectionLimit: options.connectionLimit,
          waitForConnections: options.waitForConnections,
          connectTimeout: options.connectionTimeoutMillis,
        }
      }

      pool = mysql.createPool(config)
    }
    return pool
  }

  return {
    async connect(signal?: AbortSignal): Promise<DBAdapter> {
      const p = getPool()
      const connection = await new Promise<mysql.PoolConnection>(
        (resolve, reject) => {
          p.getConnection((err, conn) => {
            if (err) reject(err)
            else resolve(conn)
          })
        },
      )

      if (signal?.aborted) {
        connection.release()
        throw new QueryFailed('N/A', 'Aborted')
      }

      const onAbort = () => connection.destroy()
      signal?.addEventListener('abort', onAbort, { once: true })

      return {
        query: <T extends Record<string, unknown> = Record<string, unknown>>(
          sql: string,
          params?: unknown[],
        ) =>
          new Promise<T[]>((resolve, reject) => {
            connection.query(sql, params, (err, rows) => {
              if (err) {
                if (isConstraintViolation(err)) {
                  reject(new ConstraintViolation(sql, err.message))
                } else {
                  reject(new QueryFailed(sql, err.message))
                }
              } else {
                resolve(rows as T[])
              }
            })
          }),
        execute: (sql, params) =>
          new Promise<number>((resolve, reject) => {
            connection.query(sql, params, (err, result) => {
              if (err) {
                if (isConstraintViolation(err)) {
                  reject(new ConstraintViolation(sql, err.message))
                } else {
                  reject(new QueryFailed(sql, err.message))
                }
              } else {
                const header = result as mysql.ResultSetHeader
                resolve(header.affectedRows ?? 0)
              }
            })
          }),
        executeBatch: async (sql, paramsArray) => {
          try {
            const results: number[] = []
            for (const params of paramsArray) {
              const r = await new Promise<number>((resolve, reject) => {
                connection.query(sql, params, (err, result) => {
                  if (err) reject(err)
                  else {
                    const header = result as mysql.ResultSetHeader
                    resolve(header.affectedRows ?? 0)
                  }
                })
              })
              results.push(r)
            }
            return results
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (isConstraintViolation(err)) {
              throw new ConstraintViolation(sql, message)
            }
            throw new QueryFailed(sql, message)
          }
        },
        close: () => {
          signal?.removeEventListener('abort', onAbort)
          connection.release()
          return Promise.resolve()
        },
        stream: async function* <
          T extends Record<string, unknown> = Record<string, unknown>,
        >(sql: string, params?: unknown[]) {
          const stream = connection.query(sql, params).stream({
            objectMode: true,
          })

          try {
            for await (const row of stream) {
              yield row as T
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (isConstraintViolation(err)) {
              throw new ConstraintViolation(sql, message)
            }
            throw new QueryFailed(sql, message)
          } finally {
            stream.destroy()
          }
        },
      }
    },
    async end(): Promise<void> {
      if (pool) {
        await new Promise<void>((resolve, reject) => {
          pool!.end((err) => {
            if (err) reject(err)
            else resolve()
          })
        })
        pool = null
        // Give Deno a moment to finalize socket closures
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    },
  }
}

/** MySQL database connector. */
export interface MySQLConnector extends DBConnector {
  /** Connects and returns a DBAdapter for query execution. */
  connect(signal?: AbortSignal): Promise<DBAdapter>
  /** Closes the connection pool. */
  end(): Promise<void>
}

/** Connection options for MySQL. */
export interface MySQLOptions {
  /** @default "localhost" */
  host?: string
  /** @default 3306 */
  port?: number
  /** @default "root" */
  user?: string
  /** @default "" */
  password?: string
  /** @default "mysql" */
  database?: string
  connectionString?: string
  connectionLimit?: number
  waitForConnections?: boolean
  connectionTimeoutMillis?: number
}

function isConstraintViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const err = error as { code?: string; errno?: number }
  return (
    err.code === 'ER_DUP_ENTRY' ||
    err.errno === 1062 ||
    err.errno === 1451 ||
    err.errno === 1452
  )
}
