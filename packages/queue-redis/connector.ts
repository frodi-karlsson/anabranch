import { Redis } from 'npm:ioredis@^5'
import type { Redis as RedisClient, RedisOptions } from 'npm:ioredis@^5'
import type {
  QueueAdapter,
  QueueConnector,
  QueueOptions,
} from '@anabranch/queue'
import { RedisAdapter } from './adapter.ts'
import process from 'node:process'

export function createRedis(
  options?: string | RedisQueueOptions,
): RedisConnector {
  const opts = typeof options === 'string'
    ? { connection: options }
    : (options ?? {
      connection: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    })
  const prefix = opts.prefix ?? 'abq'
  const queueConfigs = opts.queues ?? {}
  const defaultVisibility = opts.defaultVisibilityTimeout ?? 30_000
  const defaultMaxAttempts = opts.defaultMaxAttempts ?? 3

  let client: RedisClient | undefined

  return {
    async connect(): Promise<QueueAdapter> {
      if (!client) {
        const conn = opts.connection
        client = typeof conn === 'string' ? new Redis(conn) : new Redis(conn)
        await client.ping()
      }
      return new RedisAdapter({
        redis: client,
        prefix,
        queueConfigs,
        defaultVisibility,
        defaultMaxAttempts,
      })
    },

    async end(): Promise<void> {
      if (client) {
        try {
          await client.quit()
        } catch {
          // Ignore quit errors if connection is already dead
        } finally {
          client.disconnect()
          client = undefined
        }
      }
    },
  }
}

export interface RedisQueueOptions {
  connection: string | RedisOptions
  prefix?: string
  queues?: Record<string, QueueOptions>
  defaultVisibilityTimeout?: number
  defaultMaxAttempts?: number
}

export interface RedisConnector extends QueueConnector {
  connect(): Promise<QueueAdapter>
  end(): Promise<void>
}
