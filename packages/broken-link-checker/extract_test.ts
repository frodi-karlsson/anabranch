import { assertEquals } from "@std/assert";
import { _extractLinks } from "./extract.ts";

Deno.test("_extractLinks - should return empty array for empty HTML", () => {
  assertEquals(_extractLinks("", base), []);
});

Deno.test("_extractLinks - should return empty array when no anchors", () => {
  assertEquals(_extractLinks("<p>No links here</p>", base), []);
});

Deno.test("_extractLinks - should extract absolute URLs", () => {
  const html = `<a href="https://other.com/page">link</a>`;
  const links = _extractLinks(html, base);
  assertEquals(links.length, 1);
  assertEquals(links[0].href, "https://other.com/page");
});

Deno.test("_extractLinks - should resolve relative URLs against base", () => {
  const html = `<a href="../about.html">about</a>`;
  const links = _extractLinks(html, base);
  assertEquals(links.length, 1);
  assertEquals(links[0].href, "https://example.com/about.html");
});

Deno.test("_extractLinks - should resolve root-relative URLs", () => {
  const html = `<a href="/contact">contact</a>`;
  const links = _extractLinks(html, base);
  assertEquals(links.length, 1);
  assertEquals(links[0].href, "https://example.com/contact");
});

Deno.test("_extractLinks - should strip fragments from URLs", () => {
  const html = `<a href="/page#section">link</a>`;
  const links = _extractLinks(html, base);
  assertEquals(links.length, 1);
  assertEquals(links[0].href, "https://example.com/page");
});

Deno.test("_extractLinks - should skip fragment-only hrefs", () => {
  assertEquals(_extractLinks(`<a href="#section">link</a>`, base), []);
});

Deno.test("_extractLinks - should skip mailto: hrefs", () => {
  assertEquals(
    _extractLinks(`<a href="mailto:user@example.com">email</a>`, base),
    [],
  );
});

Deno.test("_extractLinks - should skip tel: hrefs", () => {
  assertEquals(_extractLinks(`<a href="tel:+1234567890">call</a>`, base), []);
});

Deno.test("_extractLinks - should skip javascript: hrefs", () => {
  assertEquals(
    _extractLinks(`<a href="javascript:void(0)">click</a>`, base),
    [],
  );
});

Deno.test("_extractLinks - should skip data: hrefs", () => {
  assertEquals(
    _extractLinks(`<a href="data:text/plain,hello">data</a>`, base),
    [],
  );
});

Deno.test("_extractLinks - should skip empty hrefs", () => {
  assertEquals(_extractLinks(`<a href="">empty</a>`, base), []);
});

Deno.test("_extractLinks - should deduplicate URLs within a page", () => {
  const html = `
    <a href="/page">link1</a>
    <a href="/page">link2</a>
    <a href="/page#frag">link3</a>
  `;
  const links = _extractLinks(html, base);
  assertEquals(links.length, 1);
  assertEquals(links[0].href, "https://example.com/page");
});

Deno.test("_extractLinks - should extract multiple unique links", () => {
  const html = `
    <a href="/about">about</a>
    <a href="/contact">contact</a>
    <a href="https://external.com">external</a>
  `;
  const links = _extractLinks(html, base);
  assertEquals(links.length, 3);
  const hrefs = links.map((u) => u.href);
  assertEquals(hrefs.includes("https://example.com/about"), true);
  assertEquals(hrefs.includes("https://example.com/contact"), true);
  assertEquals(hrefs.includes("https://external.com/"), true);
});

Deno.test("_extractLinks - should skip anchors without href attribute", () => {
  assertEquals(_extractLinks(`<a name="anchor">no href</a>`, base), []);
});

const base = new URL("https://example.com/page/index.html");
