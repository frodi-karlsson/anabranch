import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { Channel, Task } from '@anabranch/anabranch'
import type { DBAdapter, DBConnector } from './adapter.ts'
import { ListenFailed } from './errors.ts'
import type { Notification } from './index.ts'

const encoder = new TextEncoder()

/**
 * Creates an in-memory SQLite connector for testing.
 *
 * All connections share a single SQLite instance — schema and data created
 * through one connection are visible to others. Suitable for tests that need
 * consistent state across multiple `connect()` calls.
 */
export function createInMemory(): DBConnector & {
  /**
   * Subscribe to an in-memory pub/sub channel.
   *
   * Cleanup runs when the consumer stops iterating. Calling `ch.close()`
   * without consuming does not trigger cleanup.
   */
  listen(
    channel: string,
  ): Task<Channel<Notification, ListenFailed>, ListenFailed>
  /** Publish a notification to all listeners on a channel. */
  notify(channel: string, payload: string): Task<void, ListenFailed>
} {
  const db = new DatabaseSync(':memory:')
  const subscriptions = new Map<string, Channel<Notification, ListenFailed>[]>()
  let refs = 0

  return {
    connect: () => {
      refs++
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
          if (--refs === 0) db.close()
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

    listen(
      channel: string,
    ): Task<Channel<Notification, ListenFailed>, ListenFailed> {
      const invalid = validateChannel(channel)
      if (invalid) {
        return Task.of<Channel<Notification, ListenFailed>, ListenFailed>(
          () => {
            throw invalid
          },
        )
      }
      return Task.of<Channel<Notification, ListenFailed>, ListenFailed>(() => {
        const ch = Channel.create<Notification, ListenFailed>()
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

    notify(channel: string, payload: string): Task<void, ListenFailed> {
      const invalid = validateChannel(channel)
      if (invalid) {
        return Task.of<void, ListenFailed>(() => {
          throw invalid
        })
      }
      return Task.of<void, ListenFailed>(() => {
        const list = subscriptions.get(channel)
        if (!list) return
        const active = list.filter((ch) => !ch.isClosed())
        if (active.length === 0) {
          subscriptions.delete(channel)
          return
        }
        subscriptions.set(channel, active)
        for (const ch of active) {
          ch.send({ channel, payload })
        }
      })
    },
  }
}

function validateChannel(channel: string): ListenFailed | null {
  if (channel === '') return new ListenFailed('Channel name cannot be empty')
  if (encoder.encode(channel).length > 63) {
    return new ListenFailed(`Channel name exceeds 63 bytes: ${channel}`)
  }
  return null
}
