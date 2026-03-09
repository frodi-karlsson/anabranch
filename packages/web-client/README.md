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

const client = new WebClient({
  baseUrl: 'https://api.example.com',
  headers: { Authorization: 'Bearer token' },
  timeout: 10_000,
})

const result = await client.get('/users/me').run()
console.log(result.data)

// Retry with exponential backoff
await client.post('/items', { body })
  .retry({ attempts: 3, delay: (i) => 1000 * 2 ** i })
  .run()
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
const client = new WebClient({
  baseUrl: 'https://api.example.com',
  headers: { 'X-Custom-Header': 'value' },
  timeout: 30_000,
  fetch: customFetch, // optional custom fetch implementation
  retry: {
    attempts: 3,
    delay: (attempt, error) => {
      // Rate-limit-aware delay: use Retry-After header if present
      if (error?.retryAfter) return error.retryAfter
      return 1000 * 2 ** attempt
    },
    when: (res) => res.status >= 500 || res.status === 429,
  },
})
```

### Making requests

```ts
// GET with query params
const result = await client.get('/users/123').run()
console.log(result.data)

// POST with body
const created = await client.post('/users', { name: 'Alice' }).run()

// PUT, PATCH, DELETE
await client.put('/users/123', { bio: 'New bio' })
await client.patch('/users/123', { name: 'Bob' })
await client.delete('/users/123')

// With custom options
const result = await client.request(
  '/endpoint',
  'POST',
  { headers: { 'Content-Type': 'application/json' } },
  { key: 'value' },
).run()
```

### Handling responses

```ts
const result = await client.get('/data').run()

if (result.ok) {
  console.log('Status:', result.status)
  console.log('Data:', result.data)
  console.log('Headers:', result.headers)
} else {
  console.log('HTTP Error:', result.status, result.reason)
}
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
  .flatMap((user) => client.get(`/users/${user.id}/posts`))
  .run()

// Timeout
const response = await client.get('/slow-endpoint')
  .timeout(5_000)
  .run()
```

### Customizing retry behavior

```ts
// Only retry on server errors
client.get('/api').retry({
  attempts: 3,
  when: (res) => res.status >= 500,
})

// Custom delay based on error
client.get('/api').retry({
  attempts: 5,
  delay: (attempt, error) => {
    if (error?.retryAfter) return error.retryAfter * 1000
    return 1000 * attempt
  },
})
```

## API reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/web-client)
for full API details.
