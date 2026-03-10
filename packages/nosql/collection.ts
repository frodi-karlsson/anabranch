import { Source, Task } from '@anabranch/anabranch'
import type { DocumentAdapter, DocumentConnector } from './document.ts'
import {
  CollectionConnectionFailed,
  CollectionDeleteFailed,
  CollectionFindFailed,
  CollectionGetFailed,
  CollectionPutFailed,
  CollectionPutManyFailed,
} from './errors.ts'

/**
 * A NoSQL document collection with Task/Stream semantics.
 *
 * Provides CRUD operations (`get`, `put`, `delete`) that return {@linkcode Task}
 * for error handling, and `find()` which returns a {@linkcode Source} for streaming
 * query results with concurrent processing support.
 *
 * @example Create from adapter
 * ```ts
 * import { Collection, createInMemory } from "@anabranch/nosql";
 *
 * const connector = createInMemory<User, (u: User) => boolean, string>();
 * const adapter = await connector.connect();
 * const users = Collection.create(adapter, "users");
 * ```
 *
 * @example Connect via connector
 * ```ts
 * const connector = createInMemory<User, (u: User) => boolean, string>();
 * const users = await Collection.connect(connector, "users").run();
 * ```
 */
export class Collection<TDoc, TQuery, TKey> {
  private constructor(
    private adapter: DocumentAdapter<TDoc, TQuery, TKey>,
    private name: string,
  ) {}

  /**
   * Creates a Collection from an already-connected adapter.
   */
  public static create<TDoc, TQuery, TKey>(
    adapter: DocumentAdapter<TDoc, TQuery, TKey>,
    name: string,
  ): Collection<TDoc, TQuery, TKey> {
    return new Collection(adapter, name)
  }

  /**
   * Connects to a collection via a connector and returns a Collection.
   */
  public static connect<TDoc, TQuery, TKey>(
    connector: DocumentConnector<TDoc, TQuery, TKey>,
    name: string,
  ): Task<Collection<TDoc, TQuery, TKey>, CollectionConnectionFailed> {
    return Task.of(async () => new Collection(await connector.connect(), name))
      .mapErr((error) =>
        new CollectionConnectionFailed(
          name,
          error instanceof Error ? error.message : String(error),
        )
      )
  }

  /**
   * Fetches a single document by its key.
   */
  public get(key: TKey): Task<TDoc | null, CollectionGetFailed> {
    return Task.of(() => this.adapter.get(key)).mapErr((error) =>
      new CollectionGetFailed(
        this.name,
        key,
        error instanceof Error ? error.message : String(error),
      )
    )
  }

  /**
   * Upserts a document.
   */
  public put(key: TKey, doc: TDoc): Task<void, CollectionPutFailed> {
    return Task.of(() => this.adapter.put(key, doc)).mapErr((error) =>
      new CollectionPutFailed(
        this.name,
        key,
        error instanceof Error ? error.message : String(error),
      )
    )
  }

  /**
   * Batch writes multiple documents.
   */
  public putMany(
    entries: { key: TKey; doc: TDoc }[],
  ): Task<void, CollectionPutManyFailed> {
    return Task.of(() => this.adapter.putMany(entries)).mapErr((error) =>
      new CollectionPutManyFailed(
        this.name,
        error instanceof Error ? error.message : String(error),
      )
    )
  }

  /**
   * Deletes a document by its key.
   */
  public delete(key: TKey): Task<void, CollectionDeleteFailed> {
    return Task.of(() => this.adapter.delete(key)).mapErr((error) =>
      new CollectionDeleteFailed(
        this.name,
        key,
        error instanceof Error ? error.message : String(error),
      )
    )
  }

  /**
   * Queries documents and returns a stream of results.
   */
  public find(query: TQuery): Source<TDoc, CollectionFindFailed> {
    const adapter = this.adapter
    const name = this.name
    return Source.from(async function* () {
      try {
        for await (const doc of adapter.query(query)) {
          yield doc
        }
      } catch (error) {
        throw new CollectionFindFailed(
          name,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }
}
