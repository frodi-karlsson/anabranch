import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { DBAdapter, DBConnector } from './adapter.ts'

/** Creates an in-memory SQLite connector for testing. */
export function createInMemory(): DBConnector {
  return {
    connect: () => {
      const db = new DatabaseSync(':memory:')
      return Promise.resolve<DBAdapter>({
        // deno-lint-ignore no-explicit-any
        query: <T extends Record<string, any> = Record<string, any>>(
          sql: string,
          params?: unknown[],
        ): Promise<T[]> => {
          const stmt = db.prepare(sql)
          return Promise.resolve(
            stmt.all(...(params ?? []) as SQLInputValue[]) as T[],
          )
        },
        execute: (sql, params) => {
          const stmt = db.prepare(sql)
          const { changes } = stmt.run(
            ...(params ?? []) as SQLInputValue[],
          )
          return Promise.resolve(Number(changes))
        },
        executeBatch: (sql, paramsArray) => {
          const results: number[] = []
          const stmt = db.prepare(sql)
          db.exec('BEGIN')
          try {
            for (const params of paramsArray) {
              const { changes } = stmt.run(...(params ?? []) as SQLInputValue[])
              results.push(Number(changes))
            }
            db.exec('COMMIT')
          } catch (e) {
            db.exec('ROLLBACK')
            throw e
          }
          return Promise.resolve(results)
        },
        close: () => {
          db.close()
          return Promise.resolve()
        },
        stream: async function* <
          // deno-lint-ignore no-explicit-any
          T extends Record<string, any> = Record<string, any>,
        >(sql: string, params?: unknown[]) {
          const stmt = db.prepare(sql)
          for (
            const row of stmt.iterate(...(params ?? []) as SQLInputValue[])
          ) {
            yield row as T
          }
        },
      })
    },
  }
}
