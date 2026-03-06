# Anabranch

A Deno-first TypeScript monorepo for async utilities with first-class error
handling.

## Scripts

```bash
# Bootstrap a new package
deno run -A scripts/bootstrap.ts new-package

# Bump versions (dry-run first)
deno run --allow-read --allow-write scripts/bump.ts --help

# Run checks
deno task check
```

## Packages

| Package                                               | Description                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [anabranch](./packages/anabranch)                     | Async stream processing where errors are collected alongside values instead of stopping the pipeline. Built on Task and Channel primitives. |
| [web-client](./packages/web-client)                   | Modern HTTP client built on fetch with automatic retries, timeouts, and rate-limit handling. Returns Task for composable error handling.    |
| [broken-link-checker](./packages/broken-link-checker) | Crawl websites and find broken links. Uses web-client for robust HTTP and anabranch streams for concurrent processing with backpressure.    |
