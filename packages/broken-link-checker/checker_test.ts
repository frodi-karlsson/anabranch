import { assert, assertEquals } from '@std/assert'
import { BrokenLinkChecker } from './checker.ts'

type FetchFn = typeof globalThis.fetch

Deno.test('BrokenLinkChecker.check - should report seed URL as ok when it returns 200', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(200, '<html></html>'),
  })
  const { ok, broken } = await collectResults(
    baseChecker(fetch),
    'https://example.com/',
  )
  assertEquals(ok, [200])
  assertEquals(broken, [])
})

Deno.test('BrokenLinkChecker.check - should report seed URL as broken when it returns 404', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(404, ''),
  })
  const { broken } = await collectResults(
    baseChecker(fetch),
    'https://example.com/',
  )
  assertEquals(broken, ['https://example.com/'])
})

Deno.test('BrokenLinkChecker.check - should crawl discovered links from HTML', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(
      200,
      `<a href="/about">about</a><a href="/contact">contact</a>`,
    ),
    'https://example.com/about': makeResponse(200, '<html></html>'),
    'https://example.com/contact': makeResponse(200, '<html></html>'),
  })
  const { ok, broken } = await collectResults(
    baseChecker(fetch),
    'https://example.com/',
  )
  assertEquals(broken, [])
  assertEquals(ok.length, 3)
})

Deno.test('BrokenLinkChecker.check - should report broken links found during crawl', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(200, `<a href="/missing">missing</a>`),
    'https://example.com/missing': makeResponse(404, ''),
  })
  const { broken } = await collectResults(
    baseChecker(fetch),
    'https://example.com/',
  )
  assertEquals(broken.includes('https://example.com/missing'), true)
})

Deno.test('BrokenLinkChecker.check - should not crawl external links', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(
      200,
      `<a href="https://external.com/page">ext</a>`,
    ),
    'https://external.com/page': makeResponse(
      200,
      `<a href="/other">other</a>`,
    ),
  })
  const { ok } = await collectResults(
    baseChecker(fetch),
    'https://example.com/',
  )
  // Only seed + external link, not /other (because external.com is not crawled)
  assertEquals(ok.length, 2)
})

Deno.test('BrokenLinkChecker.check - should not visit the same URL twice', async () => {
  let callCount = 0
  const fetch: FetchFn = (input) => {
    callCount++
    const href = typeof input === 'string' ? input : (input as URL).href
    if (href === 'https://example.com/') {
      return Promise.resolve(
        makeResponse(200, `<a href="/">home</a><a href="/page">page</a>`),
      )
    }
    return Promise.resolve(makeResponse(200, '<html></html>'))
  }
  await collectResults(baseChecker(fetch), 'https://example.com/')
  assertEquals(callCount, 2)
})

Deno.test('BrokenLinkChecker.check - should report network errors as broken links', async () => {
  const fetch: FetchFn = (input) => {
    const href = typeof input === 'string' ? input : (input as URL).href
    if (href === 'https://example.com/') {
      return Promise.resolve(makeResponse(200, `<a href="/down">down</a>`))
    }
    return Promise.reject(new TypeError('connection refused'))
  }
  const { broken } = await collectResults(
    baseChecker(fetch),
    'https://example.com/',
  )
  assertEquals(broken, ['https://example.com/down'])
})

Deno.test('BrokenLinkChecker.check - should set isPath true for same-host and false for external', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(
      200,
      `<a href="/local">local</a><a href="https://other.com">external</a>`,
    ),
    'https://example.com/local': makeResponse(200, '<html></html>'),
    'https://other.com/': makeResponse(200, '<html></html>'),
  })
  const results: Array<{ url: string; isPath: boolean }> = []
  for await (
    const result of baseChecker(fetch).check(['https://example.com/'])
      .successes()
  ) {
    results.push({ url: result.url.href, isPath: result.isPath })
  }
  const local = results.find((r) => r.url === 'https://example.com/local')
  const ext = results.find((r) => r.url === 'https://other.com/')
  assertEquals(local?.isPath, true)
  assertEquals(ext?.isPath, false)
})

Deno.test('BrokenLinkChecker.check - should set parent to undefined for seed and to page URL for discovered links', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(200, `<a href="/child">child</a>`),
    'https://example.com/child': makeResponse(200, '<html></html>'),
  })
  const results: Array<{ url: string; parent: string | undefined }> = []
  for await (
    const result of baseChecker(fetch).check(['https://example.com/'])
      .successes()
  ) {
    results.push({ url: result.url.href, parent: result.parent?.href })
  }
  const seed = results.find((r) => r.url === 'https://example.com/')
  const child = results.find((r) => r.url === 'https://example.com/child')
  assertEquals(seed?.parent, undefined)
  assertEquals(child?.parent, 'https://example.com/')
})

Deno.test('BrokenLinkChecker.filterUrls - should prevent matching URLs from being checked', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(
      200,
      `<a href="/admin">admin</a><a href="/public">public</a>`,
    ),
    'https://example.com/public': makeResponse(200, '<html></html>'),
  })
  const checker = baseChecker(fetch)
    .filterUrls((url) => !url.pathname.startsWith('/admin'))
  const { ok } = await collectResults(checker, 'https://example.com/')
  assertEquals(ok.length, 2)
})

Deno.test('BrokenLinkChecker.filterUrls - should not apply to seed URL', async () => {
  const fetch = mockFetch({
    'https://example.com/admin': makeResponse(200, '<html></html>'),
  })
  const checker = baseChecker(fetch)
    .filterUrls((url) => !url.pathname.startsWith('/admin'))
  const { ok } = await collectResults(checker, 'https://example.com/admin')
  assertEquals(ok, [200])
})

Deno.test('BrokenLinkChecker.keepBroken - should keep matching broken results in output', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(
      200,
      `<a href="/auth">auth</a><a href="/broken">broken</a>`,
    ),
    'https://example.com/auth': makeResponse(401, ''),
    'https://example.com/broken': makeResponse(404, ''),
  })
  const checker = baseChecker(fetch)
    .keepBroken((result) => result.status !== 401)
  const { broken } = await collectResults(checker, 'https://example.com/')
  assertEquals(broken, ['https://example.com/broken'])
})

Deno.test('BrokenLinkChecker.check - should support multiple entrypoints', async () => {
  const fetch = mockFetch({
    'https://example.com/': makeResponse(200, '<html></html>'),
    'https://example.com/page1': makeResponse(200, '<html></html>'),
    'https://example.com/sitemap.xml': makeResponse(
      200,
      `<a href="/page1">page1</a><a href="/page2">page2</a>`,
    ),
    'https://example.com/page2': makeResponse(200, '<html></html>'),
  })
  const urls = await baseChecker(fetch)
    .check(['https://example.com/', 'https://example.com/sitemap.xml'])
    .map((r) => r.url.href)
    .collect()
  assertEquals(urls.length, 4)
  assert(urls.includes('https://example.com/'))
  assert(urls.includes('https://example.com/page1'))
  assert(urls.includes('https://example.com/page2'))
  assert(urls.includes('https://example.com/sitemap.xml'))
})

function baseChecker(fetch: FetchFn): BrokenLinkChecker {
  return BrokenLinkChecker.create()
    .withFetch(fetch)
    .withRetry({ attempts: 1, delay: () => 0 })
}

async function collectResults(
  checker: BrokenLinkChecker,
  url: string,
): Promise<{ ok: number[]; broken: string[] }> {
  const ok: number[] = []
  const broken: string[] = []
  for await (const result of checker.check([url]).successes()) {
    if (result.ok) {
      ok.push(result.status!)
    } else {
      broken.push(result.url.href)
    }
  }
  return { ok, broken }
}

function mockFetch(pages: Record<string, Response>): FetchFn {
  return (input: string | URL | Request) => {
    const href = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : input.url
    const resp = pages[href]
    if (resp === undefined) {
      return Promise.reject(new TypeError(`No mock for ${href}`))
    }
    return Promise.resolve(resp)
  }
}

function makeResponse(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  })
}
