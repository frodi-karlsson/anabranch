import type {
  BodyInput,
  PutOptions,
  StorageConnector,
  StorageMetadata,
  StorageOptions,
} from './adapter.ts'
import { StorageObjectNotFound } from './errors.ts'

const encoder = new TextEncoder()

/**
 * Creates an in-memory storage connector for testing.
 * Data is stored in memory and lost when the process ends.
 *
 * @example
 * ```ts
 * const connector = createInMemory({ prefix: "files/" });
 * const storage = await connector.connect();
 * await storage.put("test.txt", "Hello");
 * ```
 */
export function createInMemory(options?: StorageOptions): StorageConnector {
  const prefix = options?.prefix ?? ''
  const data = new Map<string, Uint8Array>()
  const metadata = new Map<string, StorageMetadata>()

  return {
    connect: () => {
      return Promise.resolve({
        put: async (key: string, body: BodyInput, opts?: PutOptions) => {
          const fullKey = prefix + key
          const bytes = typeof body === 'string'
            ? encoder.encode(body)
            : body instanceof ReadableStream
            ? await bytesFromStream(body)
            : body

          data.set(fullKey, bytes)

          const size = bytes.length
          const lastModified = new Date()
          metadata.set(fullKey, {
            key: fullKey,
            size,
            lastModified,
            contentType: opts?.contentType,
            custom: opts?.custom,
          })
        },
        get: (key: string) => {
          const fullKey = prefix + key
          const bytes = data.get(fullKey)
          if (!bytes) {
            return Promise.reject(new StorageObjectNotFound(key))
          }

          const meta = metadata.get(fullKey)
          if (!meta) {
            return Promise.reject(new StorageObjectNotFound(key))
          }

          return Promise.resolve({
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(bytes)
                controller.close()
              },
            }),
            metadata: { ...meta },
          })
        },
        delete: (key: string) => {
          const fullKey = prefix + key
          data.delete(fullKey)
          metadata.delete(fullKey)
          return Promise.resolve()
        },
        head: (key: string) => {
          const fullKey = prefix + key
          const meta = metadata.get(fullKey)
          if (!meta) {
            return Promise.reject(new StorageObjectNotFound(key))
          }
          return Promise.resolve({ ...meta })
        },
        list: (p?: string) => {
          const searchPrefix = prefix + (p ?? '')
          return (async function* () {
            for (const [key, meta] of metadata) {
              if (key.startsWith(searchPrefix)) {
                yield {
                  key,
                  size: meta.size,
                  lastModified: meta.lastModified,
                }
              }
            }
          })()
        },
        close: () => Promise.resolve(),
      })
    },
    end: () => {
      data.clear()
      metadata.clear()
      return Promise.resolve()
    },
  }
}

async function bytesFromStream(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
