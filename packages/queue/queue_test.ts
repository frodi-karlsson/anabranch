import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { createInMemory, Queue, QueueBufferFull } from './index.ts'
import type { QueueConnector, QueueMessage } from './adapter.ts'

Deno.test({
  name: 'Queue.send - should send a message and return an ID',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    const id = await queue.send('test-queue', { key: 'value' }).run()

    assertExists(id)
    assertEquals(typeof id, 'string')
    assertEquals(id.split('-').length, 5)

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.receive - should receive sent messages',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()
    const sentData = { userId: 123, type: 'welcome' as const }

    await queue.send('test-queue', sentData).run()

    const stream = queue.stream<typeof sentData>('test-queue')
    const { successes } = await stream.partition()

    assertEquals(successes.length, 1)
    assertEquals(successes[0].data, sentData)

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.ack - should acknowledge messages',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue.send('test-queue', { id: 1 }).run()
    await queue.send('test-queue', { id: 2 }).run()

    const stream1 = queue.stream<{ id: number }>('test-queue')
    const { successes: initial } = await stream1.partition()
    assertEquals(initial.length, 2)

    await queue.ack('test-queue', initial[0].id, initial[1].id).run()

    const stream2 = queue.stream<{ id: number }>('test-queue')
    const { successes: afterAck } = await stream2.partition()
    assertEquals(afterAck.length, 0)

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.stream - should support concurrent processing',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    for (let i = 0; i < 5; i++) {
      await queue.send('test-queue', { index: i }).run()
    }

    const stream = queue.stream<{ index: number }>('test-queue')
      .withConcurrency(3).map(async (msg) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return msg.data?.index
      })
    const { successes } = await stream.partition()

    assertEquals(successes.length, 5)

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.stream - should collect errors alongside successes',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue.send('test-queue', { type: 'success' as const }).run()
    await queue.send('test-queue', { type: 'fail' as const }).run()

    const stream = queue.stream<{ type: 'success' | 'fail' }>('test-queue')
    const { successes, errors } = await stream
      .map((msg) => {
        if (msg.data?.type === 'fail') {
          throw new Error('Processing failed')
        }
        return msg.data
      })
      .partition()

    assertEquals(successes.length, 1)
    assertEquals(errors.length, 1)

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.send - should support delayed messages',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue.send('test-queue', { delayed: true }, { delayMs: 50 }).run()

    let delayedCount = 0
    for (let i = 0; i < 15; i++) {
      const stream = queue.stream<{ delayed: boolean }>('test-queue')
      const { successes } = await stream.partition()
      if (successes.length > 0) {
        delayedCount = successes.length
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assertEquals(delayedCount, 1)

    await queue.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'Queue.nack - should support requeue',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue.send('test-queue', { data: 'original' }).run()

    const firstStream = queue.stream<{ data: string }>('test-queue')
    const { successes: first } = await firstStream.partition()
    assertEquals(first.length, 1)
    assertEquals(first[0].attempt, 1)

    await queue.nack('test-queue', first[0].id, { requeue: true }).run()

    const afterStream = queue.stream<{ data: string }>('test-queue')
    const { successes: afterNack } = await afterStream.partition()
    assertEquals(afterNack.length, 1)
    assertEquals(afterNack[0].attempt, 2)

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.sendBatch - should send multiple messages',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]

    const ids = await queue.sendBatch('test-queue', items).run()

    assertEquals(ids.length, 3)
    assertEquals(typeof ids[0], 'string')

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue - connector.end() should clean up all resources',
  async fn() {
    const connector = createInMemory()
    const adapter = await connector.connect()

    await connector.end()

    let sendError: Error | undefined
    try {
      await adapter.send('test-queue', { data: 'after close' })
    } catch (e) {
      sendError = e as Error
    }
    assertExists(sendError)
    assertEquals(sendError.message, 'Connector ended')
    assertEquals(sendError.name, 'QueueSendFailed')
  },
})

Deno.test({
  name: 'Queue - DLQ routing on max attempts exceeded',
  async fn() {
    const connector = createInMemory({
      queues: {
        'test-queue': {
          maxAttempts: 2,
          deadLetterQueue: 'test-dlq',
        },
      },
    })

    const queue = await Queue.connect(connector).run()
    await queue.send('test-queue', { data: 'failing' }).run()

    const firstStream = queue.stream<{ data: string }>('test-queue')
    const { successes: first } = await firstStream.partition()
    assertEquals(first.length, 1)
    assertEquals(first[0].attempt, 1)

    await queue.nack('test-queue', first[0].id, { requeue: true }).run()

    const secondStream = queue.stream<{ data: string }>('test-queue')
    const { successes: second } = await secondStream.partition()
    assertEquals(second.length, 1)
    assertEquals(second[0].attempt, 2)

    await queue.nack('test-queue', second[0].id, { requeue: true }).run()

    const dlqStream = queue.stream('test-dlq')
    const { successes: dlq } = await dlqStream.partition()
    assertEquals(dlq.length, 1)
    assertEquals(
      (dlq[0].data as { originalId: string }).originalId,
      second[0].id,
    )

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue - should call onDrop when buffer exceeds maxBufferSize',
  async fn() {
    const connector = createInMemory({
      maxBufferSize: 2,
      onDrop: () => {},
    })

    const queue = await Queue.connect(connector).run()

    await queue.send('test-queue', { id: 1 }).run()
    await queue.send('test-queue', { id: 2 }).run()

    await assertRejects(
      () => queue.send('test-queue', { id: 3 }).run(),
      QueueBufferFull,
    )

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.continuousStream - should yield messages continuously',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()
    const ac = new AbortController()

    const stream = queue
      .continuousStream<{ value: number }>('test-queue', {
        signal: ac.signal,
        count: 5,
      })
      .take(3)

    await queue.send('test-queue', { value: 1 }).run()
    await queue.send('test-queue', { value: 2 }).run()
    await queue.send('test-queue', { value: 3 }).run()

    const { successes } = await stream.partition()

    assertEquals(successes.length, 3)
    assertEquals(successes.map((s) => s.data?.value), [1, 2, 3])

    ac.abort()
    await queue.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'Queue.continuousStream - should stop on AbortSignal',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()
    const ac = new AbortController()
    let messagesReceived = 0

    queue
      .continuousStream<{ value: number }>('test-queue', {
        signal: ac.signal,
        count: 5,
      })
      .tap(() => {
        messagesReceived++
      })

    await new Promise((resolve) => setTimeout(resolve, 100))

    assertEquals(messagesReceived, 0)

    ac.abort()
    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue.continuousStream - should support concurrent processing',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    for (let i = 0; i < 5; i++) {
      await queue.send('test-queue', { index: i }).run()
    }

    const ac = new AbortController()

    const stream = queue
      .continuousStream<{ index: number }>('test-queue', {
        signal: ac.signal,
        count: 5,
      })
      .withConcurrency(3)
      .map(async (msg) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return msg.data?.index
      })
      .take(5)

    const { successes } = await stream.partition()
    assertEquals(successes.length, 5)

    ac.abort()
    await queue.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'Queue.continuousStream - should emit errors as error results',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()
    const ac = new AbortController()

    await queue.send('test-queue', { value: 1 }).run()
    await queue.send('test-queue', { value: -1 }).run()
    await queue.send('test-queue', { value: 2 }).run()

    const stream = queue
      .continuousStream<{ value: number }>('test-queue', {
        signal: ac.signal,
        count: 5,
      })
      .map((msg) => {
        if (msg.data?.value === -1) throw new Error('Processing failed')
        return msg.data?.value
      })
      .take(2)

    const { successes, errors } = await stream.partition()

    assertEquals(successes.length, 2)
    assertEquals(errors.length, 1)

    ac.abort()
    await queue.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'Queue - visibility timeout should requeue unacked messages',
  async fn() {
    const connector = createInMemory({
      queues: {
        'test-queue': {
          visibilityTimeout: 100,
        },
      },
    })

    const queue = await Queue.connect(connector).run()
    await queue.send('test-queue', { value: 'visible' }).run()

    const stream1 = queue.stream<{ value: string }>('test-queue')
    const { successes: first } = await stream1.partition()
    assertEquals(first.length, 1)

    await new Promise((resolve) => setTimeout(resolve, 150))

    const stream2 = queue.stream<{ value: string }>('test-queue')
    const { successes: afterVisibility } = await stream2.partition()
    assertEquals(afterVisibility.length, 1)
    assertEquals(afterVisibility[0].attempt, 1)

    await queue.ack('test-queue', afterVisibility[0].id).run()

    await queue.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'Queue.nack - should find message in delayed queue',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue
      .send('test-queue', { data: 'original' }, { delayMs: 500 })
      .run()

    await new Promise((resolve) => setTimeout(resolve, 550))

    const stream = queue.stream<{ data: string }>('test-queue')
    const { successes: first } = await stream.partition()
    assertEquals(first.length, 1)

    await queue.nack('test-queue', first[0].id, { requeue: true }).run()

    const stream2 = queue.stream<{ data: string }>('test-queue')
    const { successes: afterNack } = await stream2.partition()
    assertEquals(afterNack.length, 1)
    assertEquals(afterNack[0].attempt, 2)

    await queue.close().run()
    await connector.end()
  },
})

Deno.test({
  name:
    'Queue.continuousStream - should emit adapter receive errors as error results',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()
    const ac = new AbortController()

    let streamError: Error | undefined

    const stream = queue
      .continuousStream<{ value: number }>('test-queue', {
        signal: ac.signal,
        count: 1,
      })
      .tapErr((err) => {
        streamError = err
        ac.abort()
      })
      .partition()

    await new Promise((resolve) => setTimeout(resolve, 100))
    await connector.end()
    await stream
    ac.abort()

    assertExists(streamError)
    assertEquals(streamError.name, 'QueueReceiveFailed')
  },
})

Deno.test({
  name: 'Queue.send - should generate unique IDs under concurrent load',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    const concurrency = 100
    const promises: Promise<string>[] = []
    for (let i = 0; i < concurrency; i++) {
      promises.push(queue.send('test-queue', { index: i }).run())
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

    await queue.close().run()
    await connector.end()
  },
})

Deno.test({
  name: 'Queue.send - should include headers in message metadata on receive',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue
      .send('test-queue', { data: 'test' }, {
        headers: {
          'x-correlation-id': 'abc-123',
          'x-source': 'checkout-service',
        },
      })
      .run()

    const stream = queue.stream<{ data: string }>('test-queue')
    const { successes } = await stream.partition()

    assertEquals(successes.length, 1)
    assertEquals(
      successes[0].metadata?.headers?.['x-correlation-id'],
      'abc-123',
    )
    assertEquals(
      successes[0].metadata?.headers?.['x-source'],
      'checkout-service',
    )

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue - multiple messages with different headers',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue
      .send('test-queue', { id: 1 }, { headers: { 'x-tenant': 'acme' } })
      .run()
    await queue
      .send('test-queue', { id: 2 }, { headers: { 'x-tenant': 'globex' } })
      .run()

    const stream = queue.stream<{ id: number }>('test-queue')
    const { successes } = await stream.partition()

    assertEquals(successes.length, 2)
    assertEquals(successes[0].metadata?.headers?.['x-tenant'], 'acme')
    assertEquals(successes[1].metadata?.headers?.['x-tenant'], 'globex')

    await queue.close().run()
  },
})

Deno.test({
  name:
    'Queue.continuousStream - should capture errors from StreamAdapter subscription',
  async fn() {
    const connector = {
      connect: () =>
        Promise.resolve({
          subscribe: () => {
            return (async function* () {
              yield { id: '1', data: 'ok', attempt: 1, timestamp: Date.now() }
              throw new Error('connection lost')
            })()
          },
          close: () => Promise.resolve(),
        }),
      end: () => Promise.resolve(),
    }

    const queue = await Queue.connect(connector as unknown as QueueConnector)
      .run()
    const results = await queue.continuousStream('test').toArray()

    assertEquals(results.length, 2)
    assertEquals(results[0].type, 'success')
    assertEquals(results[1].type, 'error')
    assertEquals(
      (results[1] as { type: 'error'; error: Error }).error.message,
      'connection lost',
    )
  },
})

Deno.test({
  name:
    'Queue.nack - should reject with QueueNackFailed for unknown message ID',
  async fn() {
    const connector = createInMemory()
    const queue = await Queue.connect(connector).run()

    await queue.send('test-queue', { data: 'hello' }).run()

    // Receive to create the queue, then nack a nonexistent ID
    await queue.stream('test-queue').partition()

    const result = await queue.nack('test-queue', 'nonexistent-id').result()
    assertEquals(result.type, 'error')

    await queue.close().run()
  },
})

Deno.test({
  name: 'Queue - onDrop should receive the message on buffer overflow',
  async fn() {
    const dropped: QueueMessage<unknown>[] = []
    const connector = createInMemory({
      maxBufferSize: 1,
      onDrop: (message) => {
        dropped.push(message)
      },
    })
    const queue = await Queue.connect(connector).run()

    await queue.send('test-queue', { id: 1 }).run()

    await assertRejects(
      () => queue.send('test-queue', { id: 2 }).run(),
      QueueBufferFull,
    )

    assertEquals(dropped.length, 1)
    assertEquals(dropped[0].data, { id: 2 })
    assertExists(dropped[0].id)
    assertExists(dropped[0].timestamp)

    await queue.close().run()
  },
})
