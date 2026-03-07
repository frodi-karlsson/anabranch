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

| Package                                               | Description                                                                                                                                 | JSR                                                                                                        | npm                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [anabranch](./packages/anabranch)                     | Async stream processing where errors are collected alongside values instead of stopping the pipeline. Built on Task and Channel primitives. | [![](https://jsr.io/badges/@anabranch/anabranch)](https://jsr.io/@anabranch/anabranch)                     | [![](https://img.shields.io/npm/v/anabranch.svg)](https://www.npmjs.com/package/anabranch)                                           |
| [web-client](./packages/web-client)                   | Modern HTTP client built on fetch with automatic retries, timeouts, and rate-limit handling. Returns Task for composable error handling.    | [![](https://jsr.io/badges/@anabranch/web-client)](https://jsr.io/@anabranch/web-client)                   | [![](https://img.shields.io/npm/v/@anabranch/web-client.svg)](https://www.npmjs.com/package/@anabranch/web-client)                   |
| [broken-link-checker](./packages/broken-link-checker) | Crawl websites and find broken links. Uses web-client for robust HTTP and anabranch streams for concurrent processing with backpressure.    | [![](https://jsr.io/badges/@anabranch/broken-link-checker)](https://jsr.io/@anabranch/broken-link-checker) | [![](https://img.shields.io/npm/v/@anabranch/broken-link-checker.svg)](https://www.npmjs.com/package/@anabranch/broken-link-checker) |
| [fs](./packages/fs)                                   | Streaming file-system utilities for reading, walking, globbing, and watching files with composable error handling.                          | [![](https://jsr.io/badges/@anabranch/fs)](https://jsr.io/@anabranch/fs)                                   | [![](https://img.shields.io/npm/v/@anabranch/fs.svg)](https://www.npmjs.com/package/@anabranch/fs)                                   |
| [db](./packages/db)                                   | Database abstraction with Task/Stream semantics. In-memory adapter for testing, adapters for PostgreSQL, MySQL, and SQLite.                 | [![](https://jsr.io/badges/@anabranch/db)](https://jsr.io/@anabranch/db)                                   | [![](https://img.shields.io/npm/v/@anabranch/db.svg)](https://www.npmjs.com/package/@anabranch/db)                                   |
| [db-postgres](./packages/db-postgres)                 | PostgreSQL database connector using node:pg with connection pooling and cursor-based streaming for large result sets.                       | [![](https://jsr.io/badges/@anabranch/db-postgres)](https://jsr.io/@anabranch/db-postgres)                 | [![](https://img.shields.io/npm/v/@anabranch/db-postgres.svg)](https://www.npmjs.com/package/@anabranch/db-postgres)                 |
| [db-sqlite](./packages/db-sqlite)                     | SQLite database connector using Node.js built-in node:sqlite for in-memory or file-based databases.                                         | [![](https://jsr.io/badges/@anabranch/db-sqlite)](https://jsr.io/@anabranch/db-sqlite)                     | [![](https://img.shields.io/npm/v/@anabranch/db-sqlite.svg)](https://www.npmjs.com/package/@anabranch/db-sqlite)                     |
| [db-mysql](./packages/db-mysql)                       | MySQL database connector using mysql2 with connection pooling for MySQL databases.                                                          | [![](https://jsr.io/badges/@anabranch/db-mysql)](https://jsr.io/@anabranch/db-mysql)                       | [![](https://img.shields.io/npm/v/@anabranch/db-mysql.svg)](https://www.npmjs.com/package/@anabranch/db-mysql)                       |
| [queue](./packages/queue)                             | Message queue with Task/Stream semantics. In-memory adapter with delayed messages, dead letter queues, and visibility timeout.              | [![](https://jsr.io/badges/@anabranch/queue)](https://jsr.io/@anabranch/queue)                             | [![](https://img.shields.io/npm/v/@anabranch/queue.svg)](https://www.npmjs.com/package/@anabranch/queue)                             |
| [queue-redis](./packages/queue-redis)                 | Redis adapter for @anabranch/queue using ioredis. Supports all queue features with Redis streams for persistent messaging.                  | [![](https://jsr.io/badges/@anabranch/queue-redis)](https://jsr.io/@anabranch/queue-redis)                 | [![](https://img.shields.io/npm/v/@anabranch/queue-redis.svg)](https://www.npmjs.com/package/@anabranch/queue-redis)                 |
| [queue-rabbitmq](./packages/queue-rabbitmq)           | RabbitMQ adapter for @anabranch/queue using amqplib. Supports all queue features with RabbitMQ queues for persistent messaging.             | [![](https://jsr.io/badges/@anabranch/queue-rabbitmq)](https://jsr.io/@anabranch/queue-rabbitmq)           | [![](https://img.shields.io/npm/v/@anabranch/queue-rabbitmq.svg)](https://www.npmjs.com/package/@anabranch/queue-rabbitmq)           |
