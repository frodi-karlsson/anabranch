import { Source, Task } from '@anabranch/anabranch'
import type {
  BodyInput,
  PresignableAdapter,
  PresignOptions,
  PutOptions,
  StorageAdapter,
  StorageConnector,
  StorageEntry,
  StorageMetadata,
  StorageObject,
} from './adapter.ts'
import {
  StorageCloseFailed,
  StorageConnectionFailed,
  StorageDeleteFailed,
  StorageGetFailed,
  StorageHeadFailed,
  StorageListFailed,
  StorageObjectNotFound,
  StoragePresignFailed,
  StoragePresignNotSupported,
  StoragePutFailed,
} from './errors.ts'

/**
 * Storage wrapper with Task/Stream semantics for error-tolerant object operations.
 *
 * @example Basic put/get operations
 * ```ts
 * import { Storage, createInMemory } from "@anabranch/storage";
 *
 * const connector = createInMemory();
 * const storage = await Storage.connect(connector).run();
 *
 * await storage.put("hello.txt", "Hello, World!").run();
 * const object = await storage.get("hello.txt").run();
 * ```
 *
 * @example Stream listing objects
 * ```ts
 * const { successes, errors } = await storage.list("users/")
 *   .withConcurrency(5)
 *   .map(async (entry) => await processEntry(entry))
 *   .tapErr((err) => console.error("Failed:", err))
 *   .partition();
 * ```
 *
 * @example With retry and timeout
 * ```ts
 * await storage.put("important.txt", data)
 *   .retry({ attempts: 3, delay: (attempt) => 100 * Math.pow(2, attempt) })
 *   .timeout(30_000)
 *   .run();
 * ```
 */
export class Storage {
  private constructor(private readonly adapter: StorageAdapter) {}

  /**
   * Connect to storage via a connector.
   *
   * @example
   * ```ts
   * const storage = await Storage.connect(createInMemory()).run();
   * ```
   */
  static connect(
    connector: StorageConnector,
  ): Task<Storage, StorageConnectionFailed> {
    return Task.of(async () => new Storage(await connector.connect()))
      .mapErr((error) =>
        new StorageConnectionFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /**
   * Release the connection back to its source (e.g., pool).
   *
   * @example
   * ```ts
   * await storage.close().run();
   * ```
   */
  close(): Task<void, StorageCloseFailed> {
    return Task.of(async () => await this.adapter.close())
      .mapErr((error) =>
        new StorageCloseFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /**
   * Put an object into storage.
   *
   * @example
   * ```ts
   * await storage.put("image.png", imageBytes, { contentType: "image/png" }).run();
   * ```
   */
  put(
    key: string,
    body: BodyInput,
    options?: PutOptions,
  ): Task<void, StoragePutFailed> {
    return Task.of(async () => await this.adapter.put(key, body, options))
      .mapErr((error) =>
        new StoragePutFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /**
   * Get an object from storage.
   *
   * @example
   * ```ts
   * const object = await storage.get("file.txt").run();
   * const text = await new Response(object.body).text();
   * ```
   */
  get(
    key: string,
  ): Task<StorageObject, StorageGetFailed | StorageObjectNotFound> {
    return Task.of(async () => await this.adapter.get(key)).mapErr((error) => {
      if (error instanceof StorageObjectNotFound) return error
      return new StorageGetFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      )
    })
  }

  /**
   * Delete an object from storage.
   *
   * @example
   * ```ts
   * await storage.delete("old-file.txt").run();
   * ```
   */
  delete(key: string): Task<void, StorageDeleteFailed> {
    return Task.of(async () => await this.adapter.delete(key))
      .mapErr((error) =>
        new StorageDeleteFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        )
      )
  }

  /**
   * Get metadata for an object without fetching the body.
   *
   * @example
   * ```ts
   * const metadata = await storage.head("file.txt").run();
   * console.log(metadata.size, metadata.contentType);
   * ```
   */
  head(
    key: string,
  ): Task<StorageMetadata, StorageHeadFailed | StorageObjectNotFound> {
    return Task.of(async () => await this.adapter.head(key)).mapErr((error) =>
      error instanceof StorageObjectNotFound ? error : new StorageHeadFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      )
    )
  }

  /**
   * List objects in storage with optional prefix.
   *
   * @example
   * ```ts
   * const { successes, errors } = await storage.list("images/")
   *   .withConcurrency(10)
   *   .map(async (entry) => await processImage(entry))
   *   .tapErr((err) => console.error("Failed:", err))
   *   .partition();
   * ```
   */
  list(prefix?: string): Source<StorageEntry, StorageListFailed> {
    const adapter = this.adapter
    return Source.from<StorageEntry, StorageListFailed>(
      async function* () {
        try {
          for await (const entry of adapter.list(prefix)) {
            yield entry
          }
        } catch (error) {
          throw new StorageListFailed(
            prefix,
            error instanceof Error ? error.message : String(error),
            error,
          )
        }
      },
    )
  }

  /**
   * Generate a presigned URL for direct object access.
   *
   * Only available on adapters that implement {@linkcode PresignableAdapter}
   * (S3, GCS). Throws {@linkcode StoragePresignNotSupported} for adapters
   * that don't support presigning (memory, browser).
   *
   * @example Generate a presigned URL for download
   * ```ts
   * import { Storage, createS3, StoragePresignNotSupported } from "@anabranch/storage";
   *
   * const storage = await Storage.connect(createS3({ bucket: "my-bucket" })).run();
   *
   * const url = await storage.presign("private/file.txt", {
   *   expiresIn: 3600, // 1 hour
   * }).run();
   *
   * console.log(url); // https://s3.amazonaws.com/my-bucket/private/file.txt?...
   * ```
   *
   * @example Upload with presigned PUT
   * ```ts
   * const uploadUrl = await storage.presign("upload.txt", {
   *   expiresIn: 300,
   *   method: "PUT",
   * }).run();
   *
   * // Client-side upload
   * await fetch(uploadUrl, {
   *   method: "PUT",
   *   body: fileData,
   *   headers: { "Content-Type": "text/plain" },
   * });
   * ```
   */
  presign(
    key: string,
    options: PresignOptions,
  ): Task<string, StoragePresignFailed | StoragePresignNotSupported> {
    return Task.of(async () => {
      if (
        !('presign' in this.adapter) ||
        typeof this.adapter.presign !== 'function'
      ) {
        throw new StoragePresignNotSupported()
      }
      try {
        return await (this.adapter as PresignableAdapter).presign(key, options)
      } catch (error) {
        throw new StoragePresignFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }
}
