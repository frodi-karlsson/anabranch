import { assertEquals, assertRejects } from '@std/assert'
import { Task } from '../index.ts'
import { deferred } from '../test_utils.ts'
import { ErrorResult } from '../util/util.ts'

Deno.test('Task.result - should return success', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(42))

  const result = await task.result()

  assertEquals(result, { type: 'success', value: 42 })
})

Deno.test('Task.result - should return error', async () => {
  const task = Task.of<number, string>(() => Promise.reject('boom'))

  const result = await task.result()

  assertEquals(result, { type: 'error', error: 'boom' })
})

Deno.test('Task.retry - should retry until success', async () => {
  let attempts = 0
  const task = Task.of<number, string>(() => {
    attempts += 1
    if (attempts < 3) {
      return Promise.reject('retry')
    }
    return Promise.resolve(7)
  }).retry({ attempts: 3 })

  const value = await task.run()

  assertEquals(value, 7)
  assertEquals(attempts, 3)
})

Deno.test('Task.retry - should stop when predicate fails', async () => {
  let attempts = 0
  const task = Task.of<number, string>(() => {
    attempts += 1
    return Promise.reject('fatal')
  }).retry({ attempts: 3, when: (error) => error === 'retry' })

  await assertRejects(() => task.run(), 'fatal')
  assertEquals(attempts, 1)
})

Deno.test('Task.timeout - should reject when time elapses', async () => {
  const gate = deferred<void>()
  const task = Task.of(async () => {
    await gate.promise
    return 1
  }).timeout(10, 'timeout')

  await assertRejects(() => task.run(), 'timeout')
  gate.resolve()
})

Deno.test('Task.all - should run all tasks', async () => {
  const task = Task.all([
    Task.of<number, string>(() => Promise.resolve(1)),
    Task.of<number, string>(() => Promise.resolve(2)),
    Task.of<number, string>(() => Promise.resolve(3)),
  ])

  const values = await task.run()

  assertEquals(values, [1, 2, 3])
})

Deno.test('Task.flatMap - should chain tasks', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(2)).flatMap(
    (value) => Task.of(() => Promise.resolve(value * 3)),
  )

  const value = await task.run()

  assertEquals(value, 6)
})

Deno.test('Task.allSettled - should collect successes and errors', async () => {
  const task = Task.allSettled([
    Task.of<number, string>(() => Promise.resolve(1)),
    Task.of<number, string>(() => Promise.reject('boom')),
  ])

  const results = await task.run()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'boom' },
  ])
})

Deno.test('Task.retry - should use delay function', async () => {
  const delays: number[] = []
  let attempts = 0
  const task = Task.of<number, string>(() => {
    attempts += 1
    return Promise.reject('boom')
  }).retry({
    attempts: 3,
    delay: (attempt) => {
      delays.push(attempt)
      return 0
    },
  })

  await assertRejects(() => task.run(), 'boom')

  assertEquals(attempts, 3)
  assertEquals(delays, [0, 1])
})

Deno.test('Task.retry - should receive error in delay function', async () => {
  const delays: Array<{ attempt: number; error: string }> = []
  let attempts = 0
  const task = Task.of<number, string>(() => {
    attempts += 1
    return Promise.reject(`error-${attempts}`)
  }).retry({
    attempts: 3,
    delay: (attempt, error) => {
      delays.push({ attempt, error })
      return 0
    },
  })

  await assertRejects(() => task.run(), 'error-3')

  assertEquals(attempts, 3)
  assertEquals(delays, [
    { attempt: 0, error: 'error-1' },
    { attempt: 1, error: 'error-2' },
  ])
})

Deno.test('Task.retry - should not delay after the last attempt', async () => {
  let delayCount = 0
  const task = Task.of<number, string>(() => {
    return Promise.reject('boom')
  }).retry({
    attempts: 1,
    delay: () => {
      delayCount++
      return 100_000
    },
    when: () => true,
  })

  await assertRejects(() => task.run(), 'boom')
  assertEquals(delayCount, 0)
})

Deno.test('Task.race - should resolve first success', async () => {
  const slow = Task.of<number, string>(async () => {
    await Promise.resolve()
    return 2
  })
  const fast = Task.of<number, string>(() => Promise.resolve(1))

  const result = await Task.race([slow, fast]).run()

  assertEquals(result, { type: 'success', value: 1 })
})

Deno.test('Task.race - should resolve success after error', async () => {
  const slow = Task.of<number, string>(async () => {
    await Promise.resolve()
    return 2
  })
  const fast = Task.of<number, string>(() => Promise.reject('boom'))

  const result = await Task.race([slow, fast]).run()

  assertEquals(result, { type: 'success', value: 2 })
})

Deno.test('Task.race - should resolve errors when all fail', async () => {
  const slow = Task.of<number, string>(async () => {
    await Promise.resolve()
    // deno-lint-ignore no-throw-literal
    throw 'slow'
  })
  const fast = Task.of<number, string>(() => Promise.reject('boom'))

  const result = await Task.race([slow, fast]).run()

  assertEquals(result, { type: 'error', error: ['boom', 'slow'] })
})

Deno.test('Task.withSignal - should abort underlying task', async () => {
  const controller = new AbortController()
  const gate = deferred<void>()
  const task = Task.of<number, Error>((signal?: AbortSignal) => {
    if (!signal) {
      return Promise.reject(new Error('missing signal'))
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason ?? new Error('aborted'))
      signal.addEventListener('abort', onAbort, { once: true })
      gate.promise.then(() => {
        signal.removeEventListener('abort', onAbort)
        resolve(1)
      })
    })
  }).withSignal(controller.signal)

  const runPromise = task.run()
  controller.abort(new Error('aborted'))

  await assertRejects(() => runPromise, Error, 'aborted')
  gate.resolve()
})

Deno.test('Task.acquireRelease - should acquire, use, and release resource', async () => {
  let released = false
  const task = Task.acquireRelease({
    acquire: () => Promise.resolve('resource'),
    release: (r) => {
      released = true
      assertEquals(r, 'resource')
      return Promise.resolve()
    },
    use: (r) =>
      Task.of(() =>
        Promise.resolve().then(() => {
          assertEquals(r, 'resource')
          return 'result'
        })
      ),
  })

  const result = await task.result()
  assertEquals(result.type, 'success')
  assertEquals((result as { value: string }).value, 'result')
  assertEquals(released, true)
})

Deno.test('Task.acquireRelease - should release on error', async () => {
  let released = false
  const task = Task.acquireRelease<unknown, number, Error>({
    acquire: () => Promise.resolve('resource'),
    release: () => {
      released = true
      return Promise.resolve()
    },
    use: () =>
      Task.of<number, Error>(() => Promise.reject(new Error('failed'))),
  })

  const result = await task.result()
  assertEquals(result.type, 'error')
  assertEquals(released, true)
})

Deno.test('Task.acquireRelease - should pass signal to acquire', async () => {
  let receivedSignal: AbortSignal | undefined
  const controller = new AbortController()
  const task = Task.acquireRelease({
    acquire: (signal) => {
      receivedSignal = signal
      return Promise.resolve('resource')
    },
    release: () => Promise.resolve(),
    use: () => Task.of(() => Promise.resolve('result')),
  })

  const result = await task.withSignal(controller.signal).run()
  assertEquals(receivedSignal, controller.signal)
  assertEquals(result, 'result')
})

Deno.test('Task.acquireRelease - should release even when signal aborted during use', async () => {
  let released = false
  const gate = Promise.withResolvers<void>()
  const task = Task.acquireRelease({
    acquire: () => Promise.resolve('resource'),
    release: () => {
      released = true
      return Promise.resolve()
    },
    use: () =>
      Task.of(() =>
        Promise.race([
          gate.promise.then(() => 'done'),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 10_000)
          ),
        ])
      ),
  })

  const controller = new AbortController()
  const runPromise = task.withSignal(controller.signal).run()

  controller.abort(new Error('aborted during use'))

  await assertRejects(() => runPromise, Error, 'aborted during use')
  assertEquals(released, true)
})

Deno.test('Task.retry - should throw final error when all attempts exhausted', async () => {
  let attempts = 0
  const task = Task.of<number, string>(() => {
    attempts += 1
    return Promise.reject(`error ${attempts}`)
  }).retry({ attempts: 3 })

  await assertRejects(() => task.run(), 'error 3')
  assertEquals(attempts, 3)
})

Deno.test('Task.all - should reject on first failure', async () => {
  const task = Task.all([
    Task.of(() => Promise.resolve(1)),
    Task.of(() => Promise.reject('fail')),
    Task.of(() => Promise.resolve(3)),
  ])

  await assertRejects(() => task.run(), 'fail')
})

Deno.test('Task.race - should throw for empty input', async () => {
  const task = Task.race<string, never>([])
  await assertRejects(
    () => task.run(),
    Error,
    'Task.race requires at least one task',
  )
})

Deno.test('Task.flatMap - should not run second task when first fails', async () => {
  let secondRan = false
  const task = Task.of(() => Promise.reject('first fail'))
    .flatMap(() =>
      Task.of(() => {
        secondRan = true
        return Promise.resolve('second')
      })
    )

  const result = await task.result()
  assertEquals(result.type, 'error')
  assertEquals((result as { error: string }).error, 'first fail')
  assertEquals(secondRan, false)
})

Deno.test('Task.timeout - should resolve when task completes within timeout', async () => {
  const task = Task.of<string, Error>(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return 'success'
  }).timeout(5_000, new Error('timed out'))

  const value = await task.run()
  assertEquals(value, 'success')
})

Deno.test('Task.throwOn - should throw matching errors', async () => {
  const task = Task.of<number, 'boom' | 'other'>(() => Promise.reject('boom'))

  await assertRejects(
    () => task.throwOn((e): e is 'boom' => e === 'boom').run(),
    'boom',
  )
})

Deno.test('Task.throwOn - should pass through non-matching errors', async () => {
  const task = Task.of<number, 'boom' | 'other'>(() => Promise.reject('other'))

  const result = await task.throwOn((e): e is 'boom' => e === 'boom').result()

  assertEquals(result, { type: 'error', error: 'other' })
})

Deno.test('Task.tryFlatMap - should chain tasks and handle mapper errors', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(2)).tryFlatMap(
    (value) => Task.of<number, never>(() => Promise.resolve(value * 3)),
    (error) => `handled: ${error}` as never,
  )

  const result = await task.run()

  assertEquals(result, 6)
})

Deno.test('Task.tryFlatMap - should use error handler when mapper fails', async () => {
  const task = Task.of<number, never>(() => Promise.resolve(2)).tryFlatMap(
    (_value) => Task.of<string, never>(() => Promise.reject('mapper error')),
    (_error) => 'recovered' as const,
  )

  const result = await task.run()

  assertEquals(result, 'recovered')
})

Deno.test('Task.tryFlatMap - should propagate errors from original task', async () => {
  const task = Task.of<number, string>(() => Promise.reject('original error'))
    .tryFlatMap(
      (value) => Task.of(() => Promise.resolve(value * 2)),
      (_error) => {
        throw new Error('should not be called')
      },
    )

  const result = await task.result()

  assertEquals(result, { type: 'error', error: 'original error' })
})

Deno.test('Task.tryMap - should transform success value', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(5)).tryMap(
    (value) => value * 2,
    (error) => `handled: ${error}`,
  )

  const result = await task.run()

  assertEquals(result, 10)
})

Deno.test('Task.tryMap - should use error handler when mapper throws', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(5)).tryMap(
    (value) => {
      if (value > 3) throw new Error('too big')
      return value * 2
    },
    (error, value) =>
      new Error(`failed at ${value}: ${(error as Error).message}`),
  )

  const result = await task.result()

  assertEquals(result.type, 'error')
  assertEquals(
    (result as { error: Error }).error.message,
    'failed at 5: too big',
  )
})

Deno.test('Task.tryMap - should propagate original errors', async () => {
  const task = Task.of<number, string>(() => Promise.reject('original')).tryMap(
    (value) => value * 2,
    (error) => `mapped: ${error}`,
  )

  const result = await task.result()

  assertEquals(result, { type: 'error', error: 'original' })
})

Deno.test('Task.tryMap - should allow async mapper', async () => {
  const task = Task.of<string, string>(() => Promise.resolve('hello')).tryMap(
    (value) => value.toUpperCase(),
    (error) => `handled: ${error}`,
  )

  const result = await task.run()

  assertEquals(result, 'HELLO')
})

Deno.test('Task.tryMap - should allow async error handler', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(5)).tryMap(
    (value) => {
      if (value > 3) throw new Error('too big')
      return value * 2
    },
    async (error) => {
      await Promise.resolve()
      return new Error(`failed: ${(error as Error).message}`)
    },
  )

  const result = await task.result()

  assertEquals(result.type, 'error')
  assertEquals((result as { error: Error }).error.message, 'failed: too big')
})

Deno.test('Task.tryMap - should change error type', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(5)).tryMap(
    (value) => {
      if (value > 3) throw new Error('custom')
      return value
    },
    () => 'recovered' as const,
  )

  const result = await task.result()

  assertEquals(result, { type: 'error', error: 'recovered' })
})

Deno.test('Task.flatMapErr - should chain task on error', async () => {
  const task = Task.of<number, string>(() => Promise.reject('error'))
    .flatMapErr(
      (_error) => Task.of<number, string>(() => Promise.reject('mapped')),
    )

  const result = await task.result()

  assertEquals(result, { type: 'error', error: 'mapped' })
})

Deno.test('Task.flatMapErr - should pass through success values', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(42)).flatMapErr(
    (_error) => Task.of<number, string>(() => Promise.reject('should not run')),
  )

  const result = await task.run()

  assertEquals(result, 42)
})

Deno.test('Task.chain - should run single task', async () => {
  const task = Task.chain([
    () => Task.of<number, string>(() => Promise.resolve(42)),
  ])

  const result = await task.run()

  assertEquals(result, 42)
})

Deno.test('Task.chain - should chain two tasks', async () => {
  const task = Task.chain([
    () => Task.of<number, string>(() => Promise.resolve(2)),
    (prev) => Task.of(() => Promise.resolve(prev * 3)),
  ])

  const result = await task.run()

  assertEquals(result, 6)
})

Deno.test('Task.chain - should chain three tasks', async () => {
  const task = Task.chain([
    () => Task.of<number, string>(() => Promise.resolve(1)),
    (prev) => Task.of(() => Promise.resolve(prev + 1)),
    (prev) => Task.of(() => Promise.resolve(prev * 2)),
  ])

  const result = await task.run()

  assertEquals(result, 4)
})

Deno.test('Task.chain - should chain four tasks', async () => {
  const task = Task.chain([
    () => Task.of<number, string>(() => Promise.resolve(1)),
    (a) => Task.of(() => Promise.resolve(a + 1)),
    (b) => Task.of(() => Promise.resolve(b + 2)),
    (c) => Task.of(() => Promise.resolve(c + 3)),
  ])

  const result = await task.run()

  assertEquals(result, 7)
})

Deno.test('Task.chain - should chain five tasks', async () => {
  const task = Task.chain([
    () => Task.of(() => 1),
    (a) => Task.of(() => a * 2),
    (b) => Task.of(() => b + 1),
    (c) => Task.of(() => c * 3),
    (d) => Task.of(() => d - 1),
  ])

  const result = await task.run()

  assertEquals(result, 8)
})

Deno.test('Task.chain - should chain six tasks', async () => {
  const task = Task.chain([
    () => Task.of(() => Promise.resolve(1)),
    (a) => Task.of(() => Promise.resolve(a + 1)),
    (b) => Task.of(() => Promise.resolve(b * 2)),
    (c) => Task.of(() => Promise.resolve(c - 1)),
    (d) => Task.of(() => Promise.resolve(d + 3)),
    (e) => Task.of(() => Promise.resolve(e * 2)),
  ])

  const result = await task.run()

  assertEquals(result, 12)
})

Deno.test('Task.chain - should chain seven tasks', async () => {
  const task = Task.chain([
    () => Task.of(() => Promise.resolve(1)),
    (a) => Task.of(() => Promise.resolve(a + 1)),
    (b) => Task.of(() => Promise.resolve(b * 2)),
    (c) => Task.of(() => Promise.resolve(c - 1)),
    (d) => Task.of(() => Promise.resolve(d + 3)),
    (e) => Task.of(() => Promise.resolve(e * 2)),
    (f) => Task.of(() => Promise.resolve(f - 5)),
  ])

  const result = await task.run()

  assertEquals(result, 7)
})

Deno.test('Task.chain - should pass strings through chain', async () => {
  const task = Task.chain([
    () => Task.of(() => Promise.resolve('hello')),
    (prev) => Task.of(() => Promise.resolve(`${prev} world`)),
    (prev) => Task.of(() => Promise.resolve(prev + '!')),
  ])

  const result = await task.run()

  assertEquals(result, 'hello world!')
})

Deno.test('Task.chain - should short-circuit on first error', async () => {
  let secondRan = false
  let thirdRan = false

  const task = Task.chain([
    () =>
      Task.of<never, Error>(() => {
        throw new Error('first error')
      }),
    () => {
      secondRan = true
      return Task.of(() => 2)
    },
    () => {
      thirdRan = true
      return Task.of<never, Error>(() => {
        throw new Error('third error')
      })
    },
  ])

  const result = await task.result()

  assertEquals((result.error as Error).message, 'first error')
  assertEquals(secondRan, false)
  assertEquals(thirdRan, false)
})

Deno.test('ask.chain - should short-circuit on second error', async () => {
  let thirdRan = false

  const task = Task.chain([
    () => Task.of(() => 1),
    () =>
      Task.of(() => {
        throw new Error('second error')
      }),
    () => {
      thirdRan = true
      return Task.of(() => 3)
    },
  ])

  const result = await task.result()

  assertEquals(result.type, 'error')
  assertEquals(
    (result as ErrorResult<never, Error>).error.message,
    'second error',
  )
  assertEquals(thirdRan, false)
})

Deno.test('Task.chain - should propagate error type correctly', async () => {
  const task = Task.chain([
    () => Task.of(() => Promise.reject('specific' as const)),
    (_prev) => Task.of(() => Promise.resolve(2)),
  ])

  const result = await task.result()

  assertEquals(result.type, 'error')
  assertEquals((result as { error: 'specific' }).error, 'specific')
})

Deno.test('Task.chain - should support async tasks', async () => {
  const task = Task.chain([
    () =>
      Task.of(async () => {
        await Promise.resolve()
        return 1
      }),
    (prev) =>
      Task.of(async () => {
        await Promise.resolve()
        return prev + 1
      }),
  ])

  const result = await task.run()

  assertEquals(result, 2)
})

Deno.test('Task.chain - should handle empty array', async () => {
  const task = Task.chain([])

  const result = await task.run()

  assertEquals(result, undefined)
})

Deno.test('Task.chain - should support different types in chain', async () => {
  const task = Task.chain([
    () => Task.of(() => 5),
    (n) => Task.of(() => String(n)),
    (s) => Task.of(() => s.length),
  ])

  const result = await task.run()

  assertEquals(result, 1)
})

Deno.test('Task.chain - should support mixed sync and async tasks', async () => {
  const task = Task.chain([
    () => Task.of(() => 1),
    (a) => Task.of(() => a + 1),
    (b) => Task.of(() => b * 2),
  ])

  const result = await task.run()

  assertEquals(result, 4)
})
