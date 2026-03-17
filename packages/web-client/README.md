# @anabranch/web-client

A modern HTTP client built on fetch with automatic retries, timeouts, and
rate-limit handling. Returns `Task` for composable error handling.

## The problem

Using `fetch` directly requires repetitive boilerplate for error handling,
retries, and timeouts:

```ts
try {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
} catch (e) {
  // retry logic, backoff, etc.
}
```

## The solution

WebClient wraps fetch in a `Task` that handles HTTP errors, retries, and
timeouts with a clean, composable API:

```ts
import { WebClient } from '@anabranch/web-client'

const client = WebClient.create()
  .withBaseUrl('https://api.example.com')
  .withHeaders({ Authorization: 'Bearer token' })
  .withTimeout(10_000)

const result = await client.get('/users/me').run()
console.log(result.data)

// Retry with exponential backoff is built in (3 attempts by default)
await client.post('/items', { body }).run()
```

## Installation

**Deno (JSR)**

```ts
import { WebClient } from 'jsr:@anabranch/web-client'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/web-client
```

## Usage

### Creating a client

```ts
const client = WebClient.create()
  .withBaseUrl('https://api.example.com')
  .withHeaders({ 'X-Custom-Header': 'value' })
  .withTimeout(30_000)
  .withRetry({
    attempts: 3,
    delay: (attempt, error) => {
      // Rate-limit-aware delay: use Retry-After header if present
      if (error?.details.retryAfter) return error.details.retryAfter * 1000
      return 1000 * 2 ** attempt
    },
    when: (error) => error.details.isRetryable,
  })
```

### Making requests

```ts
// GET
const result = await client.get('/users/123').run()
console.log(result.data)

// POST with body
const created = await client.post('/users', { name: 'Alice' }).run()

// PUT, PATCH, DELETE
await client.put('/users/123', { bio: 'New bio' }).run()
await client.patch('/users/123', { name: 'Bob' }).run()
await client.delete('/users/123').run()
```

### Using Task methods

```ts
// Transform success values
const data = await client.get('/api').map((r) => r.data).run()

// Recover from errors
const cached = await client.get('/api')
  .recover(() => fallbackData)
  .run()

// FlatMap for chaining
const userPosts = await client.get('/users/me')
  .flatMap((user) => client.get(`/users/${user.data.id}/posts`))
  .run()

// Timeout
const response = await client.get('/slow-endpoint')
  .timeout(5_000)
  .run()
```

## API reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/web-client)
for full API details.
