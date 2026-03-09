/**
 * Integration tests for queue-redis require a live Redis instance.
 * Set REDIS_URL environment variable to run them (e.g., redis://localhost:6379).
 * CI uses GitHub Actions service containers for this.
 */
import { assertEquals, assertExists } from '@std/assert'
import { createRedis } from './index.ts'

const REDIS_URL = Deno.env.get('REDIS_URL')

Deno.test('createRedis - should return a valid connector', () => {
  const connector = createRedis('redis://localhost:6379')
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createRedis - should accept connection string', () => {
  const connector = createRedis('redis://localhost:6379')
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createRedis - should accept individual options', () => {
  const connector = createRedis({
    connection: { host: 'localhost', port: 6379 },
  })
  assertEquals(typeof connector.connect, 'function')
})

Deno.test('createRedis - should use environment variables as defaults', () => {
  const connector = createRedis()
  assertEquals(typeof connector.connect, 'function')
})

Deno.test({
  name: 'RedisQueue - send and receive basic message',
  ignore: !REDIS_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedis(REDIS_URL)
    const queue = await connector.connect()

    const id = await queue.send(queueName, { value: 'hello' })
    assertExists(id)

    const messages = await queue.receive<{ value: string }>(queueName)
    assertEquals(messages.length, 1)
    assertEquals(messages[0].data?.value, 'hello')

    await queue.ack(queueName, messages[0].id)
    await connector.end()
  },
})

Deno.test({
  name: 'RedisQueue - send and receive multiple messages',
  ignore: !REDIS_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedis(REDIS_URL)
    const queue = await connector.connect()

    await queue.send(queueName, { id: 1 })
    await queue.send(queueName, { id: 2 })
    await queue.send(queueName, { id: 3 })

    const messages = await queue.receive<{ id: number }>(queueName, 10)
    assertEquals(messages.length, 3)

    await queue.ack(queueName, ...messages.map((m) => m.id))
    await connector.end()
  },
})

Deno.test({
  name: 'RedisQueue - nack with requeue',
  ignore: !REDIS_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedis(REDIS_URL)
    const queue = await connector.connect()

    await queue.send(queueName, { data: 'original' })

    const first = await queue.receive<{ data: string }>(queueName)
    assertEquals(first.length, 1)
    assertEquals(first[0].attempt, 1)

    await queue.nack(queueName, first[0].id, { requeue: true })

    const second = await queue.receive<{ data: string }>(queueName)
    assertEquals(second.length, 1)
    assertEquals(second[0].attempt, 2)

    await queue.ack(queueName, second[0].id)
    await connector.end()
  },
})

Deno.test({
  name: 'RedisQueue - headers propagation',
  ignore: !REDIS_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedis(REDIS_URL)
    const queue = await connector.connect()

    await queue.send(queueName, { data: 'test' }, {
      headers: {
        'x-correlation-id': 'abc-123',
        'x-source': 'test-service',
      },
    })

    const messages = await queue.receive<{ data: string }>(queueName)
    assertEquals(messages.length, 1)
    assertEquals(
      messages[0].metadata?.headers?.['x-correlation-id'],
      'abc-123',
    )
    assertEquals(
      messages[0].metadata?.headers?.['x-source'],
      'test-service',
    )

    await queue.ack(queueName, messages[0].id)
    await connector.end()
  },
})

Deno.test({
  name: 'RedisQueue - delayed messages',
  ignore: !REDIS_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`
    const connector = createRedis(REDIS_URL)
    const queue = await connector.connect()

    await queue.send(queueName, { data: 'delayed' }, { delayMs: 100 })

    const immediate = await queue.receive<{ data: string }>(queueName)
    assertEquals(immediate.length, 0)

    await new Promise((resolve) => setTimeout(resolve, 150))

    const afterDelay = await queue.receive<{ data: string }>(queueName)
    assertEquals(afterDelay.length, 1)
    assertEquals(afterDelay[0].data?.data, 'delayed')

    await queue.ack(queueName, afterDelay[0].id)
    await connector.end()
  },
})

Deno.test({
  name: 'RedisQueue - dead letter queue routing',
  ignore: !REDIS_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`
    const dlqName = `${queueName}-dlq`
    const connector = createRedis({
      connection: REDIS_URL!,
      queues: {
        [queueName]: {
          maxAttempts: 2,
          deadLetterQueue: dlqName,
        },
      },
    })
    const queue = await connector.connect()

    await queue.send(queueName, { data: 'failing' })

    const first = await queue.receive<{ data: string }>(queueName)
    assertEquals(first.length, 1)
    assertEquals(first[0].attempt, 1)

    await queue.nack(queueName, first[0].id, { requeue: true })

    const second = await queue.receive<{ data: string }>(queueName)
    assertEquals(second.length, 1)
    assertEquals(second[0].attempt, 2)

    await queue.nack(queueName, second[0].id, { requeue: true })

    const dlq = await queue.receive(dlqName)
    assertEquals(dlq.length, 1)
    assertEquals(
      (dlq[0].data as { originalId: string }).originalId,
      second[0].id,
    )

    await queue.ack(dlqName, dlq[0].id)
    await connector.end()
  },
})

Deno.test({
  name: 'RedisQueue - connector can be used multiple times',
  ignore: !REDIS_URL,
  async fn() {
    const connector = createRedis(REDIS_URL)
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`

    const queue1 = await connector.connect()
    const id1 = await queue1.send(queueName, { n: 1 })
    assertExists(id1)
    await queue1.close()

    const queue2 = await connector.connect()
    const messages = await queue2.receive<{ n: number }>(queueName)
    assertEquals(messages.length, 1)
    assertEquals(messages[0].data?.n, 1)
    await queue2.ack(queueName, messages[0].id)
    await queue2.close()

    await connector.end()
  },
})
