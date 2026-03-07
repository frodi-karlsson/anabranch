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
| [fs](./packages/fs)                                   | Streaming file-system utilities for reading, walking, globbing, and watching files with composable error handling.                          |
| [db](./packages/db)                                   | Database abstraction with Task/Stream semantics. In-memory adapter for testing, adapters for PostgreSQL, MySQL, and SQLite.                 |
| [db-postgres](./packages/db-postgres)                 | PostgreSQL database connector using node:pg with connection pooling and cursor-based streaming for large result sets.                       |
| [db-sqlite](./packages/db-sqlite)                     | SQLite database connector using Node.js built-in node:sqlite for in-memory or file-based databases.                                         |
| [db-mysql](./packages/db-mysql)                       | MySQL database connector using mysql2 with connection pooling for MySQL databases.                                                          |
| [queue](./packages/queue)                             | Message queue with Task/Stream semantics. In-memory adapter with delayed messages, dead letter queues, and visibility timeout.              |
