import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { Channel, Task } from '@anabranch/anabranch'
import type { DBAdapter, DBConnector } from './adapter.ts'
import type { Notification } from './index.ts'

/**
 * Creates an in-memory SQLite connector for testing.
 *
 * All connections share a single SQLite instance — schema and data created
 * through one connection are visible to others. Suitable for tests that need
 * consistent state across multiple `connect()` calls.
 */
export function createInMemory(): DBConnector & {
  /** Subscribe to an in-memory pub/sub channel. */
  listen(channel: string): Task<Channel<Notification, never>, never>
  /** Publish a notification to all listeners on a channel. */
  notify(channel: string, payload: string): Task<void, never>
} {
  const db = new DatabaseSync(':memory:')
  const subscriptions = new Map<string, Channel<Notification, never>[]>()

  return {
    connect: () => {
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

    listen(channel: string): Task<Channel<Notification, never>, never> {
      return Task.of(() => {
        const ch = Channel.create<Notification, never>()
          .withOnClose(() => {
            const list = subscriptions.get(channel)
            if (list) {
              const idx = list.indexOf(ch)
              if (idx !== -1) list.splice(idx, 1)
            }
          })
        const list = subscriptions.get(channel) ?? []
        list.push(ch)
        subscriptions.set(channel, list)
        return ch
      })
    },

    notify(channel: string, payload: string): Task<void, never> {
      return Task.of(() => {
        for (const ch of subscriptions.get(channel) ?? []) {
          ch.send({ channel, payload })
        }
      })
    },
  }
}
