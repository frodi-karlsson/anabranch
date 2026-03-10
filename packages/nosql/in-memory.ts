import type { DocumentAdapter, DocumentConnector } from './document.ts'

/**
 * Creates an in-memory NoSQL document store for testing and development.
 *
 * Documents are stored in a Map and will be lost when the process exits.
 * Queries use predicate functions to filter documents.
 *
 * @example Basic usage
 * ```ts
 * import { Collection, createInMemory } from "@anabranch/nosql";
 *
 * const connector = createInMemory<User, (u: User) => boolean, string>();
 * const users = await Collection.connect(connector, "users").run();
 *
 * await users.put("user-1", { name: "Alice", status: "active" }).run();
 * const user = await users.get("user-1").run();
 * ```
 *
 * @example Query with predicate
 * ```ts
 * const activeUsers = await users
 *   .find((u) => u.status === "active")
 *   .map((u) => u.name)
 *   .collect();
 * ```
 */
export function createInMemory<
  TDoc,
  TKey,
  TQuery extends InMemoryQuery<TDoc> = InMemoryQuery<TDoc>,
>(): InMemoryConnector<TDoc, TQuery, TKey> {
  const docs = new Map<TKey, TDoc>()
  let ended = false

  const adapter: DocumentAdapter<TDoc, TQuery, TKey> = {
    get(key: TKey): Promise<TDoc | null> {
      if (ended) return Promise.reject(new Error('Connector ended'))
      return Promise.resolve(docs.get(key) ?? null)
    },

    put(key: TKey, doc: TDoc): Promise<void> {
      if (ended) return Promise.reject(new Error('Connector ended'))
      docs.set(key, doc)
      return Promise.resolve()
    },

    delete(key: TKey): Promise<void> {
      if (ended) return Promise.reject(new Error('Connector ended'))
      docs.delete(key)
      return Promise.resolve()
    },

    async *query(predicate: TQuery): AsyncIterable<TDoc> {
      if (ended) throw new Error('Connector ended')
      for (const doc of docs.values()) {
        if (ended) throw new Error('Connector ended')
        if (predicate(doc)) {
          yield doc
        }
      }
    },

    putMany(entries: { key: TKey; doc: TDoc }[]): Promise<void> {
      if (ended) return Promise.reject(new Error('Connector ended'))
      for (const entry of entries) {
        docs.set(entry.key, entry.doc)
      }
      return Promise.resolve()
    },
  }

  return {
    connect(): Promise<DocumentAdapter<TDoc, TQuery, TKey>> {
      if (ended) {
        return Promise.reject(new Error('Connector ended'))
      }
      return Promise.resolve(adapter)
    },
    end(): Promise<void> {
      ended = true
      return Promise.resolve()
    },
  }
}

/**
 * Connector interface for the in-memory document store.
 */
export interface InMemoryConnector<TDoc, TQuery, TKey>
  extends DocumentConnector<TDoc, TQuery, TKey> {}

/**
 * Predicate function type for filtering documents in the in-memory store.
 */
export type InMemoryQuery<TDoc> = (doc: TDoc) => boolean
