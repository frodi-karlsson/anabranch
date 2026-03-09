import { Storage as GcsClient } from '@google-cloud/storage'
import type { StorageConnector, StorageOptions } from '@anabranch/storage'
import { GcsAdapter } from './gcs.ts'

/** Options for creating a GCS storage connector. */
export interface GcsStorageOptions extends StorageOptions {
  bucket: string
  projectId?: string
  apiEndpoint?: string
  keyFilename?: string
  credentials?: {
    client_email?: string
    private_key?: string
  }
}

/**
 * Creates a {@link StorageConnector} for Google Cloud Storage.
 */
export function createGcs(options: GcsStorageOptions): StorageConnector {
  const client = new GcsClient({
    projectId: options.projectId,
    apiEndpoint: options.apiEndpoint,
    keyFilename: options.keyFilename,
    credentials: options.credentials,
  })

  return {
    connect: () =>
      Promise.resolve(
        new GcsAdapter(client, options.bucket, options.prefix ?? ''),
      ),
    end: () => {
      // GcsClient doesn't have a specific end/close method that needs to be called
      return Promise.resolve()
    },
  }
}
