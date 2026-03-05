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
  .filterErrors((result) => result.status !== 401)
  .check("https://my-site.com");

for await (const result of stream.successes()) {
  if (!result.ok) {
    console.log(
      `BROKEN: ${result.url.href} (${result.reason}) on ${result.parent?.href}`,
    );
  }
}
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

### `.filterErrors(fn)` → `BrokenLinkChecker`

Adds an error filter. Broken results (`ok === false`) for which `fn` returns
`false` are excluded from the output stream. Multiple calls are AND'd.

### `.check(startUrl)` → `Stream<CheckResult, Error>`

Starts a BFS crawl from `startUrl`. Same-host pages are crawled for more links;
all discovered URLs are checked. Returns a stream where:

- **success channel** — `CheckResult` values for every checked URL
- **error channel** — unexpected internal errors

### `CheckResult`

```ts
interface CheckResult {
  url: URL;
  parent: URL | undefined; // page this link was found on; undefined for seed
  ok: boolean;
  status: number | undefined; // undefined for network-level failures
  reason: string | undefined; // human-readable error description
  isPath: boolean; // true if same-host (crawled), false if external
  durationMs: number;
}
```
