import type { CacheAdapter, CacheConnector, SetOptions } from './adapter.ts'

/**
 * Creates an in-memory cache connector for testing and development.
 *
 * @example
 * ```ts
 * import { Cache, createInMemory } from "@anabranch/cache";
 *
 * const cache = await Cache.connect(createInMemory()).run();
 * await cache.set("key", "value", { ttl: 5000 }).run();
 * ```
 */
export function createInMemory(): InMemoryConnector {
  const store = new Map<string, { value: unknown; expiresAt: number | null }>()

  return {
    connect(): Promise<CacheAdapter> {
      return Promise.resolve({
        get(key: string): Promise<unknown | null> {
          const entry = store.get(key)
          if (!entry) return Promise.resolve(null)
          if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
            store.delete(key)
            return Promise.resolve(null)
          }
          return Promise.resolve(entry.value)
        },

        set(key: string, value: unknown, options?: SetOptions): Promise<void> {
          const expiresAt = options?.ttl ? Date.now() + options.ttl : null
          store.set(key, { value, expiresAt })
          return Promise.resolve()
        },

        delete(key: string): Promise<void> {
          store.delete(key)
          return Promise.resolve()
        },

        has(key: string): Promise<boolean> {
          const entry = store.get(key)
          if (!entry) return Promise.resolve(false)
          if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
            store.delete(key)
            return Promise.resolve(false)
          }
          return Promise.resolve(true)
        },

        close(): Promise<void> {
          return Promise.resolve()
        },
      })
    },

    end(): Promise<void> {
      store.clear()
      return Promise.resolve()
    },
  }
}

/** In-memory cache connector. */
export interface InMemoryConnector extends CacheConnector {
  connect(): Promise<CacheAdapter>
  end(): Promise<void>
}
