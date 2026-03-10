import { assertEquals, assertNotStrictEquals, assertRejects } from '@std/assert'
import { WebClient } from './client.ts'
import type { HttpError, RequestOptions } from './types.ts'

type FetchFn = typeof globalThis.fetch

function makeResponse(
  status: number,
  body: unknown = null,
  headers: Record<string, string> = {},
): Response {
  const noBodyStatus = status >= 100 && status < 200 || status === 204 ||
    status === 304
  const hasBody = body !== null && !noBodyStatus
  const content = hasBody
    ? (typeof body === 'string' ? body : JSON.stringify(body))
    : undefined
  const responseHeaders = hasBody
    ? { 'content-type': 'application/json', ...headers }
    : headers
  return new Response(content, {
    status,
    headers: responseHeaders,
  })
}

Deno.test('WebClient.get - should make GET request', async () => {
  const fetch: FetchFn = () => Promise.resolve(makeResponse(200, { id: 1 }))
  const client = WebClient.create().withFetch(fetch)
  const result = await client.get('https://example.com/users/1').run()

  assertEquals(result.status, 200)
  assertEquals(result.data, { id: 1 })
})

Deno.test('WebClient.post - should make POST request with body', async () => {
  let receivedBody: unknown
  const fetch: FetchFn = (_input, init) => {
    receivedBody = (init as RequestInit | undefined)?.body
    return Promise.resolve(makeResponse(201, { id: 1 }))
  }
  const client = WebClient.create().withFetch(fetch)
  const result = await client.post('https://example.com/users', {
    name: 'test',
  }).run()

  assertEquals(result.status, 201)
  assertEquals(JSON.parse(receivedBody as string), { name: 'test' })
})

Deno.test('WebClient.delete - should make DELETE request', async () => {
  const fetch: FetchFn = () => Promise.resolve(makeResponse(204, null))
  const client = WebClient.create().withFetch(fetch)
  const result = await client.delete('https://example.com/users/1').run()

  assertEquals(result.status, 204)
})

Deno.test('WebClient.put - should make PUT request', async () => {
  let receivedMethod = ''
  const fetch: FetchFn = (_input, init) => {
    receivedMethod = (init as RequestInit | undefined)?.method ?? 'GET'
    return Promise.resolve(makeResponse(200, { success: true }))
  }
  const client = WebClient.create().withFetch(fetch)
  await client.put('https://example.com/users/1', { name: 'updated' }).run()

  assertEquals(receivedMethod, 'PUT')
})

Deno.test('WebClient.patch - should make PATCH request', async () => {
  let receivedMethod = ''
  const fetch: FetchFn = (_input, init) => {
    receivedMethod = (init as RequestInit | undefined)?.method ?? 'GET'
    return Promise.resolve(makeResponse(200, { success: true }))
  }
  const client = WebClient.create().withFetch(fetch)
  await client.patch('https://example.com/users/1', { name: 'updated' }).run()

  assertEquals(receivedMethod, 'PATCH')
})

Deno.test('WebClient.request - should include headers', async () => {
  let receivedHeaders: Record<string, string> = {}
  const fetch: FetchFn = (_input, init) => {
    receivedHeaders = (init as RequestInit | undefined)?.headers as Record<
      string,
      string
    >
    return Promise.resolve(makeResponse(200, { ok: true }))
  }
  const client = WebClient.create()
    .withFetch(fetch)
    .withHeaders({ Authorization: 'Bearer token' })
  const opts: RequestOptions = { headers: { 'X-Custom': 'value' } }
  await client.request('https://example.com/test', 'GET', opts).run()

  assertEquals(receivedHeaders['Authorization'], 'Bearer token')
  assertEquals(receivedHeaders['X-Custom'], 'value')
})

Deno.test('WebClient.request - should apply baseUrl', async () => {
  let receivedUrl = ''
  const fetch: FetchFn = (url) => {
    receivedUrl = String(url)
    return Promise.resolve(makeResponse(200, { ok: true }))
  }
  const client = WebClient.create()
    .withFetch(fetch)
    .withBaseUrl('https://api.example.com')
  await client.get('/users/1').run()

  assertEquals(receivedUrl, 'https://api.example.com/users/1')
})

Deno.test('WebClient - should throw HttpError on 404', async () => {
  const fetch: FetchFn = () =>
    Promise.resolve(makeResponse(404, { error: 'Not found' }))
  const client = WebClient.create().withFetch(fetch)

  await assertRejects(
    () => client.get('https://example.com/missing').run(),
  )
})

Deno.test('WebClient - should set isRetryable for 429', async () => {
  const fetch: FetchFn = () =>
    Promise.resolve(
      makeResponse(429, { error: 'Too many requests' }, {
        'retry-after': '0.1',
      }),
    )
  const client = WebClient.create()
    .withFetch(fetch)
    .withRetry({ attempts: 2, delay: (n) => (n === 0 ? 10 : 0) })

  const result = await client.get('https://example.com/rate-limited').result()

  assertEquals(result.type, 'error')
  if (result.type === 'error') {
    const error = result.error as HttpError
    assertEquals(error.details.isRetryable, true)
    assertEquals(error.details.isRateLimited, true)
  }
})

Deno.test('WebClient - should retry on 503', async () => {
  let attempts = 0
  const fetch: FetchFn = () => {
    attempts++
    return attempts < 2
      ? Promise.resolve(makeResponse(503))
      : Promise.resolve(makeResponse(200, { success: true }))
  }
  const client = WebClient.create()
    .withFetch(fetch)
    .withRetry({ attempts: 3, delay: 0 })

  const result = await client.get('https://example.com/eventually-works').run()

  assertEquals(attempts, 2)
  assertEquals(result.status, 200)
})

Deno.test('WebClient - should capture Retry-After header in error', async () => {
  const fetch: FetchFn = () =>
    Promise.resolve(
      makeResponse(429, {}, { 'retry-after': '0.05' }),
    )
  const client = WebClient.create()
    .withFetch(fetch)
    .withRetry({ attempts: 1, delay: 0 })

  const result = await client.get('https://example.com/rate-limited').result()

  assertEquals(result.type, 'error')
  if (result.type === 'error') {
    const error = result.error as HttpError
    assertEquals(error.details.retryAfter, 0.05)
    assertEquals(error.details.isRateLimited, true)
  }
})

Deno.test('WebClient - should not retry on 404', async () => {
  let attempts = 0
  const fetch: FetchFn = () => {
    attempts++
    return Promise.resolve(makeResponse(404))
  }
  const client = WebClient.create()
    .withFetch(fetch)
    .withRetry({ attempts: 3, delay: 0 })

  await assertRejects(() => client.get('https://example.com/not-found').run())

  assertEquals(attempts, 1)
})

Deno.test('WebClient.request - should use custom when predicate', async () => {
  let attempts = 0
  const fetch: FetchFn = () => {
    attempts++
    return Promise.resolve(makeResponse(500))
  }
  const client = WebClient.create()
    .withFetch(fetch)
    .withRetry({
      attempts: 3,
      delay: 0,
      when: (error) => error.details.status === 500,
    })

  await assertRejects(() => client.get('https://example.com/error').run())

  assertEquals(attempts, 3)
})

Deno.test('WebClient - should parse JSON response', async () => {
  const fetch: FetchFn = () =>
    Promise.resolve(makeResponse(200, { data: 'test' }))
  const client = WebClient.create().withFetch(fetch)
  const result = await client.get('https://example.com/json').run()

  assertEquals(result.data, { data: 'test' })
})

Deno.test('WebClient - should parse text response', async () => {
  const fetch: FetchFn = () =>
    Promise.resolve(
      new Response('plain text', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    )
  const client = WebClient.create().withFetch(fetch)
  const result = await client.get('https://example.com/text').run()

  assertEquals(result.data, 'plain text')
})

Deno.test('WebClient - chaining methods should return new instances', () => {
  const base = WebClient.create()
  const withUrl = base.withBaseUrl('https://example.com')
  const withHeaders = base.withHeaders({ 'X-Test': '1' })
  const withTimeout = base.withTimeout(5_000)
  const withRetry = base.withRetry({ attempts: 1 })

  assertNotStrictEquals(base, withUrl)
  assertNotStrictEquals(base, withHeaders)
  assertNotStrictEquals(base, withTimeout)
  assertNotStrictEquals(base, withRetry)
})

Deno.test('WebClient.withHeaders - should merge with existing headers', async () => {
  let receivedHeaders: Record<string, string> = {}
  const fetch: FetchFn = (_input, init) => {
    receivedHeaders = (init as RequestInit | undefined)?.headers as Record<
      string,
      string
    >
    return Promise.resolve(makeResponse(200, { ok: true }))
  }
  const client = WebClient.create()
    .withFetch(fetch)
    .withHeaders({ 'X-First': 'a' })
    .withHeaders({ 'X-Second': 'b' })

  await client.get('https://example.com/test').run()

  assertEquals(receivedHeaders['X-First'], 'a')
  assertEquals(receivedHeaders['X-Second'], 'b')
})

Deno.test('WebClient.withRetry - should field-merge retry options', async () => {
  let attempts = 0
  const fetch: FetchFn = () => {
    attempts++
    return Promise.resolve(makeResponse(500))
  }
  // Start with attempts: 3, then override only attempts to 2
  const client = WebClient.create()
    .withFetch(fetch)
    .withRetry({ attempts: 3, delay: 0 })
    .withRetry({ attempts: 2 })

  await assertRejects(() => client.get('https://example.com/error').run())

  assertEquals(attempts, 2)
})
