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

| Package | Description | Size |
| ------- | ----------- | ---- |
| [anabranch](./packages/anabranch) | Async stream processing where errors are collected alongside values instead of stopping the pipeline. Built on Task and Channel primitives. | [![bundle](https://deno.bundlejs.com/?q=anabranch&badge=minified&badge-style=flat)](https://bundlejs.com/?q=anabranch) |
| [web-client](./packages/web-client) | Modern HTTP client built on fetch with automatic retries, timeouts, and rate-limit handling. Returns Task for composable error handling. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/web-client&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Fweb-client) |
| [broken-link-checker](./packages/broken-link-checker) | Crawl websites and find broken links. Uses web-client for robust HTTP and anabranch streams for concurrent processing with backpressure. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/broken-link-checker&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Fbroken-link-checker) |
| [fs](./packages/fs) | Streaming file-system utilities for reading, walking, globbing, and watching files with composable error handling. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/fs&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Ffs) |
| [db](./packages/db) | Database abstraction with Task/Stream semantics. In-memory adapter for testing, adapters for PostgreSQL, MySQL, and SQLite. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/db&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Fdb) |
| [db-postgres](./packages/db-postgres) | PostgreSQL database connector using node:pg with connection pooling and cursor-based streaming for large result sets. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/db-postgres&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Fdb-postgres) |
| [db-sqlite](./packages/db-sqlite) | SQLite database connector using Node.js built-in node:sqlite for in-memory or file-based databases. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/db-sqlite&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Fdb-sqlite) |
| [db-mysql](./packages/db-mysql) | MySQL database connector using mysql2 with connection pooling for MySQL databases. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/db-mysql&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Fdb-mysql) |
| [queue](./packages/queue) | Message queue with Task/Stream semantics. In-memory adapter with delayed messages, dead letter queues, and visibility timeout. | [![bundle](https://deno.bundlejs.com/?q=@anabranch/queue&badge=minified&badge-style=flat)](https://bundlejs.com/?q=%40anabranch%2Fqueue) |