import {
  type Admin,
  AdminConfig,
  ConsumerConfig,
  EachBatchHandler,
  Kafka,
  KafkaConfig,
  type Producer,
  ProducerConfig,
} from 'kafkajs'
import type {
  AppendOptions,
  ConsumeOptions,
  Event,
  EventBatch,
  EventLogAdapter,
  EventLogConnector,
} from '@anabranch/eventlog'
import {
  EventLogKafkaAppendFailed,
  EventLogKafkaCloseFailed,
  EventLogKafkaCommitCursorFailed,
  EventLogKafkaConnectionFailed,
  EventLogKafkaConsumeFailed,
  EventLogKafkaGetCursorFailed,
} from './errors.ts'

/**
 * Creates a Kafka event log connector for production use.
 *
 * Supports Apache Kafka, Confluent Cloud, Redpanda, and other Kafka-compatible
 * services. Topics are auto-created on first append if they don't exist.
 *
 * @example Basic usage
 * ```ts
 * import { EventLog } from "@anabranch/eventlog";
 * import { createKafka } from "@anabranch/eventlog-kafka";
 *
 * const connector = createKafka({
 *   brokers: ["localhost:9092"],
 *   clientId: "my-app",
 *   consumer: {
 *     groupId: "my-consumer-group",
 *   },
 * });
 *
 * const log = await EventLog.connect(connector).run();
 * ```
 *
 * @example With SASL authentication (Confluent Cloud)
 * ```ts
 * const connector = createKafka({
 *   brokers: ["broker.confluent.cloud:9092"],
 *   clientId: "my-app",
 *   sasl: {
 *     mechanism: "plain",
 *     username: process.env.KAFKA_API_KEY,
 *     password: process.env.KAFKA_API_SECRET,
 *   },
 *   ssl: true,
 *   consumer: {
 *     groupId: "my-consumer-group",
 *   },
 * });
 * ```
 *
 * @example Handle malformed messages
 * ```ts
 * const connector = createKafka({
 *   brokers: ["localhost:9092"],
 *   clientId: "my-app",
 *   consumer: { groupId: "my-group" },
 *   onMalformedMessage: (topic, partition, offset, raw) => {
 *     console.error(`Malformed message at ${topic}[${partition}]@${offset}: ${raw}`);
 *   },
 * });
 * ```
 */
export function createKafka(options: KafkaOptions): KafkaConnector {
  const kafka = new Kafka({
    ...options,
  })

  let state: KafkaAdapterState | null = null

  const disconnectClients = async (
    producer: Producer,
    admin: Admin,
    activeConsumers: Set<() => Promise<void>> = new Set(),
  ): Promise<void> => {
    await Promise.allSettled([
      producer.disconnect(),
      admin.disconnect(),
      ...Array.from(activeConsumers).map((disconnect) => disconnect()),
    ])
  }

  const adapter: EventLogAdapter<KafkaCursor> = {
    async append<T>(
      topic: string,
      data: T,
      appendOptions?: AppendOptions,
    ): Promise<string> {
      if (!state || state.ended) {
        throw new EventLogKafkaAppendFailed(topic, 'Connector ended')
      }

      try {
        const id = crypto.randomUUID()
        const timestamp = appendOptions?.timestamp ?? Date.now()
        const partitionKey = appendOptions?.partitionKey

        const result = await state.producer.send({
          topic,
          messages: [
            {
              key: partitionKey ?? id,
              ...(partitionKey
                ? { partition: parseInt(partitionKey, 10) }
                : {}),
              value: JSON.stringify({
                id,
                data,
                timestamp,
                metadata: appendOptions?.metadata,
              }),
              timestamp: String(timestamp),
            },
          ],
        })

        const meta = result[0]
        const partition = meta?.partition ?? 0
        const offset = meta?.baseOffset ?? '0'

        return `${partition}:${offset}:${id}`
      } catch (error) {
        throw new EventLogKafkaAppendFailed(
          topic,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    },

    consume<T>(
      topic: string,
      consumerGroup: string,
      onBatch: (batch: EventBatch<T, KafkaCursor>) => void | Promise<void>,
      onError: (error: EventLogKafkaConsumeFailed) => void | Promise<void>,
      consumeOptions?: ConsumeOptions<KafkaCursor>,
    ): { close: () => Promise<void> } {
      if (!state || state.ended) {
        throw new EventLogKafkaConsumeFailed(topic, 'Connector ended')
      }

      const batchSize = consumeOptions?.batchSize ?? 10
      const signal = consumeOptions?.signal
      const startCursor = consumeOptions?.cursor

      const consumer = state.kafka.consumer({
        retry: { retries: 10 },
        ...options.consumer,
        groupId: consumerGroup,
      })

      let closed = false
      const closeConsumer = async () => {
        if (closed) return
        closed = true
        state?.activeConsumers.delete(closeConsumer)
        await consumer.disconnect().catch(() => {})
      }

      state.activeConsumers.add(closeConsumer)

      if (startCursor) {
        const removeListener = consumer.on(
          consumer.events.GROUP_JOIN,
          ({ payload }) => {
            removeListener()

            const assignedPartitions =
              (payload.memberAssignment as Record<string, number[]>)?.[topic] ??
                []
            for (const partition of assignedPartitions) {
              const offset = startCursor.partitions[partition]
              if (offset && offset !== '-1' && offset !== '-2') {
                consumer.seek({ topic, partition, offset })
              }
            }
          },
        )
      }

      const createCommitFn = (
        resolveOffset: (offset: string) => void,
        currentOffset: string,
        nextOffset: string,
        partition: number,
      ) => {
        return async () => {
          if (closed || !state || state.ended) {
            throw new EventLogKafkaCommitCursorFailed(
              topic,
              consumerGroup,
              'Consumer is no longer active',
            )
          }
          resolveOffset(currentOffset)
          await consumer.commitOffsets([{
            topic,
            partition,
            offset: nextOffset,
          }])
        }
      }

      const handleEachBatch: EachBatchHandler = async ({
        batch,
        heartbeat,
        isRunning,
        isStale,
        resolveOffset,
      }) => {
        const partition = batch.partition
        let events: Event<T>[] = []
        let latestProcessedOffset: string | null = null
        let batchesEmitted = 0

        for (const message of batch.messages) {
          if (!isRunning() || isStale() || closed) break

          latestProcessedOffset = message.offset
          const valueStr = message.value?.toString()
          if (!valueStr) continue

          try {
            const parsed = JSON.parse(valueStr) as {
              id?: string
              data: T
              timestamp?: number
              metadata?: Record<string, unknown>
            }

            events.push({
              id: parsed.id ?? crypto.randomUUID(),
              topic,
              data: parsed.data,
              partitionKey: message.key?.toString() ?? '',
              sequenceNumber: message.offset,
              timestamp: parsed.timestamp ?? parseInt(message.timestamp, 10),
              metadata: parsed.metadata,
            })

            if (events.length >= batchSize) {
              const currentOffset = latestProcessedOffset
              const next = String(BigInt(currentOffset) + 1n)
              batchesEmitted++

              await onBatch({
                topic,
                consumerGroup,
                events,
                cursor: { partitions: { [partition]: next } },
                commit: createCommitFn(
                  resolveOffset,
                  currentOffset,
                  next,
                  partition,
                ),
              })

              events = []
              await heartbeat()
            }
          } catch {
            options.onMalformedMessage?.(
              topic,
              partition,
              message.offset,
              valueStr,
            )
          }
        }

        // Process leftovers or poison pills after the loop finishes
        if (
          latestProcessedOffset !== null && isRunning() && !isStale() && !closed
        ) {
          const currentOffset = latestProcessedOffset
          const next = String(BigInt(currentOffset) + 1n)
          await heartbeat()

          if (events.length === 0) {
            if (batchesEmitted === 0) {
              resolveOffset(currentOffset)
              await consumer.commitOffsets([{ topic, partition, offset: next }])
            }
            return
          }

          batchesEmitted++
          await onBatch({
            topic,
            consumerGroup,
            events,
            cursor: { partitions: { [partition]: next } },
            commit: createCommitFn(
              resolveOffset,
              currentOffset,
              next,
              partition,
            ),
          })

          await heartbeat()
        }
      }

      const run = async () => {
        if (closed) return
        try {
          await consumer.connect()
          if (closed) return
          await consumer.subscribe({ topic, fromBeginning: !startCursor })
          if (closed) return
          await consumer.run({
            autoCommit: false,
            eachBatchAutoResolve: false,
            eachBatch: handleEachBatch,
          })
        } catch (error) {
          if (!closed) {
            await onError(
              new EventLogKafkaConsumeFailed(
                topic,
                error instanceof Error ? error.message : String(error),
                error,
              ),
            )
          }
        }
      }

      run().catch((error) => {
        if (!closed) {
          onError(
            new EventLogKafkaConsumeFailed(
              topic,
              error instanceof Error ? error.message : String(error),
              error,
            ),
          )
        }
      })

      signal?.addEventListener('abort', closeConsumer, { once: true })

      return { close: closeConsumer }
    },

    async getCursor(
      topic: string,
      consumerGroup: string,
    ): Promise<KafkaCursor | null> {
      if (!state || state.ended) {
        throw new EventLogKafkaGetCursorFailed(
          topic,
          consumerGroup,
          'Connector ended',
        )
      }

      try {
        const [firstOffset] = await state.admin.fetchOffsets({
          groupId: consumerGroup,
          topics: [topic],
        })

        if (!firstOffset.partitions.length) return null

        const partitions: Record<number, string> = {}
        for (const { partition, offset } of firstOffset.partitions) {
          if (
            offset != null && offset !== '' && offset !== '-1' &&
            offset !== '-2'
          ) {
            const lastOffset = BigInt(offset)
            if (lastOffset >= 0n) {
              partitions[partition] = String(lastOffset)
            }
          }
        }

        if (Object.keys(partitions).length === 0) return null

        return { partitions }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (
          msg.includes('does not host this topic') ||
          msg.includes('UnknownTopicOrPartition')
        ) {
          return null
        }
        throw new EventLogKafkaGetCursorFailed(topic, consumerGroup, msg, error)
      }
    },

    async commitCursor(
      topic: string,
      consumerGroup: string,
      cursor: KafkaCursor,
    ): Promise<void> {
      if (!state || state.ended) {
        throw new EventLogKafkaCommitCursorFailed(
          topic,
          consumerGroup,
          'Connector ended',
        )
      }

      try {
        const offsetsToCommit = Object.entries(cursor.partitions)
          .filter(([, offset]) => offset !== '-1' && offset !== '-2')
          .map(([partition, offset]) => ({
            partition: parseInt(partition, 10),
            offset: String(BigInt(offset)),
          }))

        // Looks stupid? This is how admin.setOffsets literally works, but it has the default wait time (5000!!)
        const dummyConsumer = state.kafka.consumer({
          ...options.consumer,
          maxWaitTimeInMs: options.admin?.dummyMaxWaitTimeInMs ?? 100,
          groupId: consumerGroup,
        })
        try {
          await dummyConsumer.connect()
          await dummyConsumer.subscribe({ topic, fromBeginning: true })

          await new Promise<void>((resolve, reject) => {
            dummyConsumer.on(dummyConsumer.events.FETCH, () => {
              dummyConsumer.stop().then(resolve).catch(reject)
            })

            dummyConsumer.run({
              eachBatchAutoResolve: false,
            }).catch(reject)

            dummyConsumer.pause([{ topic }])

            for (const { partition, offset } of offsetsToCommit) {
              dummyConsumer.seek({ topic, partition, offset })
            }
          })
        } finally {
          await dummyConsumer.disconnect()
        }
      } catch (error) {
        throw new EventLogKafkaCommitCursorFailed(
          topic,
          consumerGroup,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    },

    async close(): Promise<void> {
      if (!state || state.ended) {
        throw new EventLogKafkaCloseFailed('Connector ended')
      }

      try {
        await disconnectClients(
          state.producer,
          state.admin,
          state.activeConsumers,
        )
        state.ended = true
        state = null
      } catch (error) {
        throw new EventLogKafkaCloseFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    },
  }

  return {
    async connect(): Promise<EventLogAdapter<KafkaCursor>> {
      if (state?.ended) {
        throw new EventLogKafkaConnectionFailed('Connector ended')
      }

      if (state) {
        return adapter
      }

      try {
        const producer = kafka.producer({
          ...options.producer,
        })
        const admin = kafka.admin({
          ...options.admin,
        })

        await producer.connect()
        await admin.connect()

        state = {
          kafka,
          producer,
          admin,
          ended: false,
          activeConsumers: new Set(),
        }

        return adapter
      } catch (error) {
        throw new EventLogKafkaConnectionFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    },

    async end(): Promise<void> {
      if (!state) return

      state.ended = true
      // Pass the active consumers to ensure they are cleaned up on teardown
      await disconnectClients(
        state.producer,
        state.admin,
        state.activeConsumers,
      )
      state = null
    },
  }
}

export interface KafkaConnector extends EventLogConnector<KafkaCursor> {
  connect(): Promise<EventLogAdapter<KafkaCursor>>
}

/**
 * Cursor type for Kafka, tracking position across partitions.
 *
 * Maps partition numbers to the next offset to consume (the value committed to Kafka / used in seek)
 */
export interface KafkaCursor {
  /** Mapping of partition number to offset string. */
  partitions: Record<number, string>
}

/**
 * Configuration options for Kafka event log connector.
 *
 * Extends KafkaJS configuration with additional event log options.
 *
 * @example Basic configuration
 * ```ts
 * const connector = createKafka({
 *   brokers: ["localhost:9092"],
 *   clientId: "my-app",
 *   consumer: {
 *     groupId: "my-consumer-group",
 *   },
 * });
 * ```
 *
 * @example With SASL authentication
 * ```ts
 * const connector = createKafka({
 *   brokers: ["broker.confluent.cloud:9092"],
 *   clientId: "my-app",
 *   sasl: {
 *     mechanism: "plain",
 *     username: "apiKey",
 *     password: "apiSecret",
 *   },
 *   ssl: true,
 *   consumer: {
 *     groupId: "my-consumer-group",
 *   },
 * });
 * ```
 */
export interface KafkaOptions extends KafkaConfig {
  /**
   * Callback for handling malformed messages that cannot be parsed.
   *
   * Called when a message cannot be deserialized. If not provided,
   * malformed messages are silently skipped.
   */
  onMalformedMessage?: (
    topic: string,
    partition: number,
    offset: string,
    raw: string,
  ) => void
  producer?: ProducerConfig
  admin?: AdminConfig & {
    /**
     * The out-of-band commit works by spinning up a temporary consumer to call admin.setOffsets
     * which uses the consumer's maxWaitTimeInMs as the timeout for the request.
     * This is that.
     */
    dummyMaxWaitTimeInMs?: number
  }
  /** Kafka consumer configuration. Must include groupId. */
  consumer: Omit<ConsumerConfig, 'groupId'>
}

interface KafkaAdapterState {
  kafka: Kafka
  producer: Producer
  admin: Admin
  ended: boolean
  activeConsumers: Set<() => Promise<void>>
}
