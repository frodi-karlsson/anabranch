# Anabranch

Async stream processing where errors are collected alongside values instead of
stopping the pipeline.

The name: an anabranch is a river branch that diverges from the main channel and
may rejoin it later.

## The problem

When processing async data in a loop, a single failure kills everything:

```ts
for await (const item of source) {
  const result = await process(item); // one throw stops the whole loop
}
```

Wrapping each item in try/catch works but produces messy, hard-to-compose code.

## The solution

Anabranch wraps each item as either `{ type: "success", value }` or
`{ type: "error", error }`. Operations like `map`, `filter`, and `flatMap` work
only on successes; errors pass through until you decide what to do with them.

```ts
import { Source } from "anabranch";

const stream = new Source<string, Error>(async function* () {
  yield "https://example.com/1";
  yield "https://example.com/2";
  yield "https://example.com/3";
});

const { successes, errors } = await stream
  .withConcurrency(4)
  .map(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .filter((data) => data.active)
  .partition();
```

## Installation

**Deno (JSR)**

```ts
import { Source } from "jsr:@anabranch/anabranch";
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
const stream = new Source<number, Error>(async function* () {
  yield 1;
  yield 2;
  yield 3;
});

const stream2 = Source.from<number, Error>(someAsyncIterable);
```

### Single async operations with Task

For single async operations with retries, timeouts, and signal handling, use
`Task`:

```ts
import { Task } from "anabranch";

const task = Task.of(async () => {
  const res = await fetch("https://example.com");
  if (!res.ok) throw new Error("Bad response");
  return res.json();
});

const result = await task
  .retry({ attempts: 3, delay: (attempt) => 200 * 2 ** attempt })
  .timeout(5_000)
  .result();
```

`Task` composes with `flatMap` for chaining, and `Task.allSettled` / `Task.race`
for concurrency:

```ts
const combined = Task.of(() => Promise.resolve(2))
  .flatMap((value) => Task.of(() => Promise.resolve(value * 3)))
  .timeout(500);

const results = await Task.allSettled([
  Task.of(() => fetch("/api/users")),
  Task.of(() => fetch("/api/posts")),
]).run();

const fastest = await Task.race([
  Task.of(() => fetch("/fast")),
  Task.of(() => fetch("/slow")),
]).run();
```

Abort signals thread through the task lifecycle:

```ts
const controller = new AbortController();
const task = Task.of(async (signal) => {
  const res = await fetch("/long-request", { signal });
  return res.json();
}).withSignal(controller.signal);

controller.abort();
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
  .filter((n) => n % 2 === 0);
```

Operations are applied lazily without creating intermediate collections. Items
flow through the pipeline as they are processed, so you can chain as many
operations as you like without extra memory cost.

The stream itself is an `AsyncIterable`, so you can iterate directly:

```ts
for await (const result of stream) {
  if (result.type === "success") {
    console.log(result.value);
  } else {
    console.error(result.error);
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
  .recover((e) => defaultValue); // recover all remaining errors
```

Use `throwOn` to throw specific errors immediately, terminating iteration:

```ts
stream.throwOn((e): e is FatalError => e instanceof FatalError);
```

### Concurrency and backpressure

```ts
new Source(generator)
  .withConcurrency(8) // up to 8 concurrent map/flatMap operations
  .withBufferSize(16); // pause the source if results pile up
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

## Alternatives

**p-map** is the most direct alternative for concurrent async processing. It
supports a concurrency limit and can collect all errors via
`stopOnError: false`, which throws an `AggregateError` at the end. What it lacks
is a pipeline model: you call `pMap` once over a flat list, so chaining
transforms or handling errors mid-stream requires nesting calls or manual
bookkeeping.

**neverthrow** wraps values in `Result<T, E>` and gives you type-safe error
handling with `map`, `andThen`, etc. It works well for discrete async operations
but has no built-in concurrency, streaming, or retries. Anabranch's `Task`
provides similar result-based error handling with the addition of retry/timeout
utilities and signal support. To process a list in parallel you still reach for
`Promise.all`, and there is no equivalent to `flatMap` over an ongoing async
source.

**RxJS** can do everything here via `mergeMap` with a concurrency argument and
`catchError` placed inside the inner observable. The ergonomics are different:
errors that escape the inner observable terminate the stream unless you
explicitly handle them at every step, which is easy to get wrong. RxJS is also
push-based and primarily designed for event streams, so the pull-based async
generator model feels like a detour.

**Effect** has a `Stream` module with typed errors, concurrency, and
sophisticated recovery. If you are already using Effect throughout your codebase
it is probably the right choice. As a standalone dependency for stream
processing it is a large commitment: a steep learning curve, a significant
bundle, and an unfamiliar execution model.
