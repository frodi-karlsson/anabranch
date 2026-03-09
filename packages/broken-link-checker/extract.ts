import { parseHTML } from 'linkedom'

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|data:)/i

/**
 * Extracts all unique, non-fragment links from an HTML string.
 * Relative URLs are resolved against `baseUrl`.
 * Fragments, special schemes, and empty hrefs are excluded.
 */
export function _extractLinks(html: string, baseUrl: URL): URL[] {
  const parsed = parseHTML(html)
  // deno-lint-ignore no-explicit-any
  const document = (parsed as any).document

  const seen = new Set<string>()
  const links: URL[] = []

  for (const el of document.querySelectorAll('a[href]')) {
    const raw = el.getAttribute('href')?.trim()
    if (!raw || raw.startsWith('#') || SKIP_SCHEMES.test(raw)) continue

    let url: URL
    try {
      url = new URL(raw, baseUrl)
    } catch {
      continue
    }

    url.hash = ''
    const key = url.href
    if (seen.has(key)) continue
    seen.add(key)
    links.push(url)
  }

  return links
}

/**
 * Extracts all URLs from an XML sitemap.
 * Handles standard sitemaps and sitemap indexes.
 */
export function _extractLinksFromXml(xml: string): URL[] {
  const seen = new Set<string>()
  const links: URL[] = []

  const locMatches = xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)
  for (const match of locMatches) {
    const raw = match[1]?.trim()
    if (!raw) continue

    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }

    const key = url.href
    if (seen.has(key)) continue
    seen.add(key)
    links.push(url)
  }

  return links.filter((url) => url.hostname !== '')
}
