# @anabranch/storage-gcs

Google Cloud Storage adapter for the anabranch ecosystem. Works with GCS and
S3-compatible APIs.

## Usage

```ts
import { createGcs } from '@anabranch/storage-gcs'
import { Storage } from '@anabranch/storage'

const connector = createGcs({
  bucket: 'my-bucket',
  projectId: 'my-project',
  credentials: {
    client_email: '...',
    private_key: '...',
  },
})

const storage = new Storage(await connector.connect())

await storage.put('hello.txt', 'world').run()

const content = await storage.get('hello.txt').run()
console.log(await new Response(content.body).text())
```

## Features

- **Concurrent Operations**: Leverage anabranch streams for high-throughput
  listing and bulk transfers.
- **Retry & Timeouts**: Composable `Task` primitives allow for robust network
  resilience.
- **Prefix Isolation**: Easily scope storage access to a specific path.
- **Presigned URLs**: Support for temporary GET/PUT access.
