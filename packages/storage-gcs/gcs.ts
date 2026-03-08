import { Storage as GcsClient } from "@google-cloud/storage";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import type {
  BodyInput,
  PresignableAdapter,
  PresignOptions,
  PutOptions,
  StorageEntry,
  StorageMetadata,
  StorageObject,
} from "@anabranch/storage";
import {
  StorageDeleteFailed,
  StorageGetFailed,
  StorageHeadFailed,
  StorageListFailed,
  StorageObjectNotFound,
  StoragePresignFailed,
  StoragePutFailed,
} from "@anabranch/storage";

/**
 * Adapter for Google Cloud Storage.
 */
export class GcsAdapter implements PresignableAdapter {
  constructor(
    private readonly client: GcsClient,
    private readonly bucketName: string,
    private readonly prefix: string,
  ) {}

  async put(key: string, body: BodyInput, options?: PutOptions): Promise<void> {
    const fullKey = this.prefix + key;
    const bucket = this.client.bucket(this.bucketName);
    const file = bucket.file(fullKey);

    try {
      if (body instanceof ReadableStream) {
        const nodeReadable = Readable.fromWeb(
          body as import("node:stream/web").ReadableStream,
        );
        await new Promise<void>((resolve, reject) => {
          const writeStream = file.createWriteStream({
            resumable: false,
            metadata: {
              contentType: options?.contentType,
              metadata: options?.custom,
            },
          });
          nodeReadable.pipe(writeStream)
            .on("finish", resolve)
            .on("error", reject);
        });
      } else {
        await file.save(body as string | Buffer, {
          resumable: false,
          metadata: {
            contentType: options?.contentType,
            metadata: options?.custom,
          },
        });
      }
    } catch (error) {
      throw new StoragePutFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  async get(key: string): Promise<StorageObject> {
    const fullKey = this.prefix + key;
    const bucket = this.client.bucket(this.bucketName);
    const file = bucket.file(fullKey);

    try {
      const [metadata] = await file.getMetadata();
      const nodeReadable = file.createReadStream();
      const body = Readable.toWeb(nodeReadable) as ReadableStream;

      return {
        body,
        metadata: {
          key,
          size: Number(metadata.size) || 0,
          etag: metadata.etag,
          lastModified: metadata.updated
            ? new Date(metadata.updated)
            : new Date(),
          contentType: metadata.contentType,
          custom: this.mapMetadata(metadata.metadata),
        },
      };
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new StorageObjectNotFound(key);
      }
      throw new StorageGetFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  /**
   * Deletes an object from GCS. This operation is idempotent; it returns
   * successfully even if the object does not exist.
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.prefix + key;
    const bucket = this.client.bucket(this.bucketName);
    const file = bucket.file(fullKey);

    try {
      await file.delete();
    } catch (error) {
      if (this.isNotFound(error)) {
        return;
      }
      throw new StorageDeleteFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  async head(key: string): Promise<StorageMetadata> {
    const fullKey = this.prefix + key;
    const bucket = this.client.bucket(this.bucketName);
    const file = bucket.file(fullKey);

    try {
      const [metadata] = await file.getMetadata();

      return {
        key,
        size: Number(metadata.size) || 0,
        etag: metadata.etag,
        lastModified: metadata.updated
          ? new Date(metadata.updated)
          : new Date(),
        contentType: metadata.contentType,
        custom: this.mapMetadata(metadata.metadata),
      };
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new StorageObjectNotFound(key);
      }
      throw new StorageHeadFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  list(prefix?: string): AsyncIterable<StorageEntry> {
    const searchPrefix = this.prefix + (prefix ?? "");
    const bucket = this.client.bucket(this.bucketName);
    const rootPrefix = this.prefix;

    return (async function* () {
      try {
        let pageToken: string | undefined;
        do {
          const [files, nextQuery] = await bucket.getFiles({
            prefix: searchPrefix,
            autoPaginate: false,
            pageToken,
          });

          for (const file of files) {
            const metadata = file.metadata;
            yield {
              key: file.name.slice(rootPrefix.length),
              size: Number(metadata.size) || 0,
              lastModified: metadata.updated
                ? new Date(metadata.updated)
                : new Date(),
            };
          }

          pageToken = (nextQuery as { pageToken?: string })?.pageToken;
        } while (pageToken);
      } catch (error) {
        throw new StorageListFailed(
          searchPrefix,
          error instanceof Error ? error.message : String(error),
          error,
        );
      }
    })();
  }

  async presign(key: string, options: PresignOptions): Promise<string> {
    const fullKey = this.prefix + key;
    const bucket = this.client.bucket(this.bucketName);
    const file = bucket.file(fullKey);

    try {
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: options.method === "PUT" ? "write" : "read",
        expires: Date.now() + options.expiresIn * 1000,
      });
      return url;
    } catch (error) {
      throw new StoragePresignFailed(
        key,
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  private mapMetadata(
    metadata?: Record<string, string | number | boolean | null>,
  ): Record<string, string> | undefined {
    if (!metadata) return undefined;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== null && value !== undefined) {
        result[key] = String(value);
      }
    }
    return result;
  }

  private isNotFound(error: unknown): boolean {
    const err = error as { code?: number | string };
    return err.code === 404 || err.code === "404";
  }
}
