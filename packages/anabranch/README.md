# Anabranch

Async stream processing where errors are collected alongside values instead of
stopping the pipeline.

The name: an anabranch is a river branch that diverges from the main channel and
may rejoin it later.

## The problem

When processing async data in a loop, a single failure kills everything:

```ts
for await (const item of source) {
  const result = await process(item) // one throw stops the whole loop
}
```

Wrapping each item in try/catch works but produces messy, hard-to-compose code.

## The solution

Anabranch wraps each item as either `{ type: "success", value }` or
`{ type: "error", error }`. Operations like `map`, `filter`, and `flatMap` work
only on successes; errors pass through until you decide what to do with them.

```ts
import { Source } from 'anabranch'

const stream = Source.from<string, Error>(async function* () {
  yield 'https://example.com/1'
  yield 'https://example.com/2'
  yield 'https://example.com/3'
})

const { successes, errors } = await stream
  .withConcurrency(4)
  .map(async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })
  .filter((data) => data.active)
  .partition()
```

## Installation

**Deno (JSR)**

```ts
import { Source } from 'jsr:@anabranch/anabranch'
```

**Node / Bun (npm)**

```sh
npm install anabranch
```

## Core concepts

### Creating a stream

Use `Source` with an async generator, or `Source.from()` for an existing
`AsyncIterable`:

```ts
const stream = Source.from<number, Error>(async function* () {
  yield 1
  yield 2
  yield 3
})

const stream2 = Source.from<number, Error>(someAsyncIterable)
```

For push-based streams where external producers send values as they arrive, use
`Channel`:

```ts
import { Channel } from 'anabranch'

const channel = Channel.create<PriceUpdate, Error>()
  .withBufferSize(100)
  .withOnDrop((update) => console.log('dropped:', update))

// External producer sends values:
channel.send({ symbol: 'AAPL', price: 150 })
channel.send({ symbol: 'GOOGL', price: 2750 })

// Consumer reads from the channel like any stream:
for await (const result of channel) {
  // result is { type: "success", value } or { type: "error", error }
}

channel.close() // signals no more items
```

`Channel.fail` bypasses the buffer and injects errors directly into the stream:

```ts
channel.send({ symbol: 'AAPL', price: 150 })
channel.fail(new Error('feed disconnected')) // goes straight to consumer
channel.send({ symbol: 'GOOGL', price: 2750 }) // still processes
```

### Single async operations with Task

For single async operations with retries, timeouts, and signal handling, use
`Task`:

```ts
import { Task } from 'anabranch'

const task = Task.of(async () => {
  const res = await fetch('https://example.com')
  if (!res.ok) throw new Error('Bad response')
  return res.json()
})

const result = await task
  .retry({ attempts: 3, delay: (attempt) => 200 * 2 ** attempt })
  .timeout(5_000)
  .result()
```

`Task` composes with `flatMap` for chaining, and `Task.allSettled` / `Task.race`
for concurrency:

```ts
const combined = Task.of(() => Promise.resolve(2))
  .flatMap((value) => Task.of(() => Promise.resolve(value * 3)))
  .timeout(500)

const results = await Task.allSettled([
  Task.of(() => fetch('/api/users')),
  Task.of(() => fetch('/api/posts')),
]).run()

const fastest = await Task.race([
  Task.of(() => fetch('/fast')),
  Task.of(() => fetch('/slow')),
]).run()
```

Abort signals thread through the task lifecycle:

```ts
const controller = new AbortController()
const task = Task.of(async (signal) => {
  const res = await fetch('/long-request', { signal })
  return res.json()
}).withSignal(controller.signal)

controller.abort()
```

For resource lifecycle management, use `Task.acquireRelease` to acquire a
resource, run a composed task, and release it regardless of success or failure:

```ts
const task = Task.acquireRelease({
  acquire: (signal) => db.connect(signal),
  release: (conn) => conn.close(),
  use: (conn) =>
    Task.of(() => query(conn))
      .retry({ attempts: 3 })
      .timeout(5_000),
})

const result = await task.result()
```

`Task` error types are not runtime-checked; the `E` type is a hint for how you
expect the task to fail.

### Transforming values

`map`, `flatMap`, and `filter` work on successes. If the callback throws, the
item becomes an error result:

```ts
stream
  .map((n) => n * 2)
  .flatMap((n) => [n, n + 1])
  .filter((n) => n % 2 === 0)
```

Operations are applied lazily without creating intermediate collections. Items
flow through the pipeline as they are processed, so you can chain as many
operations as you like without extra memory cost.

The stream itself is an `AsyncIterable`, so you can iterate directly:

```ts
for await (const result of stream) {
  if (result.type === 'success') {
    console.log(result.value)
  } else {
    console.error(result.error)
  }
}
```

### Handling errors

Each success-side operation has an error-side counterpart:

```ts
stream
  .mapErr((e) => new WrappedError(e)) // transform errors
  .filterErr((e) => e.retryable) // drop errors that don't match
  .recoverWhen( // convert matching errors back to successes
    (e): e is NetworkError => e instanceof NetworkError,
    (e) => fallbackValue,
  )
  .recover((e) => defaultValue) // recover all remaining errors
```

Use `throwOn` to throw specific errors immediately, terminating iteration:

```ts
stream.throwOn((e): e is FatalError => e instanceof FatalError)
```

### Accumulating state

`scan` is like `fold` but emits the running accumulator after each value:

```ts
const payments = Source.from<Payment, Error>(async function* () {
  /* stream of payment events */
})

payments
  .scan((total, payment) => total + payment.amount, 0)
  .tap((total) => updateDashboard(total))
```

`chunks` groups consecutive successes into fixed-size arrays:

```ts
const records = Source.from<Record, Error>(async function* () {
  /* stream of database records */
})

// Batch records for bulk insert
records
  .chunks(100)
  .map((batch) => db.insertMany(batch))
```

### Concurrency and backpressure

```ts
Source.from(generator)
  .withConcurrency(8) // up to 8 concurrent map/flatMap operations
  .withBufferSize(16) // pause the source if results pile up
```

### Collecting results

| Method        | Returns                           | Throws?                             |
| ------------- | --------------------------------- | ----------------------------------- |
| `collect()`   | `T[]` (successes only)            | Yes, `AggregateError` if any errors |
| `partition()` | `{ successes: T[], errors: E[] }` | No                                  |
| `toArray()`   | `Result<T, E>[]` (tagged)         | No                                  |
| `successes()` | `AsyncIterable<T>`                | No                                  |
| `errors()`    | `AsyncIterable<E>`                | No                                  |

### Other utilities

- `tap(fn)` / `tapErr(fn)`: run a side effect without changing the stream
- `take(n)`: stop after `n` successful values
- `takeWhile(fn)`: stop when the predicate returns false
- `fold(fn, init)` / `foldErr(fn, init)`: reduce the stream to a single value

## API reference

See [generated documentation](https://frodi-karlsson.github.io/anabranch) for
full API details.
