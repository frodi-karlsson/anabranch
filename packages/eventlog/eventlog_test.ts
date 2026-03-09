import { assertEquals, assertExists } from '@std/assert'
import { createInMemory, EventLog } from './index.ts'

Deno.test({
  name: 'EventLog.append - should append an event and return an ID',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    const id = await log.append('users', { action: 'created', userId: 123 })
      .run()

    assertExists(id)
    assertEquals(typeof id, 'string')
    assertEquals(id.split('-').length, 5)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog.append - should support partition keys',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('orders', { orderId: 1 }, { partitionKey: 'user-123' })
      .run()
    await log.append('orders', { orderId: 2 }, { partitionKey: 'user-456' })
      .run()

    const { successes: events } = await log.consume(
      'orders',
      'partition-test',
      {
        batchSize: 10,
      },
    ).take(1).map((batch) => batch.events).flatMap((events) => events)
      .partition()

    assertEquals(events.length, 2)
    assertEquals(events[0].sequenceNumber, 0)
    assertEquals(events[1].sequenceNumber, 1)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog.consume - should yield event batches',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('notifications', { type: 'email' }).run()
    await log.append('notifications', { type: 'sms' }).run()
    await log.append('notifications', { type: 'push' }).run()

    const { successes } = await log.consume<{ type: string }>(
      'notifications',
      'processor-1',
    ).take(1).partition()

    assertEquals(successes.length, 1)
    assertEquals(successes[0].events.length, 3)
    assertEquals(successes[0].topic, 'notifications')
    assertEquals(successes[0].consumerGroup, 'processor-1')

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog.consume - cursor commits must be manual now',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('events', { value: 1 }).run()
    await log.append('events', { value: 2 }).run()
    await log.append('events', { value: 3 }).run()

    const { successes } = await log.consume<{ value: number }>(
      'events',
      'consumer-1',
      { batchSize: 2 },
    ).take(2).partition()

    assertEquals(successes.length, 2)

    const cursor = await log.getCommittedCursor('events', 'consumer-1').run()
    assertEquals(cursor, null)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog.consume - should resume from committed cursor',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('events', { value: 1 }).run()
    await log.append('events', { value: 2 }).run()
    await log.append('events', { value: 3 }).run()

    const ac1 = new AbortController()
    const stream1 = log.consume<{ value: number }>('events', 'processor-2', {
      batchSize: 2,
    }).take(1)
    const { successes: firstBatch } = await stream1.partition()
    await log.commit('events', 'processor-2', firstBatch[0].cursor).run()
    ac1.abort()

    const ac2 = new AbortController()
    const lastCursor = await log.getCommittedCursor('events', 'processor-2')
      .run()
    const stream2 = log
      .consume<{ value: number }>('events', 'processor-2', {
        cursor: lastCursor,
      })
      .take(1)
    const { successes: secondBatch } = await stream2.partition()

    assertEquals(secondBatch.length, 1)
    assertEquals(secondBatch[0].events.length, 1)
    assertEquals(secondBatch[0].events[0].data.value, 3)

    ac2.abort()
    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog.commit - should manually commit cursor',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('events', { value: 1 }).run()
    await log.append('events', { value: 2 }).run()

    const cursor = '0'
    await log.commit('events', 'manual-consumer', cursor).run()

    const committed = await log.getCommittedCursor('events', 'manual-consumer')
      .run()
    assertEquals(committed, cursor)

    await log.close().run()
  },
})

Deno.test({
  name:
    'EventLog.getCommittedCursor - should return null for new consumer group',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    const cursor = await log.getCommittedCursor('events', 'new-consumer').run()

    assertEquals(cursor, null)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog - connector.end() should clean up all resources',
  async fn() {
    const connector = createInMemory()
    const adapter = await connector.connect()

    await connector.end()

    let appendError: Error | undefined
    try {
      await adapter.append('test-topic', { data: 'after close' })
    } catch (e) {
      appendError = e as Error
    }
    assertExists(appendError)
    assertEquals(appendError.name, 'EventLogAppendFailed')
  },
})

Deno.test({
  name: 'EventLog.consume - should support batch size option',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    for (let i = 0; i < 10; i++) {
      await log.append('batch-topic', { index: i }).run()
    }

    const { successes: batches } = await log.consume<{ index: number }>(
      'batch-topic',
      'batch-consumer',
      { batchSize: 3 },
    ).take(4).partition()

    assertEquals(batches.length, 4)
    assertEquals(batches[0].events.length, 3)
    assertEquals(batches[1].events.length, 3)
    assertEquals(batches[2].events.length, 3)
    assertEquals(batches[3].events.length, 1)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog - should include timestamp and metadata in events',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    const timestamp = Date.now()
    await log.append('meta-topic', { data: 'test' }, {
      metadata: { source: 'test', version: '1.0' },
      timestamp,
    }).run()

    const { successes: events } = await log.consume(
      'meta-topic',
      'meta-consumer',
      { batchSize: 10 },
    ).take(1).map(
      (batch) => batch.events,
    ).flatMap((events) => events).partition()

    assertEquals(events.length, 1)
    assertEquals(events[0].timestamp, timestamp)
    assertEquals(events[0].metadata?.source, 'test')
    assertEquals(events[0].metadata?.version, '1.0')

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog.consume - should emit cursor in each batch',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('cursor-topic', { value: 1 }).run()
    await log.append('cursor-topic', { value: 2 }).run()

    const stream = log.consume<{ value: number }>(
      'cursor-topic',
      'cursor-check',
      { batchSize: 1 },
    )
      .take(2)
    const { successes } = await stream.partition()

    assertEquals(successes.length, 2)
    assertExists(successes[0].cursor)
    assertExists(successes[1].cursor)
    assertEquals(successes[0].cursor, '0')
    assertEquals(successes[1].cursor, '1')

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog - multiple topics should be isolated',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('topic-a', { id: 1 }).run()
    await log.append('topic-b', { id: 2 }).run()
    await log.append('topic-a', { id: 3 }).run()

    const { successes: topicA } = await log.consume<{ id: number }>(
      'topic-a',
      'consumer-a',
      { batchSize: 10 },
    ).take(1).map((batch) => batch.events).flatMap((events) => events)
      .partition()

    const { successes: topicB } = await log.consume<{ id: number }>(
      'topic-b',
      'consumer-b',
      { batchSize: 10 },
    ).take(1).map((batch) => batch.events).flatMap((events) => events)
      .partition()

    assertEquals(topicA.length, 2)
    assertEquals(topicB.length, 1)
    assertEquals(topicA[0].data.id, 1)
    assertEquals(topicB[0].data.id, 2)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog - should generate unique event IDs under concurrent load',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    const concurrency = 100
    const promises: Promise<string>[] = []
    for (let i = 0; i < concurrency; i++) {
      promises.push(log.append('concurrent-topic', { index: i }).run())
    }

    const ids = await Promise.all(promises)
    const uniqueIds = new Set(ids)

    assertEquals(uniqueIds.size, concurrency)
    assertEquals(ids.length, concurrency)

    const idFormat =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of ids) {
      assertEquals(id.match(idFormat) !== null, true)
    }

    await log.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'EventLog.consume - should support AbortSignal',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()
    const ac = new AbortController()

    for (let i = 0; i < 5; i++) {
      await log.append('signal-topic', { index: i }).run()
    }

    let batchesReceived = 0
    log
      .consume('signal-topic', 'signal-consumer', {
        signal: ac.signal,
        batchSize: 1,
      })
      .tap(() => {
        batchesReceived++
      })
      .take(2)
      .partition()

    await new Promise((resolve) => setTimeout(resolve, 50))

    assertEquals(batchesReceived, 2)

    ac.abort()
    await log.close().run()
  },
})

Deno.test('consume resumes from committed cursor when provided', async () => {
  const connector = createInMemory()
  const log = await EventLog.connect(connector).run()

  await log.append('events', { v: 1 }).run()
  await log.append('events', { v: 2 }).run()
  await log.append('events', { v: 3 }).run()

  const { successes } = await log
    .consume('events', 'g1', { batchSize: 2 })
    .take(1)
    .partition()

  await log.commit('events', 'g1', successes[0].cursor).run()

  const cursor = await log.getCommittedCursor('events', 'g1').run()

  const { successes: next } = await log
    .consume('events', 'g1', { cursor })
    .take(1)
    .partition()

  assertEquals(next[0].events.length, 1)

  await log.close().run()
})
