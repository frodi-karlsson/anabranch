import { connect as amqpConnect } from 'npm:amqplib@^0.10'
import type { ChannelModel } from 'npm:amqplib@^0.10'
import type {
  QueueAdapter,
  QueueConnector,
  QueueOptions,
} from '@anabranch/queue'
import { QueueAborted } from '@anabranch/queue'
import { RabbitMQAdapter } from './adapter.ts'
import process from 'node:process'

/**
 * Creates a RabbitMQ queue connector.
 * @param options - Connection string or configuration options
 * @example
 * ```ts
 * const connector = createRabbitMQ("amqp://localhost:5672");
 * // or with options:
 * const connector = createRabbitMQ({
 *   connection: "amqp://localhost:5672",
 *   prefix: "my-app",
 *   queues: { notifications: { maxAttempts: 3 } }
 * });
 * ```
 */
export function createRabbitMQ(
  options?: string | RabbitMQQueueOptions,
): RabbitMQConnector {
  const isString = typeof options === 'string'
  const explicit = isString ? null : options
  const connection = isString
    ? options
    : explicit?.connection ?? process.env['RABBITMQ_URL'] ??
      'amqp://localhost:5672'
  const prefix = explicit?.prefix ?? 'abq'
  const queueConfigs = explicit?.queues ?? {}
  const defaultPrefetch = explicit?.defaultPrefetch ?? 10

  let conn: ChannelModel | undefined

  return {
    async connect(signal?: AbortSignal): Promise<QueueAdapter> {
      if (signal?.aborted) throw new QueueAborted('Connection aborted')

      if (!conn) {
        let attempts = 0
        const maxAttempts = 5
        const delay = 1000

        while (attempts < maxAttempts) {
          try {
            conn = await amqpConnect(connection as string)
            conn.on('error', () => {
              conn = undefined
            })
            conn.on('close', () => {
              conn = undefined
            })
            break
          } catch (error) {
            attempts++
            if (attempts >= maxAttempts) throw error
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }
      }

      const channel = await conn!.createChannel()
      channel.on('error', () => {
        // Channel error, usually followed by close
      })

      return new RabbitMQAdapter({
        channel,
        prefix,
        queueConfigs,
        defaultPrefetch,
      })
    },

    async end(): Promise<void> {
      if (conn) {
        await conn.close()
        conn = undefined
      }
    },
  }
}

/**
 * Configuration options for RabbitMQ connector.
 */
export interface RabbitMQQueueOptions {
  /** Connection URL or amqplib connection options */
  connection: string | object
  /** Prefix for queue names (default: "abq") */
  prefix?: string
  /** Queue-specific configuration */
  queues?: Record<string, QueueOptions>
  /** Default prefetch count (default: 10) */
  defaultPrefetch?: number
}

/**
 * RabbitMQ queue connector for creating adapter instances.
 */
export interface RabbitMQConnector extends QueueConnector {
  /** Establishes connection and returns a queue adapter */
  connect(signal?: AbortSignal): Promise<QueueAdapter>
  /** Closes the RabbitMQ connection */
  end(): Promise<void>
}
