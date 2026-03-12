import { assertEquals, assertRejects, assertThrows } from '@std/assert'
import { PumpError, type Result, Source } from '../index.ts'
import { deferred, failure, streamFrom, success } from '../test_utils.ts'
import { Death, ErrorResult } from '../util/util.ts'
import { MissingKeyError, NoKeysError } from './stream.ts'

Deno.test('Stream.toArray - should collect all results', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure('boom'),
    success(2),
  ])

  const results = await stream.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'boom' },
    { type: 'success', value: 2 },
  ])
})

Deno.test(
  'Stream.collect - should return successes when no errors',
  async () => {
    const stream = streamFrom<number, string>([success(1), success(2)])

    const results = await stream.collect()

    assertEquals(results, [1, 2])
  },
)

Deno.test(
  'Stream.collect - should throw aggregate error when errors exist',
  async () => {
    const stream = streamFrom<number, string>([
      success(1),
      failure('nope'),
      success(2),
    ])

    await assertRejects(
      () => stream.collect(),
      Error,
      'AggregateError: 1 errors',
    )
  },
)

Deno.test(
  'Stream.successes - should yield only successful values',
  async () => {
    const stream = streamFrom<string, string>([
      success('a'),
      failure('bad'),
      success('b'),
    ])
    const collected: string[] = []

    for await (const value of stream.successes()) {
      collected.push(value)
    }

    assertEquals(collected, ['a', 'b'])
  },
)

Deno.test('Stream.errors - should yield only errors', async () => {
  const stream = streamFrom<string, string>([
    success('a'),
    failure('bad'),
    failure('worse'),
  ])
  const collected: string[] = []

  for await (const error of stream.errors()) {
    collected.push(error)
  }

  assertEquals(collected, ['bad', 'worse'])
})

Deno.test('Stream iterator - should yield all results', async () => {
  const stream = streamFrom<number, string>([success(1), failure('boom')])
  const collected: Result<number, string>[] = []

  for await (const result of stream) {
    collected.push(result)
  }

  assertEquals(collected, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'boom' },
  ])
})

Deno.test('Stream.map - should transform successful values', async () => {
  const stream = streamFrom<number, string>([
    success(2),
    failure('bad'),
    success(3),
  ])
  const mapped = stream.map((value) => value * 2)

  const results = await mapped.toArray()

  assertEquals(results, [
    { type: 'success', value: 4 },
    { type: 'error', error: 'bad' },
    { type: 'success', value: 6 },
  ])
})

Deno.test('Stream.map - should convert thrown errors into error results', async () => {
  const stream = streamFrom<number, Error>([success(2), success(3)])
  const mapped = stream.map((value) => {
    if (value === 3) {
      throw new Error('nope')
    }
    return value * 2
  })

  const results = await mapped.toArray()

  assertEquals(results.length, 2)
  assertEquals(results[0], { type: 'success', value: 4 })
  assertEquals(results[1].type, 'error')
  assertEquals(
    (results[1] as { type: 'error'; error: Error }).error.message,
    'nope',
  )
})

Deno.test('Stream.map - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    success(10),
    success(20),
    failure('bad'),
    success(30),
  ])

  const seen: Array<{ value?: number; index: number }> = []
  await stream.map((value, index) => {
    seen.push({ value, index })
  }).toArray()

  assertEquals(seen, [
    { value: 10, index: 0 },
    { value: 20, index: 1 },
    { value: 30, index: 2 },
  ])
})

Deno.test('Stream.flatMap - should expand successes', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure('bad'),
    success(2),
  ])
  const flattened = stream
    .flatMap((value) => [value, value * 10])

  const results = await flattened.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 10 },
    { type: 'error', error: 'bad' },
    { type: 'success', value: 2 },
    { type: 'success', value: 20 },
  ])
})

Deno.test(
  'Stream.flatMap - should convert thrown errors into error results',
  async () => {
    const stream = streamFrom<number, Error>([success(1), success(2)])
    const expectedError = new Error('nope')
    const flattened = stream
      .flatMap((value) => {
        if (value === 2) {
          throw expectedError
        }
        return [value]
      })

    const results = await flattened.toArray()

    assertEquals(results, [
      { type: 'success', value: 1 },
      { type: 'error', error: expectedError },
    ])
  },
)

Deno.test(
  'Stream.flatMap - should convert iterable errors into error results',
  async () => {
    const stream = streamFrom<number, Error>([success(1)])
    const expectedError = new Error('bad iterable')
    const flattened = stream
      .flatMap(() =>
        (async function* () {
          yield await Promise.reject(expectedError)
        })()
      )

    const results = await flattened.toArray()

    assertEquals(results, [{ type: 'error', error: expectedError }])
  },
)

Deno.test(
  'Stream.flatMap - should preserve concurrency settings',
  async () => {
    let inFlight = 0
    let maxObserved = 0
    const started = deferred<void>()
    const gates = [
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
    ]
    const stream = Source.from<number, string>(async function* () {
      yield 1
      yield 2
      yield 3
    }).withConcurrency(2)

    const mapped = stream
      .flatMap((value) => [value * 2 - 1, value * 2])
      .map(async (value) => {
        inFlight += 1
        maxObserved = Math.max(maxObserved, inFlight)
        if (inFlight === 2) {
          started.resolve()
        }
        await gates[value - 1].promise
        inFlight -= 1
        return value
      })

    const resultsPromise = mapped.toArray()
    await started.promise

    assertEquals(maxObserved, 2)

    for (const gate of gates) {
      gate.resolve()
    }

    await resultsPromise
  },
)

Deno.test('Stream.flatMap - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    success(10),
    success(20),
    failure('bad'),
    success(30),
  ])

  const seen: Array<{ value?: number; index: number }> = []
  await stream.flatMap((value, index) => {
    seen.push({ value, index })
    return [value]
  }).toArray()

  assertEquals(seen, [
    { value: 10, index: 0 },
    { value: 20, index: 1 },
    { value: 30, index: 2 },
  ])
})

Deno.test(
  'Stream.map - should honor concurrency limit',
  async () => {
    let inFlight = 0
    let maxObserved = 0
    const started = deferred<void>()
    const gates = [
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
    ]
    const stream = Source.from<number, string>(async function* () {
      yield 1
      yield 2
      yield 3
      yield 4
    }).withConcurrency(2)

    const mapped = stream.map(async (value) => {
      inFlight += 1
      maxObserved = Math.max(maxObserved, inFlight)
      if (inFlight === 2) {
        started.resolve()
      }
      await gates[value - 1].promise
      inFlight -= 1
      return value
    })

    const resultsPromise = mapped.toArray()
    await started.promise
    assertEquals(maxObserved, 2)

    for (const gate of gates) {
      gate.resolve()
    }

    await resultsPromise
  },
)

Deno.test(
  'Stream.map - should preserve order with concurrency 1',
  async () => {
    const stream = Source.from<number, string>(async function* () {
      yield 1
      yield 2
      yield 3
    }).withConcurrency(1)

    const mapped = stream.map(async (value) => {
      await Promise.resolve()
      return value * 10
    })

    const results = await mapped.toArray()

    assertEquals(results, [
      { type: 'success', value: 10 },
      { type: 'success', value: 20 },
      { type: 'success', value: 30 },
    ])
  },
)

Deno.test(
  'Stream.map - should apply buffer backpressure',
  async () => {
    let inFlight = 0
    let maxObserved = 0
    const started = deferred<void>()
    const gate = deferred<void>()
    const stream = Source.from<number, string>(async function* () {
      yield 1
      yield 2
      yield 3
    }).withConcurrency(3).withBufferSize(2)

    const mapped = stream.map(async (value) => {
      inFlight += 1
      maxObserved = Math.max(maxObserved, inFlight)
      if (inFlight === 2) {
        started.resolve()
      }
      await gate.promise
      inFlight -= 1
      return value
    })

    const resultsPromise = mapped.toArray()
    await started.promise
    assertEquals(maxObserved, 2)
    gate.resolve()

    const results = await resultsPromise
    assertEquals(results.length, 3)
  },
)

Deno.test(
  'Stream.map - should propagate errors from mapped tasks',
  async () => {
    const expectedError = new Error('map failed')
    const stream = Source.from<number, Error>(async function* () {
      yield 1
      yield 2
    }).withConcurrency(2)

    const mapped = stream.map((value) => {
      if (value === 2) {
        throw expectedError
      }
      return value
    })

    const results = await mapped.toArray()

    assertEquals(results, [
      { type: 'success', value: 1 },
      { type: 'error', error: expectedError },
    ])
  },
)

Deno.test(
  'Stream.map - should surface source generator errors',
  async () => {
    const expectedError = new Error('source failed')
    const stream = Source.from<number, Error>(async function* () {
      yield 1
      throw expectedError
    }).withConcurrency(1)

    const mapped = stream.map((value) => value)
    const results = await mapped.toArray()

    assertEquals(
      results.map((result) => result.type).sort(),
      ['error', 'success'],
    )
    assertEquals(
      results.find((result) => result.type === 'success'),
      { type: 'success', value: 1 },
    )
    assertEquals(
      results.find((result) => result.type === 'error'),
      { type: 'error', error: expectedError },
    )
  },
)

Deno.test(
  'Stream.map - should emit generator errors before completion',
  async () => {
    const expectedError = new Error('source race')
    const stream = Source.from<number, Error>(async function* () {
      yield 1
      await Promise.resolve()
      throw expectedError
    }).withConcurrency(1)

    const mapped = stream.map((value) => value)
    const results = await mapped.toArray()

    assertEquals(
      results.map((result) => result.type).sort(),
      ['error', 'success'],
    )
    assertEquals(
      results.find((result) => result.type === 'success'),
      { type: 'success', value: 1 },
    )
    assertEquals(
      results.find((result) => result.type === 'error'),
      { type: 'error', error: expectedError },
    )
  },
)

Deno.test('Stream.map - should provide correct arrivalIndex for concurrent tasks', async () => {
  const stream = Source.fromResults<number, Error>(async function* () {
    yield success(1)
    yield failure(new Error('2 is evil'))
    yield success(3)
  })

  const seen: Array<{ value: number; index: number }> = []
  await stream.map(async (value, index) => {
    await Promise.resolve()
    seen.push({ value, index })
  }).toArray()

  assertEquals(seen, [
    { value: 1, index: 0 },
    { value: 3, index: 1 },
  ])
})

Deno.test(
  'Stream.throwOn - should preserve concurrency settings',
  async () => {
    let inFlight = 0
    let maxObserved = 0
    const started = deferred<void>()
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()]
    const stream = Source.from<number, 'boom'>(async function* () {
      yield 1
      yield 2
      yield 3
    }).withConcurrency(1)

    const mapped = stream
      .throwOn((error): error is 'boom' => error === 'boom')
      .map(async (value) => {
        inFlight += 1
        maxObserved = Math.max(maxObserved, inFlight)
        if (inFlight === 1) {
          started.resolve()
        }
        await gates[value - 1].promise
        inFlight -= 1
        return value
      })

    const resultsPromise = mapped.toArray()
    await started.promise

    assertEquals(maxObserved, 1)

    for (const gate of gates) {
      gate.resolve()
    }

    await resultsPromise
  },
)

Deno.test(
  'Stream.map - should convert thrown errors into error results',
  async () => {
    const stream = streamFrom<number, Error>([success(2), success(3)])
    const expectedError = new Error('nope')
    const mapped = stream.map((value) => {
      if (value === 3) {
        throw expectedError
      }
      return value * 2
    })

    const results = await mapped.toArray()

    assertEquals(results, [
      { type: 'success', value: 4 },
      { type: 'error', error: expectedError },
    ])
  },
)

Deno.test(
  'Stream.filter - should keep matching successes',
  async () => {
    const stream = streamFrom<number, string>([
      success(1),
      success(2),
      failure('bad'),
    ])
    const filtered = stream.filter((value) => value % 2 === 0)

    const results = await filtered.toArray()

    assertEquals(results, [
      { type: 'success', value: 2 },
      { type: 'error', error: 'bad' },
    ])
  },
)

Deno.test(
  'Stream.filter - should convert thrown errors into error results',
  async () => {
    const stream = streamFrom<number, Error>([success(1), success(2)])
    const expectedError = new Error('filter failed')
    const filtered = stream.filter((value) => {
      if (value === 2) {
        throw expectedError
      }
      return true
    })

    const results = await filtered.toArray()

    assertEquals(results, [
      { type: 'success', value: 1 },
      { type: 'error', error: expectedError },
    ])
  },
)

Deno.test('Stream.filter - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    success(10),
    success(20),
    failure('bad'),
    success(30),
  ])

  const seen: Array<{ value?: number; index: number }> = []
  await stream.filter((value, index) => {
    seen.push({ value, index })
    return true
  }).toArray()

  assertEquals(seen, [
    { value: 10, index: 0 },
    { value: 20, index: 1 },
    { value: 30, index: 2 },
  ])
})

Deno.test(
  'Stream.fold - should accumulate successful values',
  async () => {
    const stream = streamFrom<number, string>([success(1), success(3)])

    const result = await stream.fold((acc, value) => acc + value, 0)

    assertEquals(result, 4)
  },
)

Deno.test(
  'Stream.fold - should throw aggregate error when errors are present',
  async () => {
    const stream = streamFrom<number, string>([
      success(1),
      failure('bad'),
      success(3),
    ])

    await assertRejects(
      () => stream.fold((acc, value) => acc + value, 0),
      Error,
      'AggregateError: 1 errors',
    )
  },
)

Deno.test(
  'Stream.fold - should throw aggregate error when callback fails',
  async () => {
    const stream = streamFrom<number, Error>([success(1), success(2)])
    const expectedError = new Error('fold failed')

    await assertRejects(
      () =>
        stream.fold((acc, value) => {
          if (value === 2) {
            throw expectedError
          }
          return acc + value
        }, 0),
      Error,
      'fold failed',
    )
  },
)

Deno.test('Stream.fold - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    success(10),
    success(20),
    success(30),
  ])

  const seen: Array<{ value: number; index: number }> = []
  await stream.fold((acc, value, index) => {
    seen.push({ value, index })
    return acc + value
  }, 0)

  assertEquals(seen, [
    { value: 10, index: 0 },
    { value: 20, index: 1 },
    { value: 30, index: 2 },
  ])
})

Deno.test('Stream.mapErr - should transform errors', async () => {
  const stream = streamFrom<number, string>([failure('bad'), success(1)])
  const mapped = stream.mapErr((error) => `${error}-mapped`)

  const results = await mapped.toArray()

  assertEquals(results, [
    { type: 'error', error: 'bad-mapped' },
    { type: 'success', value: 1 },
  ])
})

Deno.test('Stream.mapErr - should emit error when callback throws', async () => {
  const stream = streamFrom<number, string>([failure('bad'), success(1)])
  const mapped = stream.mapErr((error) => {
    // deno-lint-ignore no-throw-literal
    if (error === 'bad') throw 'mapped-error'
    return error
  })

  const results = await mapped.toArray()

  assertEquals(results, [
    { type: 'error', error: 'mapped-error' },
    { type: 'success', value: 1 },
  ])
})

Deno.test('Stream.mapErr - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    failure('bad1'),
    success(1),
    failure('bad2'),
  ])

  const seen: Array<{ error: string; index: number }> = []
  await stream.mapErr((error, index) => {
    seen.push({ error, index })
    return error
  }).toArray()

  assertEquals(seen, [
    { error: 'bad1', index: 0 },
    { error: 'bad2', index: 1 },
  ])
})

Deno.test('Stream.filterErr - should keep matching errors', async () => {
  const stream = streamFrom<number, string>([
    failure('bad'),
    failure('worse'),
    success(1),
  ])
  const filtered = stream.filterErr((error) => error === 'worse')

  const results = await filtered.toArray()

  assertEquals(results, [
    { type: 'error', error: 'worse' },
    { type: 'success', value: 1 },
  ])
})

Deno.test('Stream.filterErr - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    failure('bad1'),
    success(1),
    failure('bad2'),
  ])

  const seen: Array<{ error: string; index: number }> = []
  await stream.filterErr((error, index) => {
    seen.push({ error, index })
    return error === 'bad2'
  }).toArray()

  assertEquals(seen, [
    { error: 'bad1', index: 0 },
    { error: 'bad2', index: 1 },
  ])
})

Deno.test('Stream.foldErr - should accumulate errors', async () => {
  const stream = streamFrom<number, string>([
    failure('bad'),
    success(1),
    failure('worse'),
  ])

  const result = await stream.foldErr((acc, error) => `${acc}|${error}`, '')

  assertEquals(result, '|bad|worse')
})

Deno.test(
  'Stream.foldErr - should throw raw error when callback fails',
  async () => {
    const stream = streamFrom<number, Error>([failure(new Error('bad'))])
    const expectedError = new Error('foldErr failed')

    await assertRejects(
      () =>
        stream.foldErr(() => {
          throw expectedError
        }, ''),
      Error,
      'foldErr failed',
    )
  },
)

Deno.test('Stream.foldErr - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    failure('bad1'),
    success(1),
    failure('bad2'),
  ])

  const seen: Array<{ error: string; index: number }> = []
  await stream.foldErr((acc, error, index) => {
    seen.push({ error, index })
    return `${acc}|${error}`
  }, '')

  assertEquals(seen, [
    { error: 'bad1', index: 0 },
    { error: 'bad2', index: 1 },
  ])
})

Deno.test(
  'Stream.recoverWhen - should convert matching errors to success',
  async () => {
    const stream = streamFrom<number, 'recover' | 'skip'>([
      failure('recover'),
      failure('skip'),
    ])
    const recovered = stream.recoverWhen(
      (error): error is 'recover' => error === 'recover',
      () => 42,
    )

    const results = await recovered.toArray()

    assertEquals(results, [
      { type: 'success', value: 42 },
      { type: 'error', error: 'skip' },
    ])
  },
)

Deno.test(
  'Stream.recoverWhen - should throw Death when recovery function throws',
  async () => {
    const stream = streamFrom<number, string>([
      failure('recoverable'),
    ])
    const recovered = stream.recoverWhen(
      (error): error is 'recoverable' => error === 'recoverable',
      () => {
        // deno-lint-ignore no-throw-literal
        throw 'recovery failed'
      },
    )

    await assertRejects(
      () => recovered.toArray(),
      Death,
    )
  },
)

Deno.test(
  'Stream.recoverWhen - should provide correct arrivalIndex',
  async () => {
    const stream = streamFrom<number, string>([
      failure('bad1'),
      failure('bad2'),
    ])
    const seen: Array<{ error: string; index: number }> = []
    const recovered = stream.recoverWhen(
      (error): error is string => {
        seen.push({ error, index: seen.length })
        return true
      },
      () => 0,
    )

    await recovered.toArray()

    assertEquals(seen, [
      { error: 'bad1', index: 0 },
      { error: 'bad2', index: 1 },
    ])
  },
)

Deno.test('Stream.recover - should convert errors to successes', async () => {
  const stream = streamFrom<number, string>([failure('bad'), success(1)])
  const recovered = stream.recover(() => 0)

  const results = await recovered.toArray()

  assertEquals(results, [
    { type: 'success', value: 0 },
    { type: 'success', value: 1 },
  ])
})

Deno.test('Stream.recover - should throw Death when recovery function throws', () => {
  const stream = streamFrom<number, string>([failure('bad')])
  const recovered = stream.recover(() => {
    throw new Error('recovery failed')
  })

  assertRejects(
    () => recovered.toArray(),
    Death,
  )
})

Deno.test('Stream.tap - should run side effect and pass through', async () => {
  const seen: number[] = []
  const stream = streamFrom<number, string>([
    success(1),
    failure('bad'),
    success(2),
  ])
  const tapped = stream.tap((value) => {
    seen.push(value)
  })

  const results = await tapped.toArray()

  assertEquals(seen, [1, 2])
  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'bad' },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Stream.tap - should convert thrown errors into error results', async () => {
  const stream = streamFrom<number, Error>([success(1), success(2)])
  const expectedError = new Error('tap failed')
  const tapped = stream.tap((value) => {
    if (value === 2) throw expectedError
  })

  const results = await tapped.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: expectedError },
  ])
})

Deno.test('Stream.tap - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    success(10),
    success(20),
    failure('bad'),
    success(30),
  ])
  const seen: Array<{ value?: number; index: number }> = []
  await stream.tap((value, index) => {
    seen.push({ value, index })
  }).toArray()

  assertEquals(seen, [
    { value: 10, index: 0 },
    { value: 20, index: 1 },
    { value: 30, index: 2 },
  ])
})

Deno.test('Stream.tapErr - should run side effect on errors and pass through', async () => {
  const stream = streamFrom<number, string>([
    failure('bad'),
    success(1),
    failure('worse'),
  ])
  const seen: string[] = []
  const tapped = stream.tapErr((error) => {
    seen.push(error)
  })

  const results = await tapped.toArray()

  assertEquals(seen, ['bad', 'worse'])
  assertEquals(results, [
    { type: 'error', error: 'bad' },
    { type: 'success', value: 1 },
    { type: 'error', error: 'worse' },
  ])
})

Deno.test('Stream.tapErr - should convert thrown errors into error results', async () => {
  const stream = streamFrom<number, Error>([
    failure(new Error('bad')),
    success(1),
  ])
  const expectedError = new Error('tapErr failed')
  const tapped = stream.tapErr(() => {
    throw expectedError
  })

  const results = await tapped.toArray()

  assertEquals(results, [
    { type: 'error', error: expectedError },
    { type: 'success', value: 1 },
  ])
})

Deno.test('Stream.tapErr - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    failure('bad1'),
    success(1),
    failure('bad2'),
  ])
  const seen: Array<{ error: string; index: number }> = []
  await stream.tapErr((error, index) => {
    seen.push({ error, index })
  }).toArray()

  assertEquals(seen, [
    { error: 'bad1', index: 0 },
    { error: 'bad2', index: 1 },
  ])
})

Deno.test('Stream.take - should limit successes, errors pass through', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure('bad'),
    success(2),
    success(3),
    success(4),
  ])
  const taken = stream.take(2)

  const results = await taken.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'bad' },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Stream.take - should handle n=0', async () => {
  const stream = streamFrom<number, string>([success(1), success(2)])
  const taken = stream.take(0)

  const results = await taken.toArray()

  assertEquals(results, [])
})

Deno.test('Stream.takeWhile - should stop when predicate returns false', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(5),
    success(3),
  ])
  const taken = stream.takeWhile((value) => value < 5)

  const results = await taken.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Stream.takeWhile - should emit error and stop when predicate throws', async () => {
  const stream = streamFrom<number, Error>([success(1), success(2)])
  const expectedError = new Error('predicate failed')
  const taken = stream.takeWhile((value) => {
    if (value === 2) throw expectedError
    return true
  })

  const results = await taken.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: expectedError },
  ])
})

Deno.test('Stream.takeWhile - should handle empty stream', async () => {
  const stream = streamFrom<number, string>([])
  const taken = stream.takeWhile(() => true)

  const results = await taken.toArray()

  assertEquals(results, [])
})

Deno.test('Stream.takeWhile - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    success(10),
    success(20),
    success(5),
    success(30),
  ])
  const seen: Array<{ value: number; index: number }> = []
  await stream.takeWhile((value, index) => {
    seen.push({ value, index })
    return value >= 10 && value < 30
  }).toArray()

  assertEquals(seen, [
    { value: 10, index: 0 },
    { value: 20, index: 1 },
    { value: 5, index: 2 },
  ])
})

Deno.test('Stream.partition - should split successes and errors', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure('bad'),
    success(2),
    failure('worse'),
  ])

  const { successes, errors } = await stream.partition()

  assertEquals(successes, [1, 2])
  assertEquals(errors, ['bad', 'worse'])
})

Deno.test('Stream.partition - should handle stream with only successes', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ])

  const { successes, errors } = await stream.partition()

  assertEquals(successes, [1, 2, 3])
  assertEquals(errors, [])
})

Deno.test('Stream.partition - should handle stream with only errors', async () => {
  const stream = streamFrom<number, string>([
    failure('bad'),
    failure('worse'),
    failure('terrible'),
  ])

  const { successes, errors } = await stream.partition()

  assertEquals(successes, [])
  assertEquals(errors, ['bad', 'worse', 'terrible'])
})

Deno.test('Stream integration - should compose multiple operations', async () => {
  const stream = Source.from<number, Error>(async function* () {
    yield 1
    yield 2
    yield 3
    yield 4
    yield 5
    throw new Error('source error')
  })

  const result = await stream
    .map((n) => {
      if (n === 3) throw new Error('map error')
      return n
    })
    .filter((n) => n % 2 !== 0) // keep odds: 1, 5
    .flatMap((n) => [n, n * 100]) // expand: 1, 100, 5, 500
    .recover(() => -1) // recover all errors as -1
    .collect()

  assertEquals(result.sort((a, b) => a - b), [-1, -1, 1, 5, 100, 500])
})

Deno.test(
  'Stream integration - partial recovery: recoverWhen leaves unmatched errors intact',
  async () => {
    type Err = 'retryable' | 'fatal'
    const stream = Source.from<number, Err>(async function* () {
      yield 1
      yield 2
      yield 3
    })

    const { successes, errors } = await stream
      .map((n): number => {
        if (n === 1) throw 'retryable' as Err
        if (n === 2) throw 'fatal' as Err
        return n * 10
      })
      .recoverWhen(
        (e): e is 'retryable' => e === 'retryable',
        () => -1,
      )
      .partition()

    assertEquals(successes.sort((a, b) => a - b), [-1, 30])
    assertEquals(errors, ['fatal'])
  },
)

Deno.test(
  'Stream integration - error transformation chain: mapErr then filterErr',
  async () => {
    const stream = Source.from<number, string>(async function* () {
      yield 1
      yield 2
      yield 3
    })

    const { successes, errors } = await stream
      .map((n) => {
        // deno-lint-ignore no-throw-literal
        if (n === 1) throw 'minor error'
        // deno-lint-ignore no-throw-literal
        if (n === 2) throw 'CRITICAL error'
        return n * 10
      })
      .mapErr((e: string) => e.toUpperCase())
      .filterErr((e) => e.startsWith('CRITICAL'))
      .partition()

    assertEquals(successes, [30])
    assertEquals(errors, ['CRITICAL ERROR'])
  },
)

Deno.test(
  'Stream integration - tap and tapErr observe without affecting pipeline',
  async () => {
    const successLog: number[] = []
    const errorLog: string[] = []

    const stream = Source.from<number, string>(async function* () {
      yield 1
      yield 2
      yield 3
    })

    const { successes, errors } = await stream
      .map((n) => {
        // deno-lint-ignore no-throw-literal
        if (n === 2) throw 'bad'
        return n * 10
      })
      .tap((v) => {
        successLog.push(v)
      })
      .tapErr((e: string) => {
        errorLog.push(e)
      })
      .map((n) => n + 1)
      .partition()

    assertEquals(successLog, [10, 30])
    assertEquals(errorLog, ['bad'])
    assertEquals(successes, [11, 31])
    assertEquals(errors, ['bad'])
  },
)

Deno.test(
  'Stream integration - take limits output of a large source',
  async () => {
    const stream = Source.from<number, never>(async function* () {
      let i = 0
      while (true) yield i++
    })

    const results = await stream
      .map((n) => n * 2)
      .take(5)
      .collect()

    assertEquals(results, [0, 2, 4, 6, 8])
  },
)

Deno.test(
  'Stream integration - takeWhile stops pipeline mid-stream',
  async () => {
    const stream = Source.from<number, string>(async function* () {
      yield 1
      yield 2
      yield 3
      yield 4
      yield 5
    })

    const { successes, errors } = await stream
      .map((n) => {
        // deno-lint-ignore no-throw-literal
        if (n === 2) throw 'oops'
        return n
      })
      .takeWhile((n) => n < 4)
      .partition()

    // 1 passes, 2 becomes error (errors pass through takeWhile),
    // 3 passes, 4 triggers takeWhile to stop
    assertEquals(successes, [1, 3])
    assertEquals(errors, ['oops'])
  },
)

Deno.test(
  'Stream integration - concurrent map with error accumulation',
  async () => {
    const stream = Source.from<number, Error>(async function* () {
      for (let i = 1; i <= 6; i++) yield i
    }).withConcurrency(3)

    const { successes, errors } = await stream
      .map(async (n) => {
        await Promise.resolve()
        if (n % 2 === 0) throw new Error(`even: ${n}`)
        return n
      })
      .filter((n) => n < 5)
      .partition()

    assertEquals(successes.sort((a, b) => a - b), [1, 3])
    assertEquals(
      errors.map((e) => e.message).sort(),
      ['even: 2', 'even: 4', 'even: 6'],
    )
  },
)

Deno.test('Stream.throwOn - should throw matching errors', async () => {
  const stream = streamFrom<number, 'boom' | 'other'>([
    success(1),
    failure('boom'),
    success(2),
  ])
  const throwsOn = stream.throwOn(
    (error): error is 'boom' => error === 'boom',
  )

  await assertRejects(
    async () => {
      for await (const _ of throwsOn.successes()) {
        // iterate to trigger throw
      }
    },
    'boom',
  )
})

Deno.test('Stream.throwOn - should throw the same error instance', async () => {
  const expectedError = new Error('explode')
  const stream = streamFrom<number, Error>([
    success(1),
    failure(expectedError),
    success(2),
  ])
  const throwsOn = stream.throwOn(
    (error): error is Error => error === expectedError,
  )

  await assertRejects(
    async () => {
      for await (const _ of throwsOn.successes()) {
        // iterate to trigger throw
      }
    },
    Error,
    'explode',
  )
})

Deno.test('Stream.scan - should emit running accumulator', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ])
  const scanned = stream.scan((sum, n) => sum + n, 0)

  const results = await scanned.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 3 },
    { type: 'success', value: 6 },
  ])
})

Deno.test('Stream.scan - should pass errors through', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure('bad'),
    success(2),
  ])
  const scanned = stream.scan((sum, n) => sum + n, 0)

  const results = await scanned.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'bad' },
    { type: 'success', value: 3 },
  ])
})

Deno.test('Stream.scan - should emit initial value', async () => {
  const stream = streamFrom<number, string>([
    success(10),
  ])
  const scanned = stream.scan((acc, n) => acc + n, 5)

  const results = await scanned.toArray()

  assertEquals(results, [
    { type: 'success', value: 15 },
  ])
})

Deno.test('Stream.scan - should emit error when callback throws', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ])
  const scanned = stream.scan((sum, n) => {
    // deno-lint-ignore no-throw-literal
    if (n === 2) throw 'scan failed'
    return sum + n
  }, 0)

  const results = await scanned.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'scan failed' },
    { type: 'success', value: 4 },
  ])
})

Deno.test('Stream.scan - should provide correct arrivalIndex', async () => {
  const stream = streamFrom<number, string>([
    success(10),
    success(20),
    success(30),
  ])
  const seen: Array<{ value: number; index: number }> = []
  await stream.scan((sum, n, index) => {
    const result = sum + n
    seen.push({ value: result, index })
    return result
  }, 0).toArray()

  assertEquals(seen, [
    { value: 10, index: 0 },
    { value: 30, index: 1 },
    { value: 60, index: 2 },
  ])
})

Deno.test('Stream.scanErr - should emit running accumulator for errors', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure('bad'),
    failure('worse'),
  ])
  const scanned = stream.scanErr((acc, error) => `${acc}|${error}`, '')

  const results = await scanned.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: '|bad' },
    { type: 'error', error: '|bad|worse' },
  ])
})

Deno.test('Stream.chunks - should group successes into arrays', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
    success(4),
    success(5),
  ])
  const chunked = stream.chunks(2)

  const results = await chunked.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 2] },
    { type: 'success', value: [3, 4] },
    { type: 'success', value: [5] },
  ])
})

Deno.test('Stream.chunks - should emit partial chunk at end', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ])
  const chunked = stream.chunks(2)

  const results = await chunked.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 2] },
    { type: 'success', value: [3] },
  ])
})

Deno.test('Stream.chunks - should pass errors through without breaking chunk', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    failure('bad'),
    success(3),
    success(4),
  ])
  const chunked = stream.chunks(2)

  const results = await chunked.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 2] },
    { type: 'error', error: 'bad' },
    { type: 'success', value: [3, 4] },
  ])
})

Deno.test('Stream.chunks - should flush chunk on error', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
    failure('bad'),
    success(4),
  ])
  const chunked = stream.chunks(2)

  const results = await chunked.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 2] },
    { type: 'success', value: [3] },
    { type: 'error', error: 'bad' },
    { type: 'success', value: [4] },
  ])
})

Deno.test('Stream.zip - should combine two streams into tuples', async () => {
  const stream1 = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ])
  const stream2 = streamFrom<string, string>([success('a'), success('b')])

  const zipped = stream1.zip(stream2)

  const results = await zipped.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 'a'] },
    { type: 'success', value: [2, 'b'] },
  ])
})

Deno.test('Stream.zip - should stop at shorter stream', async () => {
  const stream1 = streamFrom<number, string>([success(1)])
  const stream2 = streamFrom<number, string>([
    success(10),
    success(20),
    success(30),
  ])

  const zipped = stream1.zip(stream2)

  const results = await zipped.toArray()

  assertEquals(results, [{ type: 'success', value: [1, 10] }])
})

Deno.test('Stream.zip - should handle errors from left stream', async () => {
  const stream1 = streamFrom<number, string>([
    success(1),
    failure('boom'),
    success(3),
  ])
  const stream2 = streamFrom<number, string>([success(10), success(20)])

  const zipped = stream1.zip(stream2)

  const results = await zipped.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 10] },
    { type: 'error', error: 'boom' },
    { type: 'success', value: [3, 20] },
  ])
})

Deno.test('Stream.zip - should handle errors from right stream', async () => {
  const stream1 = streamFrom<number, string>([success(1), success(2)])
  const stream2 = streamFrom<number, string>([success(10), failure('boom')])

  const zipped = stream1.zip(stream2)

  const results = await zipped.toArray()

  assertEquals(results, [
    { type: 'success', value: [1, 10] },
    { type: 'error', error: 'boom' },
  ])
})

Deno.test('Stream.merge - should interleave two streams', async () => {
  const stream1 = Source.from<number, string>(async function* () {
    yield 1
    yield 3
  })
  const stream2 = Source.from<number, string>(async function* () {
    yield 2
    yield 4
  })

  const merged = stream1.merge(stream2)

  const { successes } = await merged.partition()

  assertEquals(successes.sort((a, b) => a - b), [1, 2, 3, 4])
})

Deno.test('Stream.merge - should pass through errors', async () => {
  const stream1 = Source.from<number, Error>(async function* () {
    yield 1
    yield 2
  })
  const stream2 = Source.from<number, Error>(async function* () {
    yield 3
    throw new Error('boom')
  })

  const merged = stream1.merge(stream2)

  const { errors } = await merged.partition()

  assertEquals(errors.length, 1)
  assertEquals(errors[0].message, 'boom')
})

Deno.test('Stream.merge - should handle empty streams', async () => {
  const stream1 = Source.from<number, never>(async function* () {
  })
  const stream2 = Source.from<number, never>(async function* () {
    yield 1
    yield 2
  })

  const merged = stream1.merge(stream2)

  const results = await merged.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Stream.merge - should complete when both streams are done', async () => {
  const stream1 = Source.from<number, never>(async function* () {
    yield 1
  })
  const stream2 = Source.from<number, never>(async function* () {
    yield 2
  })

  const merged = stream1.merge(stream2)
  const results = await merged.toArray()

  assertEquals(results.length, 2)
  const values = results.map((r) => (r as { value: number }).value)
  assertEquals(values.includes(1), true)
  assertEquals(values.includes(2), true)
})

Deno.test('Stream.splitN - should apply backpressure when one branch is slow', async () => {
  let generatedCount = 0
  const stream = Source.from<number, never>(async function* () {
    generatedCount++
    yield 1
    generatedCount++
    yield 2
    generatedCount++
    yield 3
    generatedCount++
    yield 4
  })

  const [fast, slow] = stream.splitN(2, 1)

  const fastResults: number[] = []

  const fastPromise = (async () => {
    for await (
      const result of fast
        .successes()
    ) {
      fastResults.push(result)
    }
  })()

  const slowIterator = slow
    .successes()[Symbol.asyncIterator]()

  const firstSlow = await slowIterator.next()
  assertEquals(firstSlow.value, 1)

  await new Promise((resolve) => setTimeout(resolve, 15))

  // The fast consumer is starving because the slow consumer
  // is holding up the pump. Fast should only have processed 1 and 2.
  assertEquals(fastResults, [1, 2])
  assertEquals(generatedCount, 3)

  // Unblock the slow consumer to drain the rest of the stream
  await slowIterator.next()
  await slowIterator.next()
  await slowIterator.next()
  await slowIterator.next()

  await fastPromise // Fast consumer should now finish
  assertEquals(fastResults, [1, 2, 3, 4])
})

Deno.test('Stream.splitN - should wrap thrown source errors in PumpError', async () => {
  const stream = Source.from<number, string>(async function* () {
    yield 1
    throw new Error('source died')
  })

  const [a, b] = stream.splitN(2, 10)

  const [resultsA, resultsB] = await Promise.all([
    a.toArray(),
    b.toArray(),
  ])

  assertEquals(resultsA.length, 2)
  assertEquals(resultsA[0], { type: 'success', value: 1 })
  assertEquals(resultsA[1].type, 'error')

  const errorObjA = (resultsA[1] as ErrorResult<number, PumpError>).error
  assertEquals(errorObjA.message, 'source died')

  assertEquals(resultsB, resultsA)
})

Deno.test('Stream.splitN - should split into 1 if n=0', () => {
  const stream = streamFrom<number, never>([
    success(1),
    success(2),
    success(3),
  ])

  const split = stream.splitN(0, 10)

  assertEquals(split.length, 1)
})

Deno.test('Stream.splitN - should split into 1 if n < 0', () => {
  const stream = streamFrom<number, never>([
    success(1),
    success(2),
    success(3),
  ])

  const split = stream.splitN(-5, 10)

  assertEquals(split.length, 1)
})

Deno.test('Stream.splitBy - should route items to the correct streams', async () => {
  const stream = streamFrom<number, never>([
    success(1),
    success(2),
    success(3),
    success(4),
  ])

  const { even, odd } = stream.splitBy(
    ['even', 'odd'] as const,
    (n) => (n % 2 === 0 ? 'even' : 'odd'),
    10,
  )

  const [evens, odds] = await Promise.all([
    even.collect(),
    odd.collect(),
  ])

  assertEquals(evens, [2, 4])
  assertEquals(odds, [1, 3])
})

Deno.test('Stream.splitBy - should broadcast MissingKeyError to all streams if key is not found', async () => {
  const stream = streamFrom<number, never>([
    success(1), // Matches 'one'
    success(2), // Matches 'two'
    success(3), // Unmatched! Throws MissingKeyError(3)
    success(4), // Unmatched! Throws MissingKeyError(4)
    success(5), // Matches 'one' - Pipeline is still alive!
  ])

  const { one, two } = stream.splitBy(
    ['one', 'two'] as const,
    // Safely cast to trick TS for the test
    (n) => {
      if (n === 1 || n === 5) return 'one'
      if (n === 2) return 'two'
      return n as unknown as 'one' | 'two'
    },
    10,
  )

  const [resOne, resTwo] = await Promise.all([one.toArray(), two.toArray()])

  assertEquals(resOne.length, 4)
  assertEquals(resOne[0], { type: 'success', value: 1 })
  assertEquals((resOne[1] as ErrorResult<number, MissingKeyError>).error.key, 3)
  assertEquals((resOne[2] as ErrorResult<number, MissingKeyError>).error.key, 4)
  assertEquals(resOne[3], { type: 'success', value: 5 }) // Survived and processed!

  assertEquals(resTwo.length, 3)
  assertEquals(resTwo[0], { type: 'success', value: 2 })
  assertEquals((resTwo[1] as ErrorResult<number, MissingKeyError>).error.key, 3)
  assertEquals((resTwo[2] as ErrorResult<number, MissingKeyError>).error.key, 4)
})

Deno.test('Stream.splitBy - should broadcast callback errors to all streams', async () => {
  const stream = streamFrom<number, string>([success(1), success(2)])
  const expectedError = new Error('callback failed')

  const { a, b } = stream.splitBy(
    ['a', 'b'] as const,
    (n) => {
      if (n === 2) throw expectedError
      return 'a'
    },
    10,
  )

  const [resA, resB] = await Promise.all([a.toArray(), b.toArray()])

  assertEquals(resA, [
    { type: 'success', value: 1 },
    { type: 'error', error: expectedError },
  ])
  assertEquals(resB, [
    { type: 'error', error: expectedError },
  ])
})

Deno.test('Stream.splitBy - should broadcast upstream errors to all streams', async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure('boom'),
    success(2),
  ])

  const { a, b } = stream.splitBy(
    ['a', 'b'] as const,
    (n) => (n === 1 ? 'a' : 'b'),
    10,
  )

  const [resA, resB] = await Promise.all([a.toArray(), b.toArray()])

  assertEquals(resA, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'boom' },
  ]) // Doesn't get 2 because the error happens first

  assertEquals(resB, [
    { type: 'error', error: 'boom' },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Stream.splitBy - should throw synchronously if keys array is empty', () => {
  const stream = streamFrom<number, never>([])

  assertThrows(
    () => stream.splitBy([], () => 'a', 10),
    NoKeysError,
  )
})

Deno.test('Stream.splitBy - backpressure on one branch eventually pauses upstream', async () => {
  let generatedCount = 0
  const stream = Source.from<number, never>(async function* () {
    while (generatedCount < 100) {
      generatedCount++
      yield generatedCount
    }
  })

  const { even, odd } = stream.splitBy(
    ['even', 'odd'] as const,
    (n) => (n % 2 === 0 ? 'even' : 'odd'),
    1,
  )

  const evenIter = even.successes()[Symbol.asyncIterator]()
  const oddIter = odd.successes()[Symbol.asyncIterator]()

  const firstOdd = await oddIter.next()
  const firstEven = await evenIter.next()

  assertEquals(firstOdd.value, 1)
  assertEquals(firstEven.value, 2)

  await new Promise((resolve) => setTimeout(resolve, 50))

  // If backpressure works, the pump is frozen at item 5.
  assertEquals(
    generatedCount,
    5,
    `Source should have paused at 5, but was ${generatedCount}`,
  )

  const secondOdd = await oddIter.next()
  assertEquals(secondOdd.value, 3)

  // Give the pump a microtask to realize capacity opened up,
  await new Promise((resolve) => setTimeout(resolve, 20))

  assertEquals(
    generatedCount >= 6,
    true,
    'Source should have resumed after clearing buffer',
  )

  await evenIter.return?.()
  await oddIter.return?.()
})

Deno.test('Stream.flatten - should flatten standard arrays (Iterable)', async () => {
  const stream = streamFrom<number[], string>([
    success([1, 2]),
    success([]),
    success([3, 4]),
  ])

  const flattened = stream.flatten()
  const results = await flattened.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
    { type: 'success', value: 3 },
    { type: 'success', value: 4 },
  ])
})

Deno.test('Stream.flatten - should flatten AsyncIterables', async () => {
  async function* generateNumbers(start: number) {
    yield start
    yield start + 1
  }

  const stream = streamFrom<AsyncIterable<number>, string>([
    success(generateNumbers(10)),
    success(generateNumbers(20)),
  ])

  const flattened = stream.flatten()
  const results = await flattened.toArray()

  assertEquals(results, [
    { type: 'success', value: 10 },
    { type: 'success', value: 11 },
    { type: 'success', value: 20 },
    { type: 'success', value: 21 },
  ])
})

Deno.test('Stream.flatten - should pass through outer stream errors', async () => {
  const stream = streamFrom<number[], string>([
    success([1]),
    failure('outer-error'),
    success([2]),
  ])

  const flattened = stream.flatten()
  const results = await flattened.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: 'outer-error' },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Stream.flatten - should catch and emit errors from inner async iteration', async () => {
  const expectedError = new Error('inner generator failed')

  async function* failingGenerator() {
    yield 1
    throw expectedError
  }

  async function* successfulGenerator() {
    yield 2
  }

  const stream = streamFrom<AsyncIterable<number>, Error>([
    success(failingGenerator()),
    success(successfulGenerator()),
  ])

  const flattened = stream.flatten()
  const results = await flattened.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'error', error: expectedError },
    { type: 'success', value: 2 },
  ])
})

Deno.test('Stream.flatMap (concurrent) - should catch and emit error if fn returns non-iterable', async () => {
  const stream = Source.from<number, Error>(async function* () {
    yield 1
  }).withConcurrency(2)

  const flattened = stream.flatMap(() => {
    // Returning something that is not an iterable or async iterable
    return 123 as unknown as number[]
  })

  const results = await flattened.toArray()

  assertEquals(results.length, 1)
  assertEquals(results[0].type, 'error')
  assertEquals(
    (results[0] as { error: Error }).error.message,
    'flatMap function must return an iterable',
  )
})

Deno.test('Stream.zip — healthy-side value is not dropped when partner emits error', async () => {
  const left = streamFrom<number, string>([failure('boom'), success(1)])
  const right = streamFrom<string, never>([success('a'), success('b')])

  const results = await left.zip(right).toArray()

  // There should be exactly one error and one success.
  assertEquals(results.length, 2)

  const [first, second] = results
  assertEquals(first, { type: 'error', error: 'boom' })

  // "a" was fetched from the right iterator in the same round as the error.
  // It must not be discarded — the successful pair must be [1, "a"], not [1, "b"].
  assertEquals(second, { type: 'success', value: [1, 'a'] })
})

Deno.test('Stream.zip — both errors emitted when both sides error simultaneously', async () => {
  // Symmetric case: both sides error in the same round.
  // Both errors should be emitted and the subsequent pair should use the
  // next values from each side — nothing dropped.
  const left = streamFrom<number, string>([failure('left-err'), success(1)])
  const right = streamFrom<number, string>([failure('right-err'), success(2)])

  const results = await left.zip(right).toArray()

  const errors = results.filter((r) => r.type === 'error')
  assertEquals(errors.length, 2)

  const successes = results.filter((r) => r.type === 'success')
  assertEquals(successes.length, 1)
  assertEquals(successes[0], { type: 'success', value: [1, 2] })
})

Deno.test('Stream.map — default (Infinity) concurrency executes tasks concurrently', async () => {
  const gate0 = deferred<void>()
  const gate1 = deferred<void>()
  let inFlight = 0
  let maxInFlight = 0

  // No .withConcurrency() call — uses the Infinity default.
  const stream = Source.from<number, never>(async function* () {
    yield 0
    yield 1
  })

  const resultsPromise = stream
    .map(async (value) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await (value === 0 ? gate0.promise : gate1.promise)
      inFlight--
      return value
    })
    .toArray()

  // Yield to the microtask queue so both tasks have a chance to start.
  await new Promise((r) => setTimeout(r, 0))

  gate0.resolve()
  gate1.resolve()
  await resultsPromise

  assertEquals(
    maxInFlight,
    2,
    `Both tasks should run concurrently with Infinity concurrency, ` +
      `but maxInFlight was ${maxInFlight} — sequential path is being used.`,
  )
})

Deno.test('Stream.flatMap — default (Infinity) concurrency executes tasks concurrently', async () => {
  const gate0 = deferred<void>()
  const gate1 = deferred<void>()
  let inFlight = 0
  let maxInFlight = 0

  const stream = Source.from<number, never>(async function* () {
    yield 0
    yield 1
  })

  const resultsPromise = stream
    .flatMap(async (value) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await (value === 0 ? gate0.promise : gate1.promise)
      inFlight--
      return [value]
    })
    .toArray()

  await new Promise((r) => setTimeout(r, 0))

  gate0.resolve()
  gate1.resolve()
  await resultsPromise

  assertEquals(
    maxInFlight,
    2,
    `flatMap should also run concurrently with Infinity concurrency, ` +
      `but maxInFlight was ${maxInFlight}.`,
  )
})

Deno.test('Stream.merge - should close underlying iterators on early termination', async () => {
  let leftClosed = false
  let rightClosed = false

  const left = Source.from<number, never>(async function* () {
    try {
      yield 1
      // Keep yielding to avoid completion
      while (true) yield 2
    } finally {
      leftClosed = true
    }
  })

  const right = Source.from<number, never>(async function* () {
    try {
      yield 3
      while (true) yield 4
    } finally {
      rightClosed = true
    }
  })

  const merged = left.merge(right)

  // Take only one element and stop
  for await (const _ of merged.take(1)) {
    // break implicitly calls .return() on the generator
  }

  // Give a small delay for the background tasks to realize they're cancelled
  await new Promise((resolve) => setTimeout(resolve, 0))

  assertEquals(leftClosed, true, 'Left stream should be closed')
  assertEquals(rightClosed, true, 'Right stream should be closed')
})

Deno.test('Stream.flatMap (concurrent) - should catch and emit error if fn returns non-iterable', async () => {
  const stream = Source.from<number, Error>(async function* () {
    yield 1
  }).withConcurrency(2)

  const flattened = stream.flatMap(() => {
    // Returning something that is not an iterable or async iterable
    return 123 as unknown as number[]
  })

  const results = await flattened.toArray()

  assertEquals(results.length, 1)
  assertEquals(results[0].type, 'error')
  assertEquals(
    (results[0] as { error: Error }).error.message,
    'flatMap function must return an iterable',
  )
})
