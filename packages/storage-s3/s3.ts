import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type {
  BodyInput,
  PresignableAdapter,
  PresignOptions,
  PutOptions,
  StorageEntry,
  StorageMetadata,
  StorageObject,
} from '@anabranch/storage'
import {
  StorageDeleteFailed,
  StorageGetFailed,
  StorageHeadFailed,
  StorageListFailed,
  StorageObjectNotFound,
  StoragePresignFailed,
  StoragePutFailed,
} from '@anabranch/storage'

/**
 * Adapter for AWS S3 and compatible services (Minio, LocalStack, etc.).
 */
export class S3Adapter implements PresignableAdapter {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly prefix: string,
  ) {}

  async put(key: string, body: BodyInput, options?: PutOptions): Promise<void> {
    const fullKey = this.prefix + key
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
          Body: body,
          ContentType: options?.contentType,
          Metadata: options?.custom,
        }),
      )
    } catch (error) {
      throw new StoragePutFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  async get(key: string): Promise<StorageObject> {
    const fullKey = this.prefix + key
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        }),
      )

      if (!response.Body) {
        throw new Error('Empty body in S3 response')
      }

      return {
        body: response.Body.transformToWebStream(),
        metadata: {
          key,
          size: response.ContentLength ?? 0,
          etag: response.ETag,
          lastModified: response.LastModified ?? new Date(),
          contentType: response.ContentType,
          custom: response.Metadata,
        },
      }
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new StorageObjectNotFound(key)
      }
      throw new StorageGetFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  /**
   * Deletes an object from S3. This operation is idempotent; it returns
   * successfully even if the object does not exist.
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.prefix + key
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        }),
      )
    } catch (error) {
      throw new StorageDeleteFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  async head(key: string): Promise<StorageMetadata> {
    const fullKey = this.prefix + key
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        }),
      )

      return {
        key,
        size: response.ContentLength ?? 0,
        etag: response.ETag,
        lastModified: response.LastModified ?? new Date(),
        contentType: response.ContentType,
        custom: response.Metadata,
      }
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new StorageObjectNotFound(key)
      }
      throw new StorageHeadFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  list(prefix?: string): AsyncIterable<StorageEntry> {
    const searchPrefix = this.prefix + (prefix ?? '')
    const client = this.client
    const bucket = this.bucket
    const rootPrefix = this.prefix

    return (async function* () {
      let continuationToken: string | undefined
      try {
        do {
          const response = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: searchPrefix,
              ContinuationToken: continuationToken,
            }),
          )

          if (response.Contents) {
            for (const item of response.Contents) {
              if (item.Key) {
                yield {
                  key: item.Key.slice(rootPrefix.length),
                  size: item.Size ?? 0,
                  lastModified: item.LastModified ?? new Date(),
                }
              }
            }
          }

          continuationToken = response.NextContinuationToken
        } while (continuationToken)
      } catch (error) {
        throw new StorageListFailed(
          searchPrefix,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })()
  }

  async presign(key: string, options: PresignOptions): Promise<string> {
    const fullKey = this.prefix + key
    try {
      const command = options.method === 'PUT'
        ? new PutObjectCommand({ Bucket: this.bucket, Key: fullKey })
        : new GetObjectCommand({ Bucket: this.bucket, Key: fullKey })

      return await getSignedUrl(this.client, command, {
        expiresIn: options.expiresIn,
      })
    } catch (error) {
      throw new StoragePresignFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  close(): Promise<void> {
    return Promise.resolve()
  }

  private isNotFound(error: unknown): boolean {
    const err = error as {
      name?: string
      $metadata?: { httpStatusCode?: number }
    }
    return (
      err.name === 'NoSuchKey' ||
      err.name === 'NotFound' ||
      err.$metadata?.httpStatusCode === 404
    )
  }
}
