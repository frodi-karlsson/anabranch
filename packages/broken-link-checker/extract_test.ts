import { assertEquals } from '@std/assert'
import { _extractLinks, _extractLinksFromXml } from './extract.ts'

Deno.test('_extractLinks - should return empty array for empty HTML', () => {
  assertEquals(_extractLinks('', base), [])
})

Deno.test('_extractLinks - should return empty array when no anchors', () => {
  assertEquals(_extractLinks('<p>No links here</p>', base), [])
})

Deno.test('_extractLinks - should extract absolute URLs', () => {
  const html = `<a href="https://other.com/page">link</a>`
  const links = _extractLinks(html, base)
  assertEquals(links.length, 1)
  assertEquals(links[0].href, 'https://other.com/page')
})

Deno.test('_extractLinks - should resolve relative URLs against base', () => {
  const html = `<a href="../about.html">about</a>`
  const links = _extractLinks(html, base)
  assertEquals(links.length, 1)
  assertEquals(links[0].href, 'https://example.com/about.html')
})

Deno.test('_extractLinks - should resolve root-relative URLs', () => {
  const html = `<a href="/contact">contact</a>`
  const links = _extractLinks(html, base)
  assertEquals(links.length, 1)
  assertEquals(links[0].href, 'https://example.com/contact')
})

Deno.test('_extractLinks - should strip fragments from URLs', () => {
  const html = `<a href="/page#section">link</a>`
  const links = _extractLinks(html, base)
  assertEquals(links.length, 1)
  assertEquals(links[0].href, 'https://example.com/page')
})

Deno.test('_extractLinks - should skip fragment-only hrefs', () => {
  assertEquals(_extractLinks(`<a href="#section">link</a>`, base), [])
})

Deno.test('_extractLinks - should skip mailto: hrefs', () => {
  assertEquals(
    _extractLinks(`<a href="mailto:user@example.com">email</a>`, base),
    [],
  )
})

Deno.test('_extractLinks - should skip tel: hrefs', () => {
  assertEquals(_extractLinks(`<a href="tel:+1234567890">call</a>`, base), [])
})

Deno.test('_extractLinks - should skip javascript: hrefs', () => {
  assertEquals(
    _extractLinks(`<a href="javascript:void(0)">click</a>`, base),
    [],
  )
})

Deno.test('_extractLinks - should skip data: hrefs', () => {
  assertEquals(
    _extractLinks(`<a href="data:text/plain,hello">data</a>`, base),
    [],
  )
})

Deno.test('_extractLinks - should skip empty hrefs', () => {
  assertEquals(_extractLinks(`<a href="">empty</a>`, base), [])
})

Deno.test('_extractLinks - should deduplicate URLs within a page', () => {
  const html = `
    <a href="/page">link1</a>
    <a href="/page">link2</a>
    <a href="/page#frag">link3</a>
  `
  const links = _extractLinks(html, base)
  assertEquals(links.length, 1)
  assertEquals(links[0].href, 'https://example.com/page')
})

Deno.test('_extractLinks - should extract multiple unique links', () => {
  const html = `
    <a href="/about">about</a>
    <a href="/contact">contact</a>
    <a href="https://external.com">external</a>
  `
  const links = _extractLinks(html, base)
  assertEquals(links.length, 3)
  const hrefs = links.map((u) => u.href)
  assertEquals(hrefs.includes('https://example.com/about'), true)
  assertEquals(hrefs.includes('https://example.com/contact'), true)
  assertEquals(hrefs.includes('https://external.com/'), true)
})

Deno.test('_extractLinks - should skip anchors without href attribute', () => {
  assertEquals(_extractLinks(`<a name="anchor">no href</a>`, base), [])
})

Deno.test('_extractLinksFromXml - should return empty array for empty XML', () => {
  assertEquals(_extractLinksFromXml(''), [])
})

Deno.test('_extractLinksFromXml - should return empty array when no loc elements', () => {
  assertEquals(_extractLinksFromXml('<urlset></urlset>'), [])
})

Deno.test('_extractLinksFromXml - should extract URLs from sitemap', () => {
  const xml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://example.com/</loc>
      </url>
      <url>
        <loc>https://example.com/about</loc>
      </url>
    </urlset>
  `
  const links = _extractLinksFromXml(xml)
  assertEquals(links.length, 2)
  assertEquals(links[0].href, 'https://example.com/')
  assertEquals(links[1].href, 'https://example.com/about')
})

Deno.test('_extractLinksFromXml - should extract URLs from sitemap index', () => {
  const xml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap>
        <loc>https://example.com/sitemap1.xml</loc>
      </sitemap>
      <sitemap>
        <loc>https://example.com/sitemap2.xml</loc>
      </sitemap>
    </sitemapindex>
  `
  const links = _extractLinksFromXml(xml)
  assertEquals(links.length, 2)
  assertEquals(links[0].href, 'https://example.com/sitemap1.xml')
  assertEquals(links[1].href, 'https://example.com/sitemap2.xml')
})

Deno.test('_extractLinksFromXml - should deduplicate URLs', () => {
  const xml = `
    <urlset>
      <url><loc>https://example.com/page</loc></url>
      <url><loc>https://example.com/page</loc></url>
    </urlset>
  `
  const links = _extractLinksFromXml(xml)
  assertEquals(links.length, 1)
  assertEquals(links[0].href, 'https://example.com/page')
})

Deno.test('_extractLinksFromXml - should skip empty loc elements', () => {
  const xml = `
    <urlset>
      <url><loc>https://example.com/page</loc></url>
      <url><loc></loc></url>
    </urlset>
  `
  const links = _extractLinksFromXml(xml)
  assertEquals(links.length, 1)
})

Deno.test('_extractLinksFromXml - should skip invalid URLs', () => {
  const xml = `
    <urlset>
      <url><loc>https://example.com/valid</loc></url>
      <url><loc>not-a-url</loc></url>
    </urlset>
  `
  const links = _extractLinksFromXml(xml)
  assertEquals(links.length, 1)
  assertEquals(links[0].href, 'https://example.com/valid')
})

const xmlTestCases = [
  {
    name: 'should handle whitespace in loc elements',
    xml: `<urlset><url><loc>
https://example.com/page
</loc></url></urlset>`,
    expected: ['https://example.com/page'],
  },
  {
    name: 'should handle newlines between tags',
    xml: `<urlset>
<url>
<loc>https://example.com/page1</loc>
</url>
<url>
<loc>https://example.com/page2</loc>
</url>
</urlset>`,
    expected: ['https://example.com/page1', 'https://example.com/page2'],
  },
  {
    name: 'should handle XML with namespaces',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/page</loc>
  </url>
</urlset>`,
    expected: ['https://example.com/page'],
  },
  {
    name: 'should handle sitemap index format',
    xml: `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>`,
    expected: [
      'https://example.com/sitemap-1.xml',
      'https://example.com/sitemap-2.xml',
    ],
  },
  {
    name: 'should handle multiline loc content',
    xml: `<urlset>
<url>
<loc>
https://example.com/
very-long-page-name
</loc>
</url>
</urlset>`,
    expected: ['https://example.com/very-long-page-name'],
  },
  {
    name: 'should handle mixed whitespace',
    xml: `<urlset>
<url><loc>  https://example.com/a  </loc></url>
<url><loc>https://example.com/b</loc></url>
</urlset>`,
    expected: ['https://example.com/a', 'https://example.com/b'],
  },
]

for (const testCase of xmlTestCases) {
  Deno.test(`_extractLinksFromXml - ${testCase.name}`, () => {
    const links = _extractLinksFromXml(testCase.xml)
    assertEquals(
      links.map((u) => u.href),
      testCase.expected,
    )
  })
}

const base = new URL('https://example.com/page/index.html')
