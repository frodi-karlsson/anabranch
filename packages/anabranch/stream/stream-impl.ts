import { _ChannelSource } from '../channel/channel-source.ts'
import { Promisable, Result } from '../util/util.ts'
import { MissingKeyError, NoKeysError, PumpError, Stream } from './stream.ts'
import { AggregateError } from '../util/util.ts'

export class _StreamImpl<T, E> implements Stream<T, E> {
  constructor(
    protected readonly source: () => AsyncGenerator<Result<T, E>>,
    protected readonly concurrency: number = Infinity,
    protected readonly bufferSize: number = Infinity,
  ) {}

  async toArray(): Promise<Result<T, E>[]> {
    const results: Result<T, E>[] = []
    for await (const result of this.source()) {
      results.push(result)
    }
    return results
  }

  async collect(): Promise<T[]> {
    const successes: T[] = []
    const errors: E[] = []

    for await (const result of this.source()) {
      if (result.type === 'success') {
        successes.push(result.value)
      } else {
        errors.push(result.error)
      }
    }

    if (errors.length) {
      throw new AggregateError(errors)
    }
    return successes
  }

  successes(): AsyncIterable<T> {
    const source = this.source
    return {
      async *[Symbol.asyncIterator]() {
        for await (const result of source()) {
          if (result.type === 'success') {
            yield result.value
          }
        }
      },
    }
  }

  errors(): AsyncIterable<E> {
    const source = this.source
    return {
      async *[Symbol.asyncIterator]() {
        for await (const result of source()) {
          if (result.type === 'error') {
            yield result.error
          }
        }
      },
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<Result<T, E>> {
    return this.source()[Symbol.asyncIterator]()
  }

  private transform<U, E2>(
    handler: (
      result: Result<T, E>,
    ) => Promisable<Result<U, E2>[]>,
  ): Stream<U, E2> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<U, E2>(
      async function* () {
        for await (const result of source()) {
          const outputs = await handler(result)
          for (const output of outputs) {
            yield output
          }
        }
      },
      concurrency,
      bufferSize,
    )
  }

  private concurrentMap<U, E2>(
    fn: (value: T, arrivalIndex: number) => Promisable<U>,
    concurrency: number,
    bufferSize: number,
  ): AsyncGenerator<Result<U, E2>> {
    let arrivalIndex = 0
    return this.concurrentTransform<U, E2>(
      async (result) => {
        if (result.type !== 'success') {
          return [result as unknown as Result<U, E2>]
        }
        try {
          const value = await fn(result.value, arrivalIndex++)
          return [{ type: 'success', value } as Result<U, E2>]
        } catch (error) {
          return [{ type: 'error', error: error as E2 } as Result<U, E2>]
        }
      },
      concurrency,
      bufferSize,
    )
  }

  private concurrentTransform<U, E2>(
    handler: (
      result: Result<T, E>,
    ) => Promise<Result<U, E2>[]>,
    concurrency: number,
    bufferSize: number,
  ): AsyncGenerator<Result<U, E2>> {
    const source = this.source
    const maxConcurrency = Number.isFinite(concurrency)
      ? Math.max(1, concurrency)
      : Infinity
    const maxBufferSize = Number.isFinite(bufferSize)
      ? Math.max(1, bufferSize)
      : Infinity

    return (async function* () {
      const queue: Result<U, E2>[] = []
      let head = 0
      let inFlight = 0
      let done = false
      const waiters: Array<() => void> = []

      const wake = () => {
        while (waiters.length > 0) {
          const resolve = waiters.shift()
          if (resolve) resolve()
        }
      }

      const sleep = () =>
        new Promise<void>((resolve) => {
          waiters.push(resolve)
        })

      const push = (result: Result<U, E2>) => {
        queue.push(result)
        wake()
      }

      const size = () => queue.length - head
      ;(async () => {
        try {
          for await (const result of source()) {
            while (inFlight >= maxConcurrency || size() >= maxBufferSize) {
              await sleep()
            }

            inFlight += 1
            Promise.resolve()
              .then(async () => {
                const outputs = await handler(result)
                for (const output of outputs) {
                  push(output)
                }
              })
              .finally(() => {
                inFlight -= 1
                wake()
              })
          }
        } catch (error) {
          push({ type: 'error', error: error as E2 } as Result<U, E2>)
        }
        done = true
        wake()
      })()

      while (true) {
        while (size() === 0 && (!done || inFlight > 0)) {
          await sleep()
        }

        if (size() === 0) {
          break
        }

        const next = queue[head]
        queue[head] = undefined as unknown as Result<U, E2>
        head += 1
        if (head > 256 && head * 2 >= queue.length) {
          queue.splice(0, head)
          head = 0
        }
        if (next) {
          yield next
          wake()
        }
      }
    })()
  }

  private sequentialMap<U, E2>(
    fn: (value: T, arrivalIndex: number) => Promisable<U>,
  ): AsyncGenerator<Result<U, E2>> {
    const source = this.source
    return (async function* () {
      let arrivalIndex = 0
      for await (const result of source()) {
        if (result.type === 'success') {
          try {
            const mappedValue = fn(result.value, arrivalIndex++)
            if (isPromise(mappedValue)) {
              yield {
                type: 'success',
                value: await mappedValue,
              } as Result<U, E2>
            } else {
              yield {
                type: 'success',
                value: mappedValue,
              } as Result<U, E2>
            }
          } catch (error) {
            yield { type: 'error', error: error as E2 } as Result<U, E2>
          }
        } else {
          yield result as unknown as Result<U, E2>
        }
      }
    })()
  }

  private concurrentTryMap<U, F>(
    fn: (value: T, arrivalIndex: number) => Promisable<U>,
    errFn: (error: unknown, value: T, arrivalIndex: number) => Promisable<F>,
    concurrency: number,
    bufferSize: number,
  ): AsyncGenerator<Result<U, E | F>> {
    let arrivalIndex = 0
    return this.concurrentTransform(
      async (result) => {
        const currentIndex = arrivalIndex++
        if (result.type !== 'success') {
          return [result as unknown as Result<U, E | F>]
        }
        try {
          const value = await fn(result.value, currentIndex)
          return [{ type: 'success', value } as Result<U, E | F>]
        } catch (error) {
          const mappedError = await errFn(error, result.value, currentIndex)
          return [{ type: 'error', error: mappedError } as Result<U, E | F>]
        }
      },
      concurrency,
      bufferSize,
    )
  }

  private concurrentFlatMap<U>(
    fn: (
      value: T,
      arrivalIndex: number,
    ) => Promisable<AsyncIterable<U> | Iterable<U>>,
    concurrency: number,
    bufferSize: number,
  ): AsyncGenerator<Result<U, E>> {
    let arrivalIndex = 0
    return this.concurrentTransform(
      async (result) => {
        if (result.type !== 'success') {
          return [result as unknown as Result<U, E>]
        }
        try {
          const mapped = await fn(result.value, arrivalIndex++)
          const outputs: Result<U, E>[] = []
          for await (const value of toAsyncIterable<U>(mapped)) {
            outputs.push({ type: 'success', value } as Result<U, E>)
          }
          return outputs
        } catch (error) {
          return [{ type: 'error', error: error as E } as Result<U, E>]
        }
      },
      concurrency,
      bufferSize,
    )
  }

  map<U, E2 = E>(
    fn: (value: T, arrivalIndex: number) => Promisable<U>,
  ): Stream<U, E | E2> {
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    if (Number.isFinite(concurrency) && concurrency > 1) {
      return new _StreamImpl<U, E | E2>(
        () => this.concurrentMap<U, E2>(fn, concurrency, bufferSize),
        concurrency,
        bufferSize,
      )
    }
    return new _StreamImpl<U, E | E2>(
      () => this.sequentialMap<U, E2>(fn),
      concurrency,
      bufferSize,
    )
  }

  tryMap<U, F>(
    fn: (value: T, arrivalIndex: number) => Promisable<U>,
    errFn: (error: unknown, value: T, arrivalIndex: number) => Promisable<F>,
  ): Stream<U, E | F> {
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    if (Number.isFinite(concurrency) && concurrency > 1) {
      return new _StreamImpl<U, E | F>(
        () => this.concurrentTryMap(fn, errFn, concurrency, bufferSize),
        concurrency,
        bufferSize,
      )
    }
    let successIndex = 0
    return this.transform(async (result) => {
      if (result.type === 'success') {
        const currentIndex = successIndex++
        try {
          const value = await fn(result.value, currentIndex)
          return [{ type: 'success', value } as Result<U, E | F>]
        } catch (error) {
          const mappedError = await errFn(error, result.value, currentIndex)
          return [{ type: 'error', error: mappedError } as Result<U, E | F>]
        }
      }
      return [result as unknown as Result<U, E | F>]
    })
  }

  flatMap<U>(
    fn: (
      value: T,
      arrivalIndex: number,
    ) => Promisable<AsyncIterable<U> | Iterable<U>>,
  ): Stream<U, E> {
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    if (Number.isFinite(concurrency) && concurrency > 1) {
      return new _StreamImpl<U, E>(
        () => this.concurrentFlatMap(fn, concurrency, bufferSize),
        concurrency,
        bufferSize,
      )
    }
    let successIndex = 0
    return this.transform(async (result) => {
      if (result.type !== 'success') {
        return [result as unknown as Result<U, E>]
      }

      try {
        const mapped = await fn(result.value, successIndex++)
        const outputs: Result<U, E>[] = []
        for await (const value of toAsyncIterable<U>(mapped)) {
          outputs.push({ type: 'success', value } as Result<U, E>)
        }
        return outputs
      } catch (error) {
        return [{ type: 'error', error: error as E } as Result<U, E>]
      }
    })
  }

  filter(
    fn: (value: T, arrivalIndex: number) => Promisable<boolean>,
  ): Stream<T, E> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<T, E>(
      async function* () {
        let arrivalIndex = 0
        for await (const result of source()) {
          if (result.type === 'success') {
            try {
              const shouldInclude = fn(result.value, arrivalIndex++)
              if (isPromise(shouldInclude)) {
                if (await shouldInclude) {
                  yield result
                }
              } else if (shouldInclude) {
                yield result
              }
            } catch (error) {
              yield { type: 'error', error: error as E } as Result<
                T,
                E
              >
            }
          } else {
            yield result
          }
        }
      },
      concurrency,
      bufferSize,
    )
  }

  tap(fn: (value: T, arrivalIndex: number) => Promisable<void>): Stream<T, E> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<T, E>(
      async function* () {
        let count = 0
        let arrivalIndex = 0
        for await (const result of source()) {
          if (result.type === 'success') {
            try {
              count += 1
              const ret = fn(result.value, arrivalIndex++)
              if (isPromise(ret)) await ret
              yield result
            } catch (error) {
              yield { type: 'error', error: error as E } as Result<
                T,
                E
              >
            }
          } else {
            yield result
          }
        }
      },
      concurrency,
      bufferSize,
    )
  }

  tapErr(
    fn: (error: E, arrivalIndex: number) => Promisable<void>,
  ): Stream<T, E> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<T, E>(
      async function* () {
        let count = 0
        let arrivalIndex = 0
        for await (const result of source()) {
          if (result.type === 'error') {
            try {
              count += 1
              const ret = fn(result.error, arrivalIndex++)
              if (isPromise(ret)) await ret
              yield result
            } catch (error) {
              yield { type: 'error', error: error as E } as Result<
                T,
                E
              >
            }
          } else {
            yield result
          }
        }
      },
      concurrency,
      bufferSize,
    )
  }

  take(n: number): Stream<T, E> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<T, E>(
      async function* () {
        if (n <= 0) return
        const gen = source()
        try {
          let count = 0
          for await (const result of gen) {
            if (result.type === 'success') {
              count += 1
            }
            yield result
            if (count >= n) break
          }
        } finally {
          await gen.return(undefined)
        }
      },
      concurrency,
      bufferSize,
    )
  }

  takeWhile(
    fn: (value: T, arrivalIndex: number) => Promisable<boolean>,
  ): Stream<T, E> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<T, E>(
      async function* () {
        let arrivalIndex = 0
        const gen = source()
        try {
          for await (const result of gen) {
            if (result.type === 'success') {
              try {
                const shouldContinue = fn(result.value, arrivalIndex++)
                if (
                  isPromise(shouldContinue)
                    ? !(await shouldContinue)
                    : !shouldContinue
                ) {
                  break
                }
                yield result
              } catch (error) {
                yield { type: 'error', error: error as E } as Result<T, E>
                break
              }
            } else {
              yield result
            }
          }
        } finally {
          await gen.return(undefined)
        }
      },
      concurrency,
      bufferSize,
    )
  }

  async partition(): Promise<{ successes: T[]; errors: E[] }> {
    const successes: T[] = []
    const errors: E[] = []
    for await (const result of this.source()) {
      if (result.type === 'success') {
        successes.push(result.value)
      } else {
        errors.push(result.error)
      }
    }
    return { successes, errors }
  }

  async fold<U>(
    fn: (acc: U, value: T, arrivalIndex: number) => Promisable<U>,
    initialValue: U,
  ): Promise<U> {
    let accumulator = initialValue
    const errors: E[] = []
    let arrivalIndex = 0
    for await (const result of this.source()) {
      if (result.type === 'success') {
        accumulator = await fn(accumulator, result.value, arrivalIndex++)
      } else {
        errors.push(result.error)
      }
    }
    if (errors.length) {
      throw new AggregateError(errors)
    }
    return accumulator
  }

  scan<U>(
    fn: (acc: U, value: T, arrivalIndex: number) => Promisable<U>,
    initialValue: U,
  ): Stream<U, E> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<U, E>(
      async function* () {
        let accumulator = initialValue
        let arrivalIndex = 0
        for await (const result of source()) {
          if (result.type === 'success') {
            try {
              accumulator = await fn(accumulator, result.value, arrivalIndex++)
              yield { type: 'success', value: accumulator } as Result<U, E>
            } catch (error) {
              yield { type: 'error', error: error as E } as Result<U, E>
            }
          } else {
            yield result as unknown as Result<U, E>
          }
        }
      },
      concurrency,
      bufferSize,
    )
  }

  scanErr<F>(
    fn: (acc: F, error: E, arrivalIndex: number) => Promisable<F>,
    initialValue: F,
  ): Stream<T, F> {
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<T, F>(
      async function* () {
        let accumulator = initialValue
        let arrivalIndex = 0
        for await (const result of source()) {
          if (result.type === 'error') {
            try {
              accumulator = await fn(accumulator, result.error, arrivalIndex++)
              yield { type: 'error', error: accumulator } as Result<T, F>
            } catch (error) {
              yield { type: 'error', error: error as F } as Result<T, F>
            }
          } else {
            yield result as unknown as Result<T, F>
          }
        }
      },
      concurrency,
      bufferSize,
    )
  }

  chunks(size: number): Stream<T[], E> {
    if (size <= 0) {
      throw new Error('chunks size must be positive')
    }
    const source = this.source
    const concurrency = this.concurrency
    const bufferSize = this.bufferSize
    return new _StreamImpl<T[], E>(
      async function* () {
        let chunk: T[] = []
        for await (const result of source()) {
          if (result.type === 'success') {
            chunk.push(result.value)
            if (chunk.length === size) {
              yield { type: 'success', value: chunk } as Result<T[], E>
              chunk = []
            }
          } else {
            if (chunk.length > 0) {
              yield { type: 'success', value: chunk } as Result<T[], E>
              chunk = []
            }
            yield result as Result<T[], E>
          }
        }
        if (chunk.length > 0) {
          yield { type: 'success', value: chunk } as Result<T[], E>
        }
      },
      concurrency,
      bufferSize,
    )
  }

  mapErr<F>(
    fn: (error: E, arrivalIndex: number) => Promisable<F>,
  ): Stream<T, F> {
    let errorIndex = 0
    return this.transform(async (result) => {
      if (result.type === 'error') {
        try {
          const mappedError = await fn(result.error, errorIndex++)
          return [
            { type: 'error', error: mappedError } as Result<T, F>,
          ]
        } catch (error) {
          return [
            { type: 'error', error: error as F } as Result<T, F>,
          ]
        }
      }
      return [result as unknown as Result<T, F>]
    })
  }

  filterErr(
    fn: (error: E, arrivalIndex: number) => Promisable<boolean>,
  ): Stream<T, E> {
    let errorIndex = 0
    return this.transform(async (result) => {
      if (result.type === 'error') {
        try {
          const shouldInclude = await fn(result.error, errorIndex++)
          if (shouldInclude) {
            return [result]
          }
          return []
        } catch (error) {
          return [{ type: 'error', error: error as E } as Result<T, E>]
        }
      }
      return [result]
    })
  }

  async foldErr<F>(
    fn: (acc: F, error: E, arrivalIndex: number) => Promisable<F>,
    initialValue: F,
  ): Promise<F> {
    let accumulator = initialValue
    let arrivalIndex = 0
    for await (const result of this.source()) {
      if (result.type === 'error') {
        accumulator = await fn(accumulator, result.error, arrivalIndex++)
      }
    }
    return accumulator
  }

  recoverWhen<E2 extends E, U = T>(
    guard: (error: E) => error is E2,
    fn: (error: E2, arrivalIndex: number) => Promisable<U>,
  ): Stream<T | U, Exclude<E, E2>> {
    let arrivalIndex = 0
    return this.transform(async (result) => {
      if (result.type === 'error' && guard(result.error)) {
        try {
          const recoveredValue = await fn(result.error, arrivalIndex++)
          return [
            {
              type: 'success',
              value: recoveredValue,
            } as Result<T | U, Exclude<E, E2>>,
          ]
        } catch (error) {
          return [
            {
              type: 'error',
              error: error as Exclude<E, E2>,
            } as Result<T | U, Exclude<E, E2>>,
          ]
        }
      }
      return [result as unknown as Result<T | U, Exclude<E, E2>>]
    })
  }

  recover<U>(
    fn: (error: E, arrivalIndex: number) => Promisable<U>,
  ): Stream<T | U, never> {
    let errorIndex = 0
    return this.transform(async (result) => {
      if (result.type === 'error') {
        try {
          const recoveredValue = await fn(result.error, errorIndex++)
          return [
            {
              type: 'success',
              value: recoveredValue,
            } as Result<T | U, never>,
          ]
        } catch (error) {
          return [
            { type: 'error', error: error as never } as Result<
              T | U,
              never
            >,
          ]
        }
      }
      return [result as unknown as Result<T | U, never>]
    })
  }

  throwOn<E2 extends E>(
    guard: (error: E) => error is E2,
  ): Stream<T, Exclude<E, E2>> {
    const source = this.source
    return new _StreamImpl<T, Exclude<E, E2>>(
      async function* () {
        for await (const result of source()) {
          if (result.type === 'error' && guard(result.error)) {
            // throwOn intentionally terminates iteration instead of collecting.
            throw result.error
          }
          yield result as unknown as Result<T, Exclude<E, E2>>
        }
      },
      this.concurrency,
      this.bufferSize,
    )
  }

  zip<U, F>(other: Stream<U, F>): Stream<[T, U], E | F> {
    const left = this.source
    const right = (other as _StreamImpl<U, F>).source

    return new _StreamImpl<[T, U], E | F>(
      async function* () {
        const leftIter = left()
        const rightIter = right()

        try {
          while (true) {
            const [leftRes, rightRes] = await Promise.all([
              leftIter.next(),
              rightIter.next(),
            ])

            if (leftRes.done || rightRes.done) {
              break
            }

            const lVal = leftRes.value as Result<T, E>
            const rVal = rightRes.value as Result<U, F>

            if (lVal.type === 'error' || rVal.type === 'error') {
              if (lVal.type === 'error') {
                yield { type: 'error', error: lVal.error } as Result<
                  [T, U],
                  E | F
                >
              }
              if (rVal.type === 'error') {
                yield { type: 'error', error: rVal.error } as Result<
                  [T, U],
                  E | F
                >
              }
              continue
            }

            yield {
              type: 'success',
              value: [lVal.value, rVal.value],
            } as Result<[T, U], E | F>
          }
        } finally {
          await Promise.all([
            leftIter.return?.(undefined),
            rightIter.return?.(undefined),
          ])
        }
      },
      this.concurrency,
      this.bufferSize,
    )
  }

  merge(other: Stream<T, E>): Stream<T, E> {
    const left = this.source
    const right = (other as _StreamImpl<T, E>).source

    return new _StreamImpl<T, E>(
      async function* () {
        const pullNext = async (iter: AsyncGenerator<Result<T, E>>) => {
          try {
            const result = await iter.next()
            return { iter, result }
          } catch (error) {
            return { iter, error: error as E }
          }
        }

        const pending = new Map<
          AsyncGenerator<Result<T, E>>,
          Promise<
            {
              iter: AsyncGenerator<Result<T, E>>
              result?: IteratorResult<Result<T, E>>
              error?: E
            }
          >
        >()

        const leftIter = left()
        const rightIter = right()

        pending.set(leftIter, pullNext(leftIter))
        pending.set(rightIter, pullNext(rightIter))

        while (pending.size > 0) {
          const { iter, result, error } = await Promise.race(pending.values())

          if (error) {
            yield { type: 'error', error } as Result<T, E>
            pending.delete(iter)
          } else if (result?.done) {
            pending.delete(iter)
          } else {
            yield result!.value
            pending.set(iter, pullNext(iter))
          }
        }
      },
      this.concurrency,
      this.bufferSize,
    )
  }

  splitN(n: 0 | 1, bufferSize: number): [Stream<T, E | PumpError>]
  splitN(
    n: 2,
    bufferSize: number,
  ): [Stream<T, E | PumpError>, Stream<T, E | PumpError>]
  splitN(
    n: 3,
    bufferSize: number,
  ): [
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
  ]
  splitN(
    n: 4,
    bufferSize: number,
  ): [
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
    Stream<T, E | PumpError>,
  ]
  splitN(n: number, bufferSize: number): Stream<T, E | PumpError>[]
  splitN(n: number, bufferSize: number): Stream<T, E | PumpError>[] {
    n = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1

    bufferSize = Number.isFinite(bufferSize)
      ? Math.max(1, bufferSize)
      : Infinity

    const sources = Array.from(
      { length: n },
      () => new _ChannelSource<T, E | PumpError>({ bufferSize }), //
    )

    const pump = async () => {
      try {
        for await (const result of this.source()) { //
          await Promise.all(sources.map((s) => s.waitForCapacity())) //

          for (const s of sources) {
            if (result.type === 'success') {
              s.send(result.value)
            } else {
              s.fail(result.error)
            }
          }
        }
      } catch (error) {
        const pumpError = new PumpError(
          error instanceof Error ? error.message : String(error),
          error,
        )
        for (const s of sources) {
          s.fail(pumpError)
        }
      } finally {
        for (const s of sources) {
          s.close()
        }
      }
    }

    pump()

    return sources.map(
      (s) =>
        new _StreamImpl(() => s.generator(), this.concurrency, this.bufferSize),
    )
  }

  splitBy<K extends string | number | symbol>(
    keys: readonly K[],
    cb: (value: T, arrivalIndex: number) => Promisable<K>,
    bufferSize: number,
  ): Record<K, Stream<T, E | MissingKeyError | PumpError | NoKeysError>> {
    if (keys.length === 0) {
      throw new NoKeysError()
    }

    const channels = new Map<
      K,
      _ChannelSource<T, E | MissingKeyError | PumpError | NoKeysError>
    >()
    const resultRecord = {} as Record<
      K,
      Stream<T, E | MissingKeyError | PumpError | NoKeysError>
    >

    const normalizedBufferSize = Number.isFinite(bufferSize)
      ? Math.max(1, bufferSize)
      : Infinity

    for (const key of keys) {
      const source = new _ChannelSource<
        T,
        E | MissingKeyError | PumpError | NoKeysError
      >({ bufferSize: normalizedBufferSize }) //
      channels.set(key, source)
      resultRecord[key] = new _StreamImpl(
        () => source.generator(),
        this.concurrency,
        this.bufferSize,
      )
    }

    const pump = async () => {
      let arrivalIndex = 0
      try {
        for await (const result of this.source()) {
          if (result.type === 'success') {
            try {
              const key = await cb(result.value, arrivalIndex++)
              const targetChannel = channels.get(key)

              if (!targetChannel) {
                throw new MissingKeyError(key)
              }

              await targetChannel.waitForCapacity()
              targetChannel.send(result.value)
            } catch (err) {
              const allChannels = Array.from(channels.values())
              await Promise.all(allChannels.map((c) => c.waitForCapacity()))
              for (const channel of allChannels) {
                channel.fail(err as E | MissingKeyError)
              }
            }
          } else {
            const allChannels = Array.from(channels.values())
            await Promise.all(allChannels.map((c) => c.waitForCapacity()))
            for (const channel of allChannels) {
              channel.fail(result.error)
            }
          }
        }
      } catch (error) {
        const pumpError = new PumpError(
          error instanceof Error ? error.message : String(error),
          error,
        )
        for (const channel of channels.values()) {
          channel.fail(pumpError)
        }
      } finally {
        for (const channel of channels.values()) {
          channel.close()
        }
      }
    }

    pump()

    return resultRecord
  }

  flatten<U>(this: Stream<Iterable<U> | AsyncIterable<U>, E>): Stream<U, E> {
    return this.flatMap((value) => value as Iterable<U> | AsyncIterable<U>)
  }
}

const isPromise = <T>(value: Promisable<T>): value is Promise<T> =>
  value != null && typeof (value as Promise<T>).then === 'function'

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> => {
  if (value === null || value === undefined) {
    return false
  }
  return Symbol.asyncIterator in Object(value)
}

const isIterable = <T>(value: unknown): value is Iterable<T> => {
  if (value === null || value === undefined) {
    return false
  }
  return Symbol.iterator in Object(value)
}

const toAsyncIterable = <T>(
  iterable: AsyncIterable<T> | Iterable<T>,
): AsyncIterable<T> => {
  if (isAsyncIterable<T>(iterable)) {
    return iterable
  }
  if (isIterable<T>(iterable)) {
    return (async function* () {
      yield* iterable
    })()
  }
  throw new TypeError('flatMap function must return an iterable')
}
