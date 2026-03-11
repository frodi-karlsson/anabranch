# @anabranch/storage

Object storage primitives with Task/Stream semantics for error-tolerant
operations.

A storage abstraction that integrates with anabranch's Task and Stream types for
composable error handling, concurrent processing, and automatic resource
management.

## Usage

```ts
import { createInMemory, Storage } from '@anabranch/storage'

const connector = createInMemory({ prefix: 'files/' })
const storage = await Storage.connect(connector).run()

// Put an object
await storage.put('hello.txt', 'Hello, World!', {
  contentType: 'text/plain',
}).run()

// Get an object
const object = await storage.get('hello.txt').run()
const text = await new Response(object.body).text()
console.log(text) // "Hello, World!"

// List objects with concurrent processing
const { successes, errors } = await storage.list('files/')
  .withConcurrency(10)
  .map(async (entry) => await processFile(entry))
  .partition()
```

## Installation

**Deno (JSR)**

```ts
import { Storage } from 'jsr:@anabranch/storage'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/storage
```

## Adapters

- `createInMemory` - In-memory storage for testing
- S3, GCS, Azure Blob Storage adapters coming soon

## API Reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/storage)
for full API details.
