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
