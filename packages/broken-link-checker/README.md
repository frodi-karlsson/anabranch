# @anabranch/broken-link-checker

A concurrent website crawler that finds broken links. Built on
[anabranch](../anabranch) streams for bounded-concurrency crawling, retry with
exponential backoff, and streaming results.

## Usage

```ts
import { BrokenLinkChecker } from "@anabranch/broken-link-checker";

const stream = new BrokenLinkChecker({
  concurrency: 20,
  timeout: 15_000,
  retry: { attempts: 3, delay: (attempt) => 1000 * 2 ** attempt },
})
  .filterUrls((url) => !url.pathname.endsWith(".pdf"))
  .keepBroken((result) => result.status !== 401) // keep all except 401s
  .check("https://my-site.com");

for await (const result of stream.successes()) {
  if (!result.ok) {
    console.log(
      `BROKEN: ${result.url.href} (${result.reason}) on ${result.parent?.href}`,
    );
  }
}
```

## Installation

**Deno (JSR)**

```ts
import { BrokenLinkChecker } from "jsr:@anabranch/broken-link-checker";
```

**Node / Bun (npm)**

```sh
npm install @anabranch/broken-link-checker
```

## API

### `new BrokenLinkChecker(options?)`

| Option           | Default                 | Description                               |
| ---------------- | ----------------------- | ----------------------------------------- |
| `concurrency`    | `10`                    | Max concurrent requests                   |
| `timeout`        | `30_000`                | Per-request timeout in ms                 |
| `retry.attempts` | `3`                     | Max retry attempts on network error       |
| `retry.delay`    | exponential             | `(attempt) => 1000 * 2 ** attempt`        |
| `retry.when`     | always                  | Predicate to decide whether to retry      |
| `fetch`          | `globalThis.fetch`      | Custom fetch (useful for testing/proxies) |
| `userAgent`      | `BrokenLinkChecker/1.0` | User-agent header                         |

### `.filterUrls(fn)` → `BrokenLinkChecker`

Adds a URL filter. URLs for which `fn` returns `false` are skipped entirely (not
checked, not crawled). Multiple calls are AND'd. The seed URL always bypasses
filters.

### `.keepBroken(fn)` → `BrokenLinkChecker`

Adds a predicate for which broken results (`ok === false`) to keep in the
output. Broken results for which `fn` returns `false` are filtered out. Multiple
calls are AND'd.

### `.check(startUrl)` → `Stream<CheckResult, Error>`

Starts a BFS crawl from `startUrl`. Same-host pages are crawled for more links;
all discovered URLs are checked. Returns a stream where:

- **success channel** — `CheckResult` values for every checked URL
- **error channel** — unexpected internal errors

## API reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/broken-link-checker)
for full API details.
