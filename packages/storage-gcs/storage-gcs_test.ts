import { assertEquals } from '@std/assert'
import { Storage as GcsClient } from '@google-cloud/storage'
import { Storage } from '@anabranch/storage'
import { createGcs } from './index.ts'

const endpoint = Deno.env.get('GCS_ENDPOINT') ?? 'http://localhost:4443'
const projectId = Deno.env.get('GCS_PROJECT_ID') ?? 'test-project'
const bucketName = Deno.env.get('GCS_BUCKET') ?? 'test-bucket'

async function ensureBucket() {
  const client = new GcsClient({
    projectId,
    apiEndpoint: endpoint,
  })
  try {
    const bucket = client.bucket(bucketName)
    const [exists] = await bucket.exists()
    if (!exists) {
      await client.createBucket(bucketName)
    }
  } catch (e) {
    const err = e as { code?: number }
    if (err.code !== 409) {
      throw e
    }
  }
}

Deno.test({
  name: 'GcsStorage - full lifecycle',
  ignore: !Deno.env.get('GCS_ENDPOINT'),
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await ensureBucket()

    const connector = createGcs({
      bucket: bucketName,
      projectId,
      apiEndpoint: endpoint,
    })

    const storage = new Storage(await connector.connect())

    try {
      await storage.put('test.txt', 'hello gcs', {
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
      assertEquals(text, 'hello gcs')

      const { successes } = await storage.list().partition()
      const entry = successes.find((e) => e.key === 'test.txt')
      assertEquals(!!entry, true)
      assertEquals(entry?.size, 'hello gcs'.length)

      await storage.delete('test.txt').run()

      const headAfterDelete = await storage.head('test.txt').result()
      assertEquals(headAfterDelete.type, 'error')
      const err = (headAfterDelete as { error: { name: string } }).error
      assertEquals(err.name, 'StorageObjectNotFound')
    } finally {
      /**
       * Note: 'presign' is not currently covered in integration tests
       * as simple emulators like fake-gcs-server require extra configuration for
       * consistent signature verification across different network aliases.
       */
      await connector.end()
    }
  },
})

Deno.test({
  name: 'GcsStorage - prefix isolation',
  ignore: !Deno.env.get('GCS_ENDPOINT'),
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await ensureBucket()

    const connector = createGcs({
      bucket: bucketName,
      projectId,
      apiEndpoint: endpoint,
      prefix: 'apps/my-app/',
    })

    const storage = new Storage(await connector.connect())

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
  name: 'GcsStorage - presigned URLs',
  ignore: !Deno.env.get('GCS_ENDPOINT') ||
    Deno.env.get('GCS_ENDPOINT')?.includes('localhost'),
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await ensureBucket()

    const connector = createGcs({
      bucket: bucketName,
      projectId,
      apiEndpoint: endpoint,
    })

    const storage = new Storage(await connector.connect())

    try {
      const testContent = 'presigned content gcs'
      const presignedPut = await storage
        .presign('presign-test.txt', { method: 'PUT', expiresIn: 3600 })
        .run()

      assertEquals(presignedPut.startsWith(endpoint), true)
      assertEquals(
        presignedPut.includes('GoogleAccessId') ||
          presignedPut.includes('X-Goog-Algorithm'),
        true,
      )

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
      assertEquals(
        presignedGet.includes('X-Goog-Signature') ||
          presignedGet.includes('X-Goog-Algorithm'),
        true,
      )

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
