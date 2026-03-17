/**
 * Cache adapter interface for cache-agnostic operations.
 *
 * Implement this interface to create drivers for specific cache backends.
 * The Cache class wraps adapters with Task semantics.
 */
export interface CacheAdapter {
  /** Retrieve a value by key. Returns null if the key does not exist or has expired. */
  get(key: string): Promise<unknown | null>

  /** Store a value with an optional TTL in milliseconds. */
  set(key: string, value: unknown, options?: SetOptions): Promise<void>

  /** Remove a key. No error if the key does not exist. */
  delete(key: string): Promise<void>

  /** Check whether a key exists and has not expired. */
  has(key: string): Promise<boolean>

  /** Release any resources held by this adapter instance. */
  close(): Promise<void>
}

/** Options for set operations. */
export interface SetOptions {
  /** Time-to-live in milliseconds. When omitted the entry does not expire. */
  ttl?: number
}

/**
 * Connector that produces connected CacheAdapter instances.
 *
 * Implement this to provide connection acquisition logic for your cache backend.
 */
export interface CacheConnector {
  /** Acquire a connected adapter. */
  connect(signal?: AbortSignal): Promise<CacheAdapter>

  /** Close all connections and clean up resources. */
  end(): Promise<void>
}
