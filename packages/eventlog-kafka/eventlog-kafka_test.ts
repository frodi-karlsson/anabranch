/**
 * Integration tests for eventlog-kafka require a live Kafka broker.
 * Set KAFKA_URL environment variable to run them.
 */
import {
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assertRejects,
} from '@std/assert'
import { Kafka } from 'kafkajs'
import { EventBatch, EventLog } from '@anabranch/eventlog'
import type { KafkaCursor, KafkaOptions } from './index.ts'
import { createKafka } from './index.ts'

const KAFKA_URL = Deno.env.get('KAFKA_URL')

Deno.test({
  name: 'EventLog.append - should return a partition:offset:uuid event id',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()
    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()

      const eventId = await log.append(topic, { action: 'created' }).run()

      // Format must be "partition:offset:uuid"
      assertMatch(eventId, /^\d+:\d+:[0-9a-f-]{36}$/)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'EventLog.consume - should allow in-band batch committing',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()

    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()
      const consumerGroup = `group-${crypto.randomUUID()}`
      const commited: string[] = []
      const consumer = log.consume<{ n: number }>(topic, consumerGroup).tap(
        async (batch) => {
          await batch.commit()

          const committed = await log.getCommittedCursor(topic, consumerGroup)
            .run()
          commited.push(committed?.partitions[0] ?? '')
        },
      ).take(1)

      await log.append(topic, { n: 1 }).run()
      await consumer.collect()

      assertEquals(commited.length, 1)
      assertEquals(commited[0], '1') // Offset should be 1 after committing the first event
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name:
    'EventLog.consume - should resume from committed cursor and skip earlier events',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()

    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()
      const consumerGroup = `resume-group-${crypto.randomUUID()}`
      const consumer = log.consume<{ n: number }>(topic, consumerGroup, {
        batchSize: 1,
      }).take(1).tap(async (batch) => {
        await batch.commit()
      })

      await log.append(topic, { n: 1 }).run()
      await log.append(topic, { n: 2 }).run()
      await log.append(topic, { n: 3 }).run()
      await consumer.collect()

      const stored = await log.getCommittedCursor(topic, consumerGroup).run()
      assertEquals(stored!.partitions[0], '1')

      const received: number[] = []
      const consumer2 = log.consume<{ n: number }>(topic, consumerGroup, {
        cursor: stored,
      }).take(2).tap((batch) => {
        for (const event of batch.events) {
          received.push(event.data.n)
        }
      })

      // Now, we start on offset=1 (cursor to resume from) so we should receive 2 and 3
      await consumer2.collect()
      assertEquals(received.includes(2), true)
      assertEquals(received.includes(3), true)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'EventLog.consume - batch.commit should fail if consumer is closed',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()
    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()
      await log.append(topic, { n: 1 }).run()
      const consumer = log.consume(topic, 'fail-group').take(1)

      const leakedBatch = await consumer.fold<
        EventBatch<unknown, KafkaCursor> | null
      >((_, batch) => batch, null)

      await assertRejects(
        () => leakedBatch!.commit(),
        Error,
        'Consumer is no longer active',
      )
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'EventLog.append - should persist custom timestamp and metadata',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()

    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()
      const customTimestamp = Date.now() - 5000

      const consumer = log.consume<{ action: string }>(
        topic,
        `meta-group-${crypto.randomUUID()}`,
      ).take(1)
      await log
        .append(topic, { action: 'created' }, {
          timestamp: customTimestamp,
          metadata: { source: 'test', version: '1.0' },
        })
        .run()

      const [batch] = await consumer.collect()

      const event = batch.events[0]
      assertEquals(event.timestamp, customTimestamp)
      assertEquals(event.metadata?.source, 'test')
      assertEquals(event.metadata?.version, '1.0')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'EventLog.getCommittedCursor - should return cursor after commit',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()

    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()
      const consumerGroup = `cursor-group-${crypto.randomUUID()}`
      const consumer = log.consume<{ n: number }>(topic, consumerGroup, {
        batchSize: 1,
      }).take(2).tap(async (batch) => {
        await batch.commit()
      })
      await log.append(topic, { n: 1 }).run()
      await log.append(topic, { n: 2 }).run()
      await consumer.collect()

      const cursor = await log.getCommittedCursor(topic, consumerGroup).run()

      assertEquals(cursor?.partitions[0], '2')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'EventLog.commit - should manually commit cursor',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()

    try {
      const log = await EventLog.connect(connector).run()

      const topic = await getUniqueTopic()
      const consumerGroup = `manual-commit-group-${crypto.randomUUID()}`
      const consumer = log.consume<{ n: number }>(topic, consumerGroup, {
        batchSize: 1,
      }).take(2).map<KafkaCursor>((batch) => batch.cursor)
      await log.append(topic, { n: 1 }).run()
      await log.append(topic, { n: 2 }).run()

      const cursors = await consumer.collect()
      assertEquals(cursors.length, 2)
      const firstOffset = cursors[0].partitions[0]
      const secondOffset = cursors[1].partitions[0]

      // It's rewind time
      await log.commit(topic, consumerGroup, cursors[0]).run()
      const stored = await log.getCommittedCursor(topic, consumerGroup).run()
      const firstStoredOffset = stored?.partitions[0]
      assertExists(firstStoredOffset)
      assertEquals(firstStoredOffset, firstOffset)
      assertNotEquals(firstStoredOffset, secondOffset)

      await log.commit(topic, consumerGroup, cursors[1]).run()
      const stored2 = await log.getCommittedCursor(topic, consumerGroup).run()
      const secondStoredOffset = stored2?.partitions[0]
      assertExists(secondStoredOffset)
      assertEquals(secondStoredOffset, secondOffset)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'EventLog - connector.end() should clean up and allow reconnect',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()

    const log1 = await EventLog.connect(connector).run()
    const topic = await getUniqueTopic()
    await log1.append(topic, { n: 1 }).run()

    await connector.end()

    // Create new connector after end
    const connector2 = makeConnector()
    const log2 = await EventLog.connect(connector2).run()
    await log2.append(topic, { n: 2 }).run()
    await connector2.end()
  },
})

Deno.test({
  name: 'EventLog.consume - should support AbortSignal',
  ignore: !KAFKA_URL,
  // For the life of me, I can't get it to stop gracefully mid-request. Only a timeout works, and that's no good
  // It's a feature now, not a bug
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const connector = makeConnector()

    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()
      const consumerGroup = `abort-group-${crypto.randomUUID()}`
      const ac = new AbortController()

      let resolve: () => void
      // fires when the first batch is received and processed
      const donePromise = new Promise<void>((res) => {
        resolve = res
      })

      const consumer = log
        .consume<{ index: number }>(topic, consumerGroup, {
          signal: ac.signal,
        })
        .tap(() => {
          resolve()
        })

      for (let i = 0; i < 5; i++) {
        await log.append(topic, { index: i }).run()
      }

      const resultPromise = consumer
        // Collects indefinitely until aborted
        .collect()

      await donePromise

      ac.abort()
      const results = await resultPromise
      const [result] = results
      await log.close().run()
      assertEquals(result.events.length > 0, true)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name:
    'EventLog.getCommittedCursor - should return null for non-existent consumer group',
  ignore: !KAFKA_URL,
  // Can't get it to stop gracefully mid-request, so we have to disable the test timeout. It's a feature now, not a bug
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const connector = makeConnector()
    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()

      const cursor = await log.getCommittedCursor(topic, 'non-existent-group')
        .run()
      assertEquals(cursor, null)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name:
    'EventLog.consume - should use backpressure and process all batches when buffer is full',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()

    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()

      for (let i = 1; i <= 10; i++) {
        await log.append(topic, { index: i }).run()
      }

      const consumerGroup = `backpressure-group-${crypto.randomUUID()}`
      const consumer = log.consume<{ index: number }>(
        topic,
        consumerGroup,
        { batchSize: 1, bufferSize: 1 },
      ).tap(async (batch) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        await batch.commit().catch(() => {})
      })
        .take(10)

      const processedCount = await consumer.fold((acc) => acc + 1, 0)
      assertEquals(processedCount, 10)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name:
    'EventLog.consume - should track offsets across multiple partitions independently',
  ignore: !KAFKA_URL,
  async fn() {
    const connector = makeConnector()
    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic(3)
      const consumerGroup = `multi-part-${crypto.randomUUID()}`
      const consumer = log.consume<{ p: number }>(topic, consumerGroup, {
        batchSize: 1,
      }).take(3).map(async (batch) => {
        await batch.commit()
        return batch.cursor
      })

      await log.append(topic, { p: 0 }, { partitionKey: '0' }).run()
      await log.append(topic, { p: 1 }, { partitionKey: '1' }).run()
      // murmur2?
      await log.append(topic, { p: 2 }, { partitionKey: '2' }).run()

      const cursors = await consumer.collect()

      const partitions = new Set(
        cursors.map((c) => Object.keys(c.partitions)[0]),
      )
      assertEquals(
        partitions.size,
        3,
        'Should have tracked all three partitions',
      )
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'EventLog.consume - should skip malformed JSON and trigger callback',
  ignore: !KAFKA_URL,
  async fn() {
    let malformedCaught = false
    const connector = makeConnector({
      onMalformedMessage: () => {
        malformedCaught = true
      },
    })

    try {
      const log = await EventLog.connect(connector).run()
      const topic = await getUniqueTopic()
      const consumerGroup = `poison-group-${crypto.randomUUID()}`

      const kafka = new Kafka({ brokers: KAFKA_URL!.split(',') })
      const producer = kafka.producer()
      await producer.connect()
      await producer.send({
        topic,
        messages: [{ value: 'NOT_JSON_AT_ALL' }],
      })
      await producer.disconnect()

      await log.append(topic, { valid: true }).run()

      const consumer = log.consume(topic, consumerGroup).take(1)
      const results = await consumer.collect()

      assertEquals(results.length, 1)
      assertEquals(results[0].events[0].data, { valid: true })
      assertEquals(
        malformedCaught,
        true,
        'The malformed callback should have fired',
      )
    } finally {
      await connector.end()
    }
  },
})

function makeBrokers() {
  return KAFKA_URL!.split(',')
}

function makeConnector(opt?: Partial<KafkaOptions>) {
  return createKafka({
    brokers: makeBrokers(),
    clientId: 'test-client',
    consumer: {
      maxWaitTimeInMs: 100,
      sessionTimeout: 6000,
      rebalanceTimeout: 6000,
      heartbeatInterval: 1000,
      retry: {
        initialRetryTime: 100,
        retries: 2,
      },
    },
    retry: {
      initialRetryTime: 100,
      retries: 2,
    },
    logLevel: 0,
    ...opt,
  })
}

async function getUniqueTopic(numPartitions = 1) {
  const topic = `test_topic_${crypto.randomUUID().replace(/-/g, '_')}`
  const kafka = new Kafka({
    brokers: makeBrokers(),
    retry: { retries: 10 },
  })
  const admin = kafka.admin()
  await admin.connect()

  await admin.createTopics({
    topics: [{
      topic,
      numPartitions,
      replicationFactor: 1,
    }],
  })

  await admin.disconnect()
  return topic
}
