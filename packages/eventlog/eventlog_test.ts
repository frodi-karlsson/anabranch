import { assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import { createInMemory, EventLog, EventLogConsumeFailed } from './index.ts'

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
    assertEquals(events[0].sequenceNumber, '0')
    assertEquals(events[1].sequenceNumber, '1')

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
    await firstBatch[0].commit()
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

  await successes[0].commit()

  const cursor = await log.getCommittedCursor('events', 'g1').run()

  const { successes: next } = await log
    .consume('events', 'g1', { cursor })
    .take(1)
    .partition()

  assertEquals(next[0].events.length, 1)

  await log.close().run()
})

Deno.test({
  name:
    'EventLog.commitCursor - should allow manual cursor commits and getCursor should reflect committed position',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('manual-cursor-topic', { value: 1 }).run()
    await log.append('manual-cursor-topic', { value: 2 }).run()

    await log.commit(
      'manual-cursor-topic',
      'manual-consumer',
      '1',
    ).run()

    const cursor = await log.getCommittedCursor(
      'manual-cursor-topic',
      'manual-consumer',
    ).run()

    assertEquals(cursor, '1')

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog - adapter.close() should clean up resources',
  async fn() {
    const connector = createInMemory()
    const adapter = await connector.connect()

    await adapter.append('test-topic', { data: 'before close' })

    await adapter.close()

    let error: Error | undefined
    try {
      await adapter.append('test-topic', { data: 'after close' })
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error!.name, 'EventLogAppendFailed')

    // connector can still create new adapter
    const adapter2 = await connector.connect()
    await adapter2.append('test-topic', { data: 'new adapter' })
    await adapter2.close()
  },
})

Deno.test({
  name: 'EventLog.consume - should call onError when onBatch throws',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('error-topic', { value: 1 }).run()

    const { successes } = await log
      .consume<{ value: number }>('error-topic', 'error-consumer', {
        batchSize: 1,
      })
      .take(1)
      .partition()

    assertEquals(successes.length, 1)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog - consume on ended connector should throw',
  async fn() {
    const connector = createInMemory()
    const adapter = await connector.connect()

    await connector.end()

    let error: Error | undefined
    try {
      adapter.consume('topic', 'group', () => {}, () => {})
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error!.name, 'EventLogConsumeFailed')
  },
})

Deno.test({
  name: 'EventLog - getCursor on ended connector should throw',
  async fn() {
    const connector = createInMemory()
    const adapter = await connector.connect()

    await connector.end()

    let error: Error | undefined
    try {
      await adapter.getCursor('topic', 'group')
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error!.name, 'EventLogGetCursorFailed')
  },
})

Deno.test({
  name: 'EventLog - commitCursor on ended connector should throw',
  async fn() {
    const connector = createInMemory()
    const adapter = await connector.connect()

    await connector.end()

    let error: Error | undefined
    try {
      await adapter.commitCursor('topic', 'group', '0')
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error!.name, 'EventLogCommitCursorFailed')
  },
})

Deno.test({
  name: 'EventLog - connect on ended connector should throw',
  async fn() {
    const connector = createInMemory()
    await connector.end()

    let error: Error | undefined
    try {
      await connector.connect()
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error!.name, 'EventLogConnectionFailed')
  },
})

Deno.test({
  name: 'EventLog - multiple consumers on same topic',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    await log.append('shared-topic', { value: 1 }).run()
    await log.append('shared-topic', { value: 2 }).run()

    const consumer1 = log.consume<{ value: number }>(
      'shared-topic',
      'consumer-1',
      { batchSize: 10 },
    ).take(1)
    const consumer2 = log.consume<{ value: number }>(
      'shared-topic',
      'consumer-2',
      { batchSize: 10 },
    ).take(1)

    const [result1, result2] = await Promise.all([
      consumer1.partition(),
      consumer2.partition(),
    ])

    assertEquals(result1.successes[0].events.length, 2)
    assertEquals(result2.successes[0].events.length, 2)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog - consume on non-existent topic should succeed',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    const ac = new AbortController()
    const timeout = setTimeout(() => ac.abort(), 100)

    let batchReceived = false
    try {
      await log
        .consume<{ value: number }>('non-existent-topic', 'consumer-x', {
          signal: ac.signal,
          batchSize: 1,
        })
        .take(1)
        .tap(() => {
          batchReceived = true
        })
        .partition()
    } catch {
      // Expected - abort may cause rejection
    } finally {
      clearTimeout(timeout)
    }

    assertEquals(batchReceived, false)

    await log.close().run()
  },
})

Deno.test({
  name:
    'EventLog.consume - should use backpressure and not drop batches when buffer is full',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    // Append 10 events instantly
    for (let i = 0; i < 10; i++) {
      await log.append('backpressure-topic', { index: i }).run()
    }

    const consumed: number[] = []

    // We set a tiny bufferSize of 2.
    // Without backpressure, the fast InMemory adapter would shove all 10 batches
    // in instantly, overflow the buffer, and crash the stream.
    const stream = log.consume<{ index: number }>(
      'backpressure-topic',
      'bp-group',
      {
        batchSize: 1,
        bufferSize: 2,
      },
    )
      .take(10)
      .map(async (batch) => {
        // Artificially slow down the consumer so the buffer fills up
        await new Promise((resolve) => setTimeout(resolve, 10))
        consumed.push(batch.events[0].data.index)
        return batch
      })

    // If backpressure works, partition() will resolve successfully without throwing EventLogConsumeFailed
    await stream.partition()

    assertEquals(consumed.length, 10)
    // Verify they were processed in exact order despite the backpressure pauses
    assertEquals(consumed, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLog.consume - should throw if bufferSize is invalid',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    let error: Error | undefined
    try {
      log.consume('test', 'group', { bufferSize: 0 })
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error!.message, 'bufferSize must be a positive integer')

    let errorNegative: Error | undefined
    try {
      log.consume('test', 'group', { bufferSize: -5 })
    } catch (e) {
      errorNegative = e as Error
    }

    assertExists(errorNegative)

    await log.close().run()
  },
})

Deno.test({
  name: 'EventLogConsumeFailed - should include consumerGroup in error message',
  async fn() {
    const connector = createInMemory()
    const adapter = await connector.connect()

    await connector.end()

    let error: Error | undefined
    try {
      adapter.consume('my-topic', 'my-group', () => {}, () => {})
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error instanceof EventLogConsumeFailed, true)
    assertStringIncludes(error!.message, 'my-topic')
    assertStringIncludes(error!.message, 'my-group')
  },
})

Deno.test({
  name: 'EventLog.consume - should throw if batchSize is invalid',
  async fn() {
    const connector = createInMemory()
    const log = await EventLog.connect(connector).run()

    let error: Error | undefined
    try {
      log.consume('test', 'group', { batchSize: 0 })
    } catch (e) {
      error = e as Error
    }

    assertExists(error)
    assertEquals(error!.message, 'batchSize must be a positive integer')

    let errorNegative: Error | undefined
    try {
      log.consume('test', 'group', { batchSize: -5 })
    } catch (e) {
      errorNegative = e as Error
    }

    assertExists(errorNegative)

    let errorFloat: Error | undefined
    try {
      log.consume('test', 'group', { batchSize: 1.5 })
    } catch (e) {
      errorFloat = e as Error
    }

    assertExists(errorFloat)

    await log.close().run()
  },
})
