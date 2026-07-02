import { Channel } from '../channel/channel.ts'
import { assertEquals, assertStringIncludes } from '@std/assert'

Deno.test('Channel.send - should enqueue success values', async () => {
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
  ch.close()

  const results = await ch.toArray()
  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
    { type: 'success', value: 3 },
  ])
})

Deno.test('Channel.fail - should enqueue error values', async () => {
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.fail('error 1')
  ch.trySend(2)
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
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
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
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
  ch.trySend(4)
  ch.close()

  const filtered = ch.filter((n: number) => n % 2 === 0)
  const results = await filtered.toArray()

  assertEquals(results, [
    { type: 'success', value: 2 },
    { type: 'success', value: 4 },
  ])
})

Deno.test('Channel - should support flatMap operation', async () => {
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
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
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
  ch.close()

  const collected = await ch.collect()
  assertEquals(collected, [1, 2, 3])
})

Deno.test('Channel.partition - should split successes and errors', async () => {
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.fail('bad')
  ch.trySend(2)
  ch.fail('worse')
  ch.trySend(3)
  ch.close()

  const { successes, errors } = await ch.partition()
  assertEquals(successes, [1, 2, 3])
  assertEquals(errors, ['bad', 'worse'])
})

Deno.test('Channel.close - should discard values sent after close', async () => {
  const ch = Channel.create<number, string>()
  ch.close()
  ch.trySend(1)
  ch.trySend(2)

  const results = await ch.toArray()
  assertEquals(results, [])
})

Deno.test('Channel.take - should limit successes', async () => {
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
  ch.trySend(4)
  ch.trySend(5)
  ch.close()

  const taken = ch.take(3)
  const results = await taken.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
    { type: 'success', value: 3 },
  ])
})

Deno.test('Channel - should honor bufferSize and onDrop', async () => {
  const dropped: number[] = []
  const ch = Channel.create<number, string>()
    .withBufferSize(3)
    .withOnDrop((n: number) => {
      dropped.push(n)
    })

  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
  ch.trySend(4)
  ch.trySend(5)
  ch.trySend(6)
  ch.close()

  const results = await ch.toArray()
  assertEquals(results.length, 3)
  assertEquals(dropped.length, 3)
  assertEquals(results.filter((r) => r.type === 'success').length, 3)
})

Deno.test('Channel.scan - should emit running accumulator', async () => {
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
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
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)
  ch.trySend(4)
  ch.trySend(5)
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
  const ch = Channel.create<number, Error>()
  ch.trySend(1)
  ch.fail(new Error('oops'))
  ch.trySend(2)
  ch.close()

  const { successes, errors } = await ch.partition()
  assertEquals(successes, [1, 2])
  assertEquals(errors.length, 1)
  assertEquals(errors[0].message, 'oops')
})

Deno.test('Channel.onClose - should call onClose when stream is exhausted', async () => {
  let closed = false
  const ch = Channel.create<number, string>()
    .withOnClose(() => {
      closed = true
    })

  ch.trySend(1)
  ch.trySend(2)
  ch.close()

  await ch.toArray()
  assertEquals(closed, true)
})

Deno.test('Channel.onClose - should call onClose when stream is cancelled early', async () => {
  let closeCount = 0
  const ch = Channel.create<number, string>()
    .withOnClose(() => {
      closeCount++
    })

  ch.trySend(1)
  ch.trySend(2)
  ch.trySend(3)

  const taken = ch.take(1)
  await taken.toArray()

  assertEquals(closeCount, 1)
})

Deno.test('Channel.onClose - should call onClose once per consumer', async () => {
  let closeCount = 0
  const ch = Channel.create<number, string>()
    .withOnClose(() => {
      closeCount++
    })

  ch.trySend(1)
  ch.close()

  await ch.toArray()
  await ch.toArray()
  assertEquals(closeCount, 2)
})

Deno.test('Channel.waitForCapacity - should block until capacity frees up', async () => {
  const ch = Channel.create<number, string>().withBufferSize(2)

  ch.trySend(1)
  ch.trySend(2)

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
  const ch = Channel.create<number, string>()

  for (let i = 0; i < 100; i++) {
    ch.trySend(i)
  }

  const t0 = performance.now()
  await ch.waitForCapacity()
  const t1 = performance.now()

  assertEquals(t1 - t0 < 50, true, 'Should resolve instantly without blocking')

  ch.close()
})

Deno.test('Channel.waitForCapacity - should unblock waiting producers when channel closes', async () => {
  const ch = Channel.create<number, string>().withBufferSize(1)

  ch.trySend(1)

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
  const ch = Channel.create<number, string>().withBufferSize(1)

  const producerDone = (async () => {
    for (let i = 0; i < 10; i++) {
      await ch.send(i)
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

Deno.test('Channel - should respect AbortSignal via withSignal', async () => {
  const controller = new AbortController()

  const ch = Channel.create<number, string>()
    .withSignal(controller.signal)

  ch.trySend(1)
  ch.trySend(2)

  controller.abort()

  ch.trySend(3)
  ch.close()

  const results = await ch.toArray()
  assertEquals(results.length < 3, true)
})

Deno.test('Channel.waitForCapacity - should close when signal is aborted', async () => {
  const controller = new AbortController()

  const ch = Channel.create<number, string>()
    .withBufferSize(1)
    .withSignal(controller.signal)

  for (let i = 0; i < 10; i++) {
    ch.trySend(i)
  }
  const promise = ch.waitForCapacity()
  controller.abort()

  await promise
  assertEquals(ch.isClosed(), true)
})

Deno.test('Channel - should remove abort listener on normal close', () => {
  const controller = new AbortController()
  const ch = Channel.create<number, string>()
    .withSignal(controller.signal)

  ch.close()
  assertEquals(ch.isClosed(), true)

  // Aborting now should be a no-op since it's already closed.
  controller.abort()
})

Deno.test('Channel - should unblock producers in FIFO order', async () => {
  const channel = Channel.create<number>().withBufferSize(1)
  const order: string[] = []

  await channel.waitForCapacity()
  channel.trySend(0) // Fill the buffer

  const p1 = channel.waitForCapacity().then(() => {
    order.push('p1')
    channel.trySend(1)
  })
  const p2 = channel.waitForCapacity().then(() => {
    order.push('p2')
    channel.trySend(2)
  })

  // Give them a moment to settle into the queue
  await new Promise((r) => setTimeout(r, 0))

  const iter = channel[Symbol.asyncIterator]()
  await iter.next() // Consume 0, unblocks p1

  await p1
  assertEquals(order, ['p1'], 'p1 should have been unblocked first (FIFO)')

  await iter.next() // Consume 1, unblocks p2
  await p2
  assertEquals(order, ['p1', 'p2'], 'p2 should have been unblocked second')

  channel.close()
})

Deno.test('Channel.withBufferSize - should throw if called after fail', () => {
  const ch = Channel.create<number, string>()
  ch.fail('err')
  try {
    ch.withBufferSize(10)
    throw new Error('should have thrown')
  } catch (e) {
    assertStringIncludes(
      (e as Error).message,
      'cannot be changed after first use',
    )
  }
})

Deno.test('Channel.withOnDrop - should throw if called after waitForCapacity', async () => {
  const ch = Channel.create<number, string>()
  await ch.waitForCapacity()
  try {
    ch.withOnDrop(() => {})
    throw new Error('should have thrown')
  } catch (e) {
    assertStringIncludes(
      (e as Error).message,
      'cannot be changed after first use',
    )
  }
})

Deno.test('Channel.withOnClose - should throw if called after close', () => {
  const ch = Channel.create<number, string>()
  ch.close()
  try {
    ch.withOnClose(() => {})
    throw new Error('should have thrown')
  } catch (e) {
    assertStringIncludes(
      (e as Error).message,
      'cannot be changed after first use',
    )
  }
})

Deno.test('Channel.withBufferSize - should succeed if called before any use', () => {
  const ch = Channel.create<number, string>()
  const configured = ch.withBufferSize(10)
  assertEquals(configured.isClosed(), false)
})

Deno.test('Channel.trySend - should return true when enqueued', async () => {
  const ch = Channel.create<number, string>()
  assertEquals(ch.trySend(1), true)
  assertEquals(ch.trySend(2), true)
  ch.close()
  const results = await ch.toArray()
  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Channel.trySend - should return false when buffer full', () => {
  const dropped: number[] = []
  const ch = Channel.create<number, string>()
    .withBufferSize(3)
    .withOnDrop((n: number) => {
      dropped.push(n)
    })

  assertEquals(ch.trySend(1), true)
  assertEquals(ch.trySend(2), true)
  assertEquals(ch.trySend(3), true)
  assertEquals(ch.trySend(4), false)
  assertEquals(ch.trySend(5), false)
  assertEquals(dropped, [4, 5])
  ch.close()
})

Deno.test('Channel.trySend - should return false when channel closed', () => {
  const ch = Channel.create<number, string>()
  ch.close()
  assertEquals(ch.trySend(1), false)
})

Deno.test('Channel.send - should block when buffer full and resolve when capacity frees', async () => {
  const ch = Channel.create<number, string>().withBufferSize(2)
  await ch.send(1)
  await ch.send(2)

  // Buffer is full. send(3) should block.
  let send3Resolved = false
  const sendPromise3 = ch.send(3).then(() => {
    send3Resolved = true
  })

  await new Promise((resolve) => setTimeout(resolve, 10))
  assertEquals(send3Resolved, false, 'should be blocked')

  const iter = ch[Symbol.asyncIterator]()
  await iter.next() // consume 1, frees capacity

  await sendPromise3
  assertEquals(send3Resolved, true, 'should resolve after capacity frees')

  ch.close()
  await iter.return?.(undefined)
})

Deno.test('Channel.send - should resolve silently when closed', async () => {
  const ch = Channel.create<number, string>()
  ch.close()
  await ch.send(1) // should not hang
})

Deno.test('Channel.withBufferSize - should not throw after Symbol.asyncIterator alone (lazy generator)', () => {
  // [Symbol.asyncIterator]() returns an iterator but doesn't start the
  // generator body — that runs on the first .next() call. So with*()
  // should still work after acquiring an iterator, before consuming.
  const ch = Channel.create<number, string>()
  const iter = ch[Symbol.asyncIterator]()
  try {
    const configured = ch.withBufferSize(10)
    assertEquals(configured.isClosed(), false)
  } finally {
    iter.return?.(undefined)
  }
})

Deno.test('Channel.withBufferSize - should throw after first .next() call', async () => {
  const ch = Channel.create<number, string>()
  ch.trySend(1)
  const iter = ch[Symbol.asyncIterator]()
  await iter.next() // generator body runs, sets started
  try {
    ch.withBufferSize(10)
    throw new Error('should have thrown')
  } catch (e) {
    assertStringIncludes(
      (e as Error).message,
      'cannot be changed after first use',
    )
  } finally {
    await iter.return?.(undefined)
  }
})
