import {
  ConstraintViolation,
  type DBAdapter,
  type DBConnector,
  QueryFailed,
} from '@anabranch/db'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

/**
 * Creates a SQLite connector with a shared database instance.
 */
export function createSqlite(options: SQLiteOptions = {}): SQLiteConnector {
  const filename = options.filename ?? ':memory:'

  let db: DatabaseSync | null = null
  let refCount = 0

  function getDb() {
    if (!db) {
      db = new DatabaseSync(filename)
    }
    return db
  }

  return {
    connect(_signal?: AbortSignal): Promise<DBAdapter> {
      const database = getDb()
      refCount++

      return Promise.resolve({
        // deno-lint-ignore no-explicit-any
        query: <T extends Record<string, any> = Record<string, any>>(
          sql: string,
          params?: unknown[],
        ): Promise<T[]> => {
          try {
            const stmt = database.prepare(sql)
            return Promise.resolve(
              stmt.all(...(params ?? []) as SQLInputValue[]) as T[],
            )
          } catch (e) {
            if (isConstraintViolation(e)) {
              throw new ConstraintViolation(sql, (e as Error).message)
            }
            throw new QueryFailed(sql, (e as Error).message)
          }
        },
        execute: (sql, params) => {
          try {
            const stmt = database.prepare(sql)
            const result = stmt.run(
              ...(params ?? []) as SQLInputValue[],
            )
            return Promise.resolve(Number(result.changes))
          } catch (e) {
            if (isConstraintViolation(e)) {
              throw new ConstraintViolation(sql, (e as Error).message)
            }
            throw new QueryFailed(sql, (e as Error).message)
          }
        },
        executeBatch: (sql, paramsArray) => {
          const results: number[] = []
          const stmt = database.prepare(sql)
          database.exec('BEGIN')
          try {
            for (const params of paramsArray) {
              const result = stmt.run(...(params ?? []) as SQLInputValue[])
              results.push(Number(result.changes))
            }
            database.exec('COMMIT')
          } catch (e) {
            database.exec('ROLLBACK')
            if (isConstraintViolation(e)) {
              throw new ConstraintViolation(sql, (e as Error).message)
            }
            throw new QueryFailed(sql, (e as Error).message)
          }
          return Promise.resolve(results)
        },
        close: () => {
          refCount--
          return Promise.resolve()
        },
        stream: async function* <
          // deno-lint-ignore no-explicit-any
          T extends Record<string, any> = Record<string, any>,
        >(sql: string, params?: unknown[]) {
          try {
            const stmt = database.prepare(sql)
            for (
              const row of stmt.iterate(...(params ?? []) as SQLInputValue[])
            ) {
              yield row as T
            }
          } catch (e) {
            if (isConstraintViolation(e)) {
              throw new ConstraintViolation(sql, (e as Error).message)
            }
            throw new QueryFailed(sql, (e as Error).message)
          }
        },
      })
    },
    end(): Promise<void> {
      if (db) {
        db.close()
        db = null
      }
      return Promise.resolve()
    },
  }
}

/** SQLite database connector. */
export interface SQLiteConnector extends DBConnector {
  /** Closes the database connection. */
  end(): Promise<void>
}

/** Connection options for SQLite. */
export interface SQLiteOptions {
  /** @default ":memory:" */
  filename?: string
}

function isConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('SQLITE_CONSTRAINT') ||
      error.message.includes('constraint failed'))
  )
}
