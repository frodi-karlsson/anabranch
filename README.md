# Anabranch

A Deno-first TypeScript monorepo for async utilities with first-class error
handling.

## Packages

| Package                                               | Description                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [anabranch](./packages/anabranch)                     | Async stream processing where errors are collected alongside values instead of stopping the pipeline. Built on Task and Channel primitives. |
| [web-client](./packages/web-client)                   | Modern HTTP client built on fetch with automatic retries, timeouts, and rate-limit handling. Returns Task for composable error handling.    |
| [broken-link-checker](./packages/broken-link-checker) | Crawl websites and find broken links. Uses web-client for robust HTTP and anabranch streams for concurrent processing with backpressure.    |

## Publishing

Create a version tag and push:

```bash
# anabranch
git tag anabranch@v0.5.0 && git push origin anabranch@v0.5.0

# web-client
git tag web-client@v0.1.0 && git push origin web-client@v0.1.0

# broken-link-checker
git tag broken-link-checker@v0.1.0 && git push origin broken-link-checker@v0.1.0
```

CI will automatically publish to JSR and npm.
