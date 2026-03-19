import { assertEquals } from '@std/assert'
import { Channel } from '@anabranch/anabranch'
import { AnnotationBatcher } from './batcher.ts'
import type { Annotation } from './annotation.ts'

function createAnnotation(id: number): Annotation {
  return {
    path: `file${id}.ts`,
    startLine: id,
    endLine: id,
    level: 'warning',
    message: `Warning ${id}`,
  }
}

Deno.test('AnnotationBatcher - flushes at batch size limit', async () => {
  const flushed: Annotation[][] = []
  const channel = Channel.create<Annotation>()

  const batcher = new AnnotationBatcher({
    channel,
    batchSize: 3,
    flushInterval: 1000,
    onFlush: (annotations) => {
      flushed.push(annotations)
      return Promise.resolve()
    },
    clock: () => 0,
  })

  batcher.start()

  channel.send(createAnnotation(1))
  channel.send(createAnnotation(2))
  channel.send(createAnnotation(3))
  channel.send(createAnnotation(4))
  channel.send(createAnnotation(5))

  await new Promise((resolve) => setTimeout(resolve, 50))

  assertEquals(flushed.length, 1)
  assertEquals(flushed[0].length, 3)

  await batcher.close()

  assertEquals(flushed.length, 2)
  assertEquals(flushed[1].length, 2)
})

Deno.test('AnnotationBatcher - flushes on interval', async () => {
  const flushed: Annotation[][] = []
  const channel = Channel.create<Annotation>()

  let time = 0
  const batcher = new AnnotationBatcher({
    channel,
    batchSize: 50,
    flushInterval: 100,
    onFlush: (annotations) => {
      flushed.push(annotations)
      return Promise.resolve()
    },
    clock: () => time,
  })

  batcher.start()

  channel.send(createAnnotation(1))
  channel.send(createAnnotation(2))

  time = 50
  await new Promise((resolve) => setTimeout(resolve, 10))

  assertEquals(flushed.length, 0)

  time = 101
  await new Promise((resolve) => setTimeout(resolve, 50))

  assertEquals(flushed.length, 1)
  assertEquals(flushed[0].length, 2)

  await batcher.close()
})

Deno.test('AnnotationBatcher - flushes remaining on close', async () => {
  const flushed: Annotation[][] = []
  const channel = Channel.create<Annotation>()

  const batcher = new AnnotationBatcher({
    channel,
    batchSize: 50,
    flushInterval: 10000,
    onFlush: (annotations) => {
      flushed.push(annotations)
      return Promise.resolve()
    },
    clock: () => 0,
  })

  batcher.start()

  channel.send(createAnnotation(1))
  channel.send(createAnnotation(2))
  channel.send(createAnnotation(3))

  await new Promise((resolve) => setTimeout(resolve, 10))

  assertEquals(flushed.length, 0)

  await batcher.close()

  assertEquals(flushed.length, 1)
  assertEquals(flushed[0].length, 3)
})

Deno.test('AnnotationBatcher - enforces 50 item batch limit', () => {
  const channel = Channel.create<Annotation>()

  let error: Error | undefined
  try {
    new AnnotationBatcher({
      channel,
      batchSize: 51,
      flushInterval: 1000,
      onFlush: () => Promise.resolve(),
      clock: () => 0,
    })
  } catch (e) {
    error = e as Error
  }

  assertEquals(error?.message, 'batchSize cannot exceed 50')

  error = undefined
  try {
    new AnnotationBatcher({
      channel,
      batchSize: 100,
      flushInterval: 1000,
      onFlush: () => Promise.resolve(),
      clock: () => 0,
    })
  } catch (e) {
    error = e as Error
  }

  assertEquals(error?.message, 'batchSize cannot exceed 50')
})

Deno.test('AnnotationBatcher - ignores error results from channel', async () => {
  const flushed: Annotation[][] = []
  const channel = Channel.create<Annotation, string>()

  const batcher = new AnnotationBatcher({
    channel,
    batchSize: 50,
    flushInterval: 1000,
    onFlush: (annotations) => {
      flushed.push(annotations)
      return Promise.resolve()
    },
    clock: () => 0,
  })

  batcher.start()

  channel.send(createAnnotation(1))
  channel.fail('some error')
  channel.send(createAnnotation(2))

  await batcher.close()

  assertEquals(flushed.length, 1)
  assertEquals(flushed[0].length, 2)
})
