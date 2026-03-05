import { DOMParser } from "@b-fuze/deno-dom";

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|data:)/i;

/**
 * Extracts all unique, non-fragment links from an HTML string.
 * Relative URLs are resolved against `baseUrl`.
 * Fragments, special schemes, and empty hrefs are excluded.
 */
export function _extractLinks(html: string, baseUrl: URL): URL[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];

  const seen = new Set<string>();
  const links: URL[] = [];

  for (const el of doc.querySelectorAll("a[href]")) {
    const raw = el.getAttribute("href")?.trim();
    if (!raw || raw.startsWith("#") || SKIP_SCHEMES.test(raw)) continue;

    let url: URL;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue;
    }

    url.hash = "";
    const key = url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(url);
  }

  return links;
}
