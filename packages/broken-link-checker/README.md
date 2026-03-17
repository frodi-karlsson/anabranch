# @anabranch/broken-link-checker

A concurrent website crawler that finds broken links. Built on
[anabranch](../anabranch) streams for bounded-concurrency crawling, retry with
exponential backoff, and streaming results.

## Usage

```ts
import { BrokenLinkChecker } from '@anabranch/broken-link-checker'

const stream = BrokenLinkChecker.create()
  .withConcurrency(20)
  .withTimeout(15_000)
  .withRetry({ attempts: 3, delay: (attempt) => 1000 * 2 ** attempt })
  .withLogLevel('info')
  .withMaxDepth(5)
  .filterUrls((url) => !url.pathname.endsWith('.pdf'))
  .keepBroken((result) => result.status !== 401)
  .check(['https://my-site.com', 'https://my-site.com/sitemap.xml'])

for await (const result of stream.successes()) {
  if (!result.ok) {
    console.log(
      `BROKEN: ${result.url.href} (${result.reason}) on ${result.parent?.href}`,
    )
  }
}
```

## Installation

**Deno (JSR)**

```ts
import { BrokenLinkChecker } from 'jsr:@anabranch/broken-link-checker'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/broken-link-checker
```

## API reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/broken-link-checker)
for full API details.
