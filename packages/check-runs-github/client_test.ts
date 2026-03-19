import { assertEquals } from '@std/assert'
import { GithubClient } from './client.ts'
import { CheckRunsApiError } from '@anabranch/check-runs'
import type { CheckRunsOptions } from '@anabranch/check-runs'

type FetchFn = typeof globalThis.fetch

function createMockFetch(
  responses: Array<{
    status: number
    body?: unknown
    headers?: Record<string, string>
  }>,
): FetchFn {
  let callIndex = 0
  return (_input: string | URL | Request, _init?: RequestInit) => {
    const response = responses[callIndex++] ?? responses[responses.length - 1]
    const headers = response.headers ?? {}
    const body = response.body
    const hasBody = body !== undefined && body !== null
    const responseHeaders = hasBody
      ? { 'content-type': 'application/json', ...headers }
      : headers
    return Promise.resolve(
      new Response(
        hasBody ? JSON.stringify(body) : undefined,
        { status: response.status, headers: responseHeaders },
      ),
    )
  }
}

const defaultOptions: CheckRunsOptions = {
  token: 'test-token',
  owner: 'test-owner',
  repo: 'test-repo',
}

const mockCheckRunResponse = {
  id: 12345,
  name: 'test-check',
  head_sha: 'abc123',
  status: 'queued',
  conclusion: null,
  output: { title: null, summary: null, text: null },
  started_at: null,
  completed_at: null,
}

Deno.test('GithubClient.create - should create a new check run', async () => {
  const fetch = createMockFetch([
    { status: 201, body: mockCheckRunResponse },
  ])
  const client = GithubClient.create(defaultOptions).withFetch(fetch)
  const result = await client.create('test-check', 'abc123').run()

  assertEquals(result.id, 12345)
  assertEquals(result.name, 'test-check')
  assertEquals(result.status, 'queued')
  assertEquals(result.headSha, 'abc123')
})

Deno.test('GithubClient.start - should set status to in_progress', async () => {
  const fetch = createMockFetch([
    { status: 200, body: { ...mockCheckRunResponse, status: 'in_progress' } },
  ])
  const client = GithubClient.create(defaultOptions).withFetch(fetch)
  const checkRun = {
    id: 12345,
    name: 'test-check',
    headSha: 'abc123',
    status: 'queued' as const,
  }
  const result = await client.start(checkRun).run()

  assertEquals(result.id, 12345)
  assertEquals(result.status, 'in_progress')
})

Deno.test('GithubClient.update - should update check run output', async () => {
  const fetch = createMockFetch([
    { status: 200, body: mockCheckRunResponse },
  ])
  const client = GithubClient.create(defaultOptions).withFetch(fetch)
  const checkRun = {
    id: 12345,
    name: 'test-check',
    headSha: 'abc123',
    status: 'in_progress' as const,
  }
  const result = await client.update(checkRun, {
    title: 'Test Title',
    summary: 'Test Summary',
  }).run()

  assertEquals(result.id, 12345)
})

Deno.test('GithubClient.complete - should complete check run with conclusion', async () => {
  const fetch = createMockFetch([
    {
      status: 200,
      body: {
        ...mockCheckRunResponse,
        status: 'completed',
        conclusion: 'success',
      },
    },
  ])
  const client = GithubClient.create(defaultOptions).withFetch(fetch)
  const checkRun = {
    id: 12345,
    name: 'test-check',
    headSha: 'abc123',
    status: 'in_progress' as const,
  }
  const result = await client.complete(checkRun, 'success', {
    title: 'Done',
    summary: 'All checks passed',
  }).run()

  assertEquals(result.id, 12345)
  assertEquals(result.status, 'completed')
  assertEquals(result.conclusion, 'success')
})

Deno.test('GithubClient - should handle rate limit error', async () => {
  const fetch = createMockFetch([
    {
      status: 403,
      body: { message: 'API rate limit exceeded' },
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1609459200',
      },
    },
  ])
  const client = GithubClient.create(defaultOptions).withFetch(fetch)
  const result = await client.create('test-check', 'abc123').result()

  assertEquals(result.type, 'error')
  if (result.type === 'error') {
    const error = result.error as CheckRunsApiError
    assertEquals(error.name, 'CheckRunsApiError')
    assertEquals(error.details.status, 403)
    assertEquals(error.details.rateLimitRemaining, 0)
    assertEquals(error.details.rateLimitReset, new Date(1609459200 * 1000))
  }
})

Deno.test('GithubClient.get - should retrieve check run by id', async () => {
  const fetch = createMockFetch([
    { status: 200, body: mockCheckRunResponse },
  ])
  const client = GithubClient.create(defaultOptions).withFetch(fetch)
  const checkRun = {
    id: 12345,
    name: 'test-check',
    headSha: 'abc123',
    status: 'queued' as const,
  }
  const result = await client.get(checkRun).run()

  assertEquals(result.id, 12345)
  assertEquals(result.name, 'test-check')
})

Deno.test('GithubClient.withFetch - should return new instance', () => {
  const client1 = GithubClient.create(defaultOptions)
  const client2 = client1.withFetch(() => Promise.resolve(new Response()))

  assertEquals(client1 === client2, false)
})

Deno.test('GithubClient - should pass abort signal to fetch', async () => {
  const fetch = createMockFetch([
    { status: 201, body: mockCheckRunResponse },
  ])

  let receivedSignal: AbortSignal | undefined
  const trackingFetch: FetchFn = (url, init) => {
    receivedSignal = (init as RequestInit | undefined)?.signal as
      | AbortSignal
      | undefined
    return fetch(url, init)
  }

  const clientWithTracking = GithubClient.create(defaultOptions).withFetch(
    trackingFetch,
  )
  const controller = new AbortController()
  await clientWithTracking.create('test-check', 'abc123').withSignal(
    controller.signal,
  ).run()

  assertEquals(receivedSignal instanceof AbortSignal, true)
})
