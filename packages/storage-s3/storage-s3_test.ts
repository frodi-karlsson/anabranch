import { assertEquals } from '@std/assert'
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { Agent } from 'node:https'
import { Agent as HttpAgent } from 'node:http'
import { Storage } from '@anabranch/storage'
import { createS3 } from './index.ts'

const endpoint = Deno.env.get('S3_ENDPOINT') ?? 'http://localhost:9000'
const region = Deno.env.get('S3_REGION') ?? 'us-east-1'
const accessKeyId = Deno.env.get('S3_ACCESS_KEY_ID') ?? 'minioadmin'
const secretAccessKey = Deno.env.get('S3_SECRET_ACCESS_KEY') ?? 'minioadmin'
const bucket = Deno.env.get('S3_BUCKET') ?? 'test-bucket'

async function ensureBucket() {
  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({
      httpAgent: new HttpAgent({ keepAlive: false }),
      httpsAgent: new Agent({ keepAlive: false }),
    }),
  })
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
  } catch (e) {
    const err = e as { name: string }
    if (
      err.name !== 'BucketAlreadyOwnedByYou' &&
      err.name !== 'BucketAlreadyExists'
    ) {
      throw e
    }
  } finally {
    client.destroy()
  }
}

Deno.test({
  name: 'S3Storage - full lifecycle',
  ignore: !Deno.env.get('S3_ENDPOINT'),
  async fn() {
    await ensureBucket()

    const connector = createS3({
      bucket,
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      pooled: false,
    })

    const storage = await Storage.connect(connector).run()

    try {
      await storage.put('test.txt', 'hello s3', {
        contentType: 'text/plain',
        custom: { test: 'value' },
      }).run()

      const metadata = await storage.head('test.txt').run()
      assertEquals(metadata.key, 'test.txt')
      assertEquals(metadata.contentType, 'text/plain')
      assertEquals(metadata.custom?.test, 'value')

      const obj = await storage.get('test.txt').run()
      assertEquals(obj.metadata.key, 'test.txt')
      const text = await new Response(obj.body).text()
      assertEquals(text, 'hello s3')

      const { successes } = await storage.list().partition()
      const entry = successes.find((e) => e.key === 'test.txt')
      assertEquals(!!entry, true)
      assertEquals(entry?.size, 'hello s3'.length)

      await storage.delete('test.txt').run()

      const headAfterDelete = await storage.head('test.txt').result()
      assertEquals(headAfterDelete.type, 'error')
      const err = (headAfterDelete as { error: { name: string } }).error
      assertEquals(err.name, 'StorageObjectNotFound')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'S3Storage - prefix isolation',
  ignore: !Deno.env.get('S3_ENDPOINT'),
  async fn() {
    await ensureBucket()

    const connector = createS3({
      bucket,
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      prefix: 'apps/my-app/',
      pooled: false,
    })

    const storage = await Storage.connect(connector).run()

    try {
      await storage.put('config.json', '{"id": 1}').run()

      const { successes } = await storage.list().partition()
      assertEquals(successes.length, 1)
      assertEquals(successes[0].key, 'config.json')

      const obj = await storage.get('config.json').run()
      assertEquals(obj.metadata.key, 'config.json')

      await storage.delete('config.json').run()
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'S3Storage - presigned URLs',
  ignore: !Deno.env.get('S3_ENDPOINT'),
  async fn() {
    await ensureBucket()

    const connector = createS3({
      bucket,
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      pooled: false,
    })

    const storage = await Storage.connect(connector).run()

    try {
      const testContent = 'presigned content'
      const presignedPut = await storage
        .presign('presign-test.txt', { method: 'PUT', expiresIn: 3600 })
        .run()

      assertEquals(presignedPut.startsWith(endpoint), true)
      assertEquals(presignedPut.includes('X-Amz-Algorithm'), true)

      const putResponse = await fetch(presignedPut, {
        method: 'PUT',
        body: testContent,
        headers: { 'Content-Type': 'text/plain' },
      })
      await putResponse.body?.cancel()
      assertEquals(putResponse.ok, true)

      const presignedGet = await storage
        .presign('presign-test.txt', { method: 'GET', expiresIn: 3600 })
        .run()

      assertEquals(presignedGet.startsWith(endpoint), true)
      assertEquals(presignedGet.includes('X-Amz-Signature'), true)

      const getResponse = await fetch(presignedGet)
      assertEquals(getResponse.ok, true)
      const getContent = await getResponse.text()
      assertEquals(getContent, testContent)

      await storage.delete('presign-test.txt').run()

      const headAfterDelete = await storage.head('presign-test.txt').result()
      assertEquals(headAfterDelete.type, 'error')
    } finally {
      await connector.end()
    }
  },
})
