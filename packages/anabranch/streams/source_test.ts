import { assertEquals } from '@std/assert'
import { Source } from '../index.ts'

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
