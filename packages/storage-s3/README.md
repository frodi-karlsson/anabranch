# @anabranch/storage-s3

S3 storage adapter for the anabranch ecosystem. Works with AWS S3, Minio,
LocalStack, and other S3-compatible APIs.

## Usage

```ts
import { createS3 } from '@anabranch/storage-s3'
import { Storage } from '@anabranch/storage'

const connector = createS3({
  bucket: 'my-bucket',
  region: 'us-east-1',
  credentials: {
    accessKeyId: '...',
    secretAccessKey: '...',
  },
})

const storage = await Storage.connect(connector).run()

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
