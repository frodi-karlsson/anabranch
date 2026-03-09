import { DatabaseSync, SQLOutputValue } from 'node:sqlite'
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
            stmt.all(...(params ?? []) as SQLOutputValue[]) as T[],
          )
        },
        execute: (sql, params) => {
          const stmt = db.prepare(sql)
          const { changes } = stmt.run(
            ...(params ?? []) as SQLOutputValue[],
          )
          return Promise.resolve(Number(changes))
        },
        close: () => {
          db.close()
          return Promise.resolve()
        },
      })
    },
  }
}
