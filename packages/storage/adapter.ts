/**
 * Input body types for put operations.
 */
export type BodyInput = Uint8Array | ReadableStream | string;

/**
 * Object metadata returned by head operations and included with get results.
 */
export interface StorageMetadata {
  key: string;
  size: number;
  etag?: string;
  lastModified: Date;
  contentType?: string;
  custom?: Record<string, string>;
}

/**
 * Object returned by get operations, containing a body stream and metadata.
 */
export interface StorageObject {
  body: ReadableStream;
  metadata: StorageMetadata;
}

/**
 * Entry returned by list operations.
 */
export interface StorageEntry {
  key: string;
  size: number;
  lastModified: Date;
}

/** Options for put operations. */
export interface PutOptions {
  contentType?: string;
  custom?: Record<string, string>;
}

/** Options for presign operations. */
export interface PresignOptions {
  expiresIn: number;
  method?: "GET" | "PUT";
}

/**
 * Low-level storage adapter interface.
 * Implement this to create drivers for specific storage backends.
 */
export interface StorageAdapter {
  /** Put an object into storage. */
  put(key: string, body: BodyInput, options?: PutOptions): Promise<void>;
  /** Get an object from storage. */
  get(key: string): Promise<StorageObject>;
  /** Delete an object from storage. */
  delete(key: string): Promise<void>;
  /** Get metadata without fetching the body. */
  head(key: string): Promise<StorageMetadata>;
  /** List objects with optional prefix. */
  list(prefix?: string): AsyncIterable<StorageEntry>;
  /** Release the connection back to its source. */
  close(): Promise<void>;
}

/**
 * Extended adapter interface for backends that support presigned URLs.
 */
export interface PresignableAdapter extends StorageAdapter {
  /** Generate a presigned URL for direct access. */
  presign(key: string, options?: PresignOptions): Promise<string>;
}

/** Connector that produces connected StorageAdapter instances. */
export interface StorageConnector {
  /** Acquire a connected adapter. */
  connect(signal?: AbortSignal): Promise<StorageAdapter>;
  /** Close all connections and clean up resources. */
  end(): Promise<void>;
}

/** Storage configuration options. */
export interface StorageOptions {
  /** Prefix for all keys in this storage. */
  prefix?: string;
}
