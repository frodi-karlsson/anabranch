import { Channel } from '../channel/channel.ts'
import { assertEquals } from '@std/assert'

Deno.test('Channel.send - should enqueue success values', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.close()

  const results = await ch.toArray()
  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
    { type: 'success', value: 3 },
  ])
})

Deno.test('Channel.fail - should enqueue error values', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.fail('error 1')
  ch.send(2)
  ch.fail('error 2')
  ch.close()

  const results = await ch.toArray()
  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'error 1' },
    { type: 'success', value: 2 },
    { type: 'error', error: 'error 2' },
  ])
})

Deno.test('Channel - should support map operation', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.close()

  const doubled = ch.map((n: number) => n * 2)
  const results = await doubled.toArray()

  assertEquals(results, [
    { type: 'success', value: 2 },
    { type: 'success', value: 4 },
    { type: 'success', value: 6 },
  ])
})

Deno.test('Channel - should support filter operation', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.send(4)
  ch.close()

  const filtered = ch.filter((n: number) => n % 2 === 0)
  const results = await filtered.toArray()

  assertEquals(results, [
    { type: 'success', value: 2 },
    { type: 'success', value: 4 },
  ])
})

Deno.test('Channel - should support flatMap operation', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.close()

  const expanded = ch.flatMap((n: number) => [n, n * 10])
  const results = await expanded.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 10 },
    { type: 'success', value: 2 },
    { type: 'success', value: 20 },
  ])
})

Deno.test('Channel.collect - should return successes as array', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.close()

  const collected = await ch.collect()
  assertEquals(collected, [1, 2, 3])
})

Deno.test('Channel.partition - should split successes and errors', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.fail('bad')
  ch.send(2)
  ch.fail('worse')
  ch.send(3)
  ch.close()

  const { successes, errors } = await ch.partition()
  assertEquals(successes, [1, 2, 3])
  assertEquals(errors, ['bad', 'worse'])
})

Deno.test('Channel.close - should discard values sent after close', async () => {
  const ch = new Channel<number, string>()
  ch.close()
  ch.send(1)
  ch.send(2)

  const results = await ch.toArray()
  assertEquals(results, [])
})

Deno.test('Channel.take - should limit successes', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.send(4)
  ch.send(5)
  ch.close()

  const taken = ch.take(3)
  const results = await taken.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
    { type: 'success', value: 3 },
  ])
})

Deno.test('Channel - should honor bufferSize and onDrop options', async () => {
  const dropped: number[] = []
  const ch = new Channel<number, string>({
    bufferSize: 3,
    onDrop: (n: number) => {
      dropped.push(n)
    },
  })

  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.send(4)
  ch.send(5)
  ch.send(6)
  ch.close()

  const results = await ch.toArray()
  assertEquals(results.length, 3)
  assertEquals(dropped.length, 3)
  assertEquals(results.filter((r) => r.type === 'success').length, 3)
})

Deno.test('Channel.scan - should emit running accumulator', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.close()

  const scanned = ch.scan((sum: number, n: number) => sum + n, 0)
  const results = await scanned.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 3 },
    { type: 'success', value: 6 },
  ])
})

Deno.test('Channel.chunks - should group successes into arrays', async () => {
  const ch = new Channel<number, string>()
  ch.send(1)
  ch.send(2)
  ch.send(3)
  ch.send(4)
  ch.send(5)
  ch.close()

  const chunked = ch.chunks(2)
  const results = await chunked.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 2] },
    { type: 'success', value: [3, 4] },
    { type: 'success', value: [5] },
  ])
})

Deno.test('Channel.fail - should preserve error type', async () => {
  const ch = new Channel<number, Error>()
  ch.send(1)
  ch.fail(new Error('oops'))
  ch.send(2)
  ch.close()

  const { successes, errors } = await ch.partition()
  assertEquals(successes, [1, 2])
  assertEquals(errors.length, 1)
  assertEquals(errors[0].message, 'oops')
})

Deno.test('Channel.onClose - should call onClose when stream is exhausted', async () => {
  let closed = false
  const ch = new Channel<number, string>({
    onClose: () => {
      closed = true
    },
  })

  ch.send(1)
  ch.send(2)
  ch.close()

  await ch.toArray()
  assertEquals(closed, true)
})

Deno.test('Channel.onClose - should call onClose when stream is cancelled early', async () => {
  let closeCount = 0
  const ch = new Channel<number, string>({
    onClose: () => {
      closeCount++
    },
  })

  ch.send(1)
  ch.send(2)
  ch.send(3)

  const taken = ch.take(1)
  await taken.toArray()

  assertEquals(closeCount, 1)
})

Deno.test('Channel.onClose - should call onClose once per consumer', async () => {
  let closeCount = 0
  const ch = new Channel<number, string>({
    onClose: () => {
      closeCount++
    },
  })

  ch.send(1)
  ch.close()

  await ch.toArray()
  await ch.toArray()
  assertEquals(closeCount, 2)
})

Deno.test('Channel.waitForCapacity - should block until capacity frees up', async () => {
  const ch = new Channel<number, string>({ bufferSize: 2 })

  ch.send(1)
  ch.send(2)

  let waitResolved = false
  const waitPromise = ch.waitForCapacity().then(() => {
    waitResolved = true
  })

  await new Promise((resolve) => setTimeout(resolve, 10))
  assertEquals(waitResolved, false, 'Should be blocked because buffer is full')

  const iterator = ch[Symbol.asyncIterator]()
  await iterator.next()

  await waitPromise
  assertEquals(waitResolved, true, 'Should resolve after an item is consumed')

  ch.close()
})

Deno.test('Channel.waitForCapacity - should resolve instantly if bufferSize is Infinity', async () => {
  const ch = new Channel<number, string>()

  for (let i = 0; i < 100; i++) {
    ch.send(i)
  }

  const t0 = performance.now()
  await ch.waitForCapacity()
  const t1 = performance.now()

  assertEquals(t1 - t0 < 50, true, 'Should resolve instantly without blocking')

  ch.close()
})

Deno.test('Channel.waitForCapacity - should unblock waiting producers when channel closes', async () => {
  const ch = new Channel<number, string>({ bufferSize: 1 })

  ch.send(1)

  let waitResolved = false
  const waitPromise = ch.waitForCapacity().then(() => {
    waitResolved = true
  })

  await new Promise((resolve) => setTimeout(resolve, 10))
  assertEquals(waitResolved, false, 'Should be blocked initially')

  ch.close()

  await waitPromise
  assertEquals(waitResolved, true, 'Should unblock when closed')
})

Deno.test('Channel - take should unblock blocked producers via close in finally', async () => {
  const ch = new Channel<number, string>({ bufferSize: 1 })

  const producerDone = (async () => {
    for (let i = 0; i < 10; i++) {
      await ch.waitForCapacity()
      ch.send(i)
    }
    ch.close()
  })()

  await ch.take(2).collect()

  let timeoutId: number
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('deadlock: producer never unblocked')),
      500,
    )
  })

  await Promise.race([producerDone, timeout]).finally(() =>
    clearTimeout(timeoutId!)
  )
})

Deno.test('Channel - should respect AbortSignal in constructor', async () => {
  const controller = new AbortController()
  const { signal } = controller

  const ch = new Channel<number, string>({ signal })

  // 1. Send some data
  ch.send(1)
  ch.send(2)

  // 2. Abort the controller
  controller.abort()

  // 3. Sending after abort should ideally be ignored or handled
  ch.send(3)
  ch.close()

  // 4. Consuming should stop/throw based on the abort
  // Most implementations will throw the abort reason or just return an empty/partial stream
  const results = await ch.toArray()
  // If your implementation finishes early on abort:
  assertEquals(results.length < 3, true)
})

Deno.test('Channel.waitForCapacity - should close when signal is aborted', async () => {
  const controller = new AbortController()
  const { signal } = controller

  const ch = new Channel<number, string>({ bufferSize: 1, signal })

  for (let i = 0; i < 10; i++) {
    ch.send(i)
  }
  const promise = ch.waitForCapacity()
  controller.abort()

  await promise
  assertEquals(ch.isClosed(), true)
})
