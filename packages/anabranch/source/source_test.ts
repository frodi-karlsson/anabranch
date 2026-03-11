import { assertEquals } from '@std/assert'
import { Source, Task } from '../index.ts'

Deno.test('Source.from - should create a stream', async () => {
  const source = (async function* () {
    yield 1
    yield 2
  })()
  const stream = Source.from<number, never>(source)

  const results = await stream.toArray()

  assertEquals(results, [
    { type: 'success', value: 1 },
    { type: 'success', value: 2 },
  ])
})

Deno.test(
  'Source.withConcurrency - should clone with updated concurrency',
  async () => {
    const stream = Source.from<number, string>(async function* () {
      yield 1
    })
    const withConcurrency = stream.withConcurrency(2)

    const results = await withConcurrency.toArray()

    assertEquals(results, [{ type: 'success', value: 1 }])
  },
)

Deno.test(
  'Source.withBufferSize - should clone with updated buffer size',
  async () => {
    const stream = Source.from<number, string>(async function* () {
      yield 1
    })
    const withBufferSize = stream.withBufferSize(4)

    const results = await withBufferSize.toArray()

    assertEquals(results, [{ type: 'success', value: 1 }])
  },
)

Deno.test('Source.fromTask - should create source from successful task', async () => {
  const task = Task.of<number, string>(() => Promise.resolve(42))

  const source = Source.fromTask(task)
  const results = await source.collect()

  assertEquals(results, [42])
})

Deno.test('Source.fromTask - should create source from failed task', async () => {
  const task = Task.of<number, string>(() => Promise.reject('boom'))

  const source = Source.fromTask(task)
  const results = await source.toArray()

  assertEquals(results, [{ type: 'error', error: 'boom' }])
})

Deno.test('Source.fromArray - should create source from array', async () => {
  const source = Source.fromArray([1, 2, 3])
  const results = await source.collect()

  assertEquals(results, [1, 2, 3])
})

Deno.test('Source.fromArray - should handle empty array', async () => {
  const source = Source.fromArray<number>([])
  const results = await source.toArray()

  assertEquals(results, [])
})

Deno.test('Source.fromRange - should emit numbers from start to end', async () => {
  const source = Source.fromRange(1, 4)
  const results = await source.collect()

  assertEquals(results, [1, 2, 3])
})

Deno.test('Source.fromRange - should handle empty range when start equals end', async () => {
  const source = Source.fromRange(5, 5)
  const results = await source.collect()

  assertEquals(results, [])
})

Deno.test('Source.fromRange - should handle empty range when start > end', async () => {
  const source = Source.fromRange(5, 3)
  const results = await source.collect()

  assertEquals(results, [])
})

Deno.test('Source.fromRange - should emit single element when end is start + 1', async () => {
  const source = Source.fromRange(10, 11)
  const results = await source.collect()

  assertEquals(results, [10])
})

Deno.test('Source.fromRange - should emit negative numbers', async () => {
  const source = Source.fromRange(-2, 2)
  const results = await source.collect()

  assertEquals(results, [-2, -1, 0, 1])
})

Deno.test('Source.fromRange - should emit large range', async () => {
  const source = Source.fromRange(0, 100)
  const results = await source.collect()

  assertEquals(results.length, 100)
  assertEquals(results[0], 0)
  assertEquals(results[99], 99)
})

Deno.test('Source.fromRange - should support map operation', async () => {
  const source = Source.fromRange(1, 4)
  const results = await source.map((x) => x * 2).collect()

  assertEquals(results, [2, 4, 6])
})

Deno.test('Source.fromRange - should support withConcurrency', async () => {
  const source = Source.fromRange(1, 5)
  const results = await source.withConcurrency(2).collect()

  assertEquals(results, [1, 2, 3, 4])
})

Deno.test('Source.fromRange - should handle Infinity as end', async () => {
  const source = Source.fromRange(0, Infinity)
  const results = await source.take(5).collect()

  assertEquals(results, [0, 1, 2, 3, 4])
})

Deno.test('Source.fromRange - should handle Infinity as start', async () => {
  const source = Source.fromRange(Infinity, Infinity)
  const results = await source.take(1).collect()

  assertEquals(results, [])
})

Deno.test('Source.fromRange - should handle NaN in start or end', async () => {
  const source1 = Source.fromRange(NaN, 5)
  const results1 = await source1.collect()
  assertEquals(results1, [])

  const source2 = Source.fromRange(0, NaN)
  const results2 = await source2.collect()
  assertEquals(results2, [])
})

Deno.test('Source.fromRange - should handle both start and end as NaN', async () => {
  const source = Source.fromRange(NaN, NaN)
  const results = await source.take(1).collect()

  assertEquals(results, [])
})
