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

export interface RabbitMQQueueOptions {
  connection: string | object
  prefix?: string
  queues?: Record<string, QueueOptions>
  defaultPrefetch?: number
}

export interface RabbitMQConnector extends QueueConnector {
  connect(signal?: AbortSignal): Promise<QueueAdapter>
  end(): Promise<void>
}
