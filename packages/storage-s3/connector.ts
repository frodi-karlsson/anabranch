import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent } from "node:https";
import { Agent as HttpAgent } from "node:http";
import type { StorageConnector, StorageOptions } from "@anabranch/storage";
import { S3Adapter } from "./s3.ts";

/** Options for creating an S3 storage connector. */
export interface S3StorageOptions extends StorageOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  forcePathStyle?: boolean;
  /**
   * Whether to use connection pooling. Defaults to true.
   * Disable this in tests to avoid TCP resource leaks.
   */
  pooled?: boolean;
}

/**
 * Creates a {@link StorageConnector} for AWS S3 and compatible services.
 */
export function createS3(options: S3StorageOptions): StorageConnector {
  const pooled = options.pooled ?? true;

  const client = new S3Client({
    region: options.region ?? "us-east-1",
    endpoint: options.endpoint,
    credentials: options.credentials,
    forcePathStyle: options.forcePathStyle,
    requestHandler: pooled ? undefined : new NodeHttpHandler({
      httpAgent: new HttpAgent({ keepAlive: false }),
      httpsAgent: new Agent({ keepAlive: false }),
    }),
  });

  return {
    connect: () =>
      Promise.resolve(
        new S3Adapter(client, options.bucket, options.prefix ?? ""),
      ),
    end: () => {
      client.destroy();
      return Promise.resolve();
    },
  };
}
