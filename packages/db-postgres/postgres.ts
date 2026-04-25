import pg from 'npm:pg@^8.11.0'
import Cursor from 'npm:pg-cursor@^2.0.0'
import {
  ConstraintViolation,
  type DBAdapter,
  type DBConnector,
  ListenFailed,
  type Notification,
  QueryFailed,
} from '@anabranch/db'
import { Channel, Task } from '@anabranch/anabranch'
import process from 'node:process'

const { Pool, Client } = pg

/**
 * Creates a PostgreSQL connector with connection pooling.
 */
export function createPostgres(
  options: PostgresOptions = {},
): PostgresConnector {
  const pool = new Pool(toPoolConfig(options))
  const clientConfig = toClientConfig(options)

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
    listen(
      pgChannel: string,
    ): Task<Channel<Notification, ListenFailed>, ListenFailed> {
      if (new TextEncoder().encode(pgChannel).length > 63) {
        return Task.of<Channel<Notification, ListenFailed>, ListenFailed>(
          () => {
            throw new ListenFailed(
              `Channel name exceeds 63 bytes: ${pgChannel}`,
            )
          },
        )
      }
      const escaped = '"' + pgChannel.replace(/"/g, '""') + '"'

      return Task.of<Channel<Notification, ListenFailed>, ListenFailed>(
        async () => {
          const client = new Client(clientConfig)

          const ch = Channel.create<Notification, ListenFailed>()
            .withOnClose(async () => {
              await client.query(`UNLISTEN ${escaped}`).catch(() => {})
              await client.end().catch(() => {})
            })

          await client.connect()
          await client.query(`LISTEN ${escaped}`)

          client.on(
            'notification',
            (msg: { channel: string; payload?: string }) => {
              ch.send({
                channel: msg.channel,
                payload: msg.payload ?? '',
              })
            },
          )
          client.on('error', (err: Error) => {
            ch.fail(new ListenFailed(err.message))
            ch.close()
          })
          client.on('end', () => {
            ch.close()
          })

          return ch
        },
      ).mapErr((err: unknown) =>
        err instanceof ListenFailed
          ? err
          : new ListenFailed(err instanceof Error ? err.message : String(err))
      )
    },
    notify(pgChannel: string, payload: string): Task<void, ListenFailed> {
      if (new TextEncoder().encode(pgChannel).length > 63) {
        return Task.of<void, ListenFailed>(() => {
          throw new ListenFailed(`Channel name exceeds 63 bytes: ${pgChannel}`)
        })
      }
      return Task.of<void, ListenFailed>(async () => {
        const client = await pool.connect()
        try {
          await client.query('SELECT pg_notify($1, $2)', [pgChannel, payload])
        } finally {
          client.release()
        }
      }).mapErr((err: unknown) =>
        err instanceof ListenFailed
          ? err
          : new ListenFailed(err instanceof Error ? err.message : String(err))
      )
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
  /**
   * Subscribe to a PostgreSQL NOTIFY channel.
   *
   * Resolves once the dedicated connection is established and LISTEN is issued.
   * The channel streams notifications until closed or the connection drops.
   * Cleanup (UNLISTEN + disconnect) happens automatically when the consumer
   * stops iterating.
   *
   * @example
   * ```ts
   * const ch = await connector.listen('orders').run()
   * for await (const n of ch.successes()) {
   *   console.log(n.payload)
   * }
   * ```
   */
  listen(
    channel: string,
  ): Task<Channel<Notification, ListenFailed>, ListenFailed>
  /**
   * Publish a notification to a channel.
   *
   * @example
   * ```ts
   * await connector.notify('orders', JSON.stringify(order)).run()
   * ```
   */
  notify(channel: string, payload: string): Task<void, ListenFailed>
}

function toClientConfig(options: PostgresOptions) {
  if (options.connectionString) {
    return { connectionString: options.connectionString }
  }
  return {
    host: options.host ?? process.env.PGHOST ?? 'localhost',
    port: options.port ?? parseInt(process.env.PGPORT ?? '5432'),
    user: options.user ?? process.env.PGUSER ?? 'postgres',
    password: options.password ?? process.env.PGPASSWORD ?? '',
    database: options.database ?? process.env.PGDATABASE ?? 'postgres',
  }
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
