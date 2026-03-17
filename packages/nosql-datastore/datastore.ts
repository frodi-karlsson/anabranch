import { Datastore, Key, Query } from '@google-cloud/datastore'
import type { DocumentAdapter } from '@anabranch/nosql'
import { DatastoreQueryFailed } from './errors.ts'
import { Source } from '@anabranch/anabranch'

/**
 * Datastore adapter implementing DocumentAdapter for @anabranch/nosql.
 */
export class DatastoreAdapter<TDoc>
  implements DocumentAdapter<TDoc, DatastoreQuery, DatastoreKey> {
  constructor(
    private readonly client: Datastore,
    private readonly kind: string,
  ) {}

  private buildKey(id: DatastoreKey): Key {
    if (Array.isArray(id)) {
      return this.client.key(id)
    }

    return this.client.key([this.kind, id])
  }

  async get(id: DatastoreKey): Promise<TDoc | null> {
    const key = this.buildKey(id)
    try {
      const [entity] = await this.client.get(key)
      return entity ? this.entityToDoc(entity, key) : null
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }
      throw new DatastoreQueryFailed(
        'get',
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  async put(id: DatastoreKey, doc: TDoc): Promise<void> {
    const key = this.buildKey(id)
    try {
      const entity = this.docToEntity(key, doc as Record<string, unknown>)
      await this.client.save(entity)
    } catch (error) {
      throw new DatastoreQueryFailed(
        'put',
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  async delete(id: DatastoreKey): Promise<void> {
    const key = this.buildKey(id)
    try {
      await this.client.delete(key)
    } catch (error) {
      if (isNotFound(error)) {
        return
      }
      throw new DatastoreQueryFailed(
        'delete',
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  async *query(queryBuilder: DatastoreQuery): AsyncIterable<TDoc> {
    try {
      let hasMore = true
      let currentQuery = queryBuilder(
        this.client.createQuery(this.kind),
        (id) => this.buildKey(id),
      )

      let total = 0
      let lastCursor: string | undefined
      while (hasMore) {
        const [entities, info] = await this.client.runQuery(currentQuery)

        for (const entity of entities) {
          if (currentQuery.limitVal >= 0 && total >= currentQuery.limitVal) {
            return
          }
          const key = entity[this.client.KEY]
          yield this.entityToDoc(entity, key)
          total++
        }

        if (
          info.moreResults !== this.client.NO_MORE_RESULTS &&
          info.moreResults !== this.client.MORE_RESULTS_AFTER_LIMIT &&
          info.endCursor &&
          info.endCursor !== lastCursor
        ) {
          lastCursor = info.endCursor
          currentQuery = queryBuilder(
            this.client.createQuery(this.kind).start(info.endCursor),
            (id) => this.buildKey(id),
          )
        } else {
          hasMore = false
        }
      }
    } catch (error) {
      throw new DatastoreQueryFailed(
        'query',
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  async putMany(entries: { key: DatastoreKey; doc: TDoc }[]): Promise<void> {
    const { errors } = await Source.fromArray(entries)
      .map(({ key, doc }) =>
        this.docToEntity(this.buildKey(key), doc as Record<string, unknown>)
      )
      .chunks(500)
      .map<void, unknown>(async (chunk) => {
        await this.client.save(chunk)
      })
      .partition()

    if (errors.length > 0) {
      const error = errors[0]
      throw new DatastoreQueryFailed(
        'putMany',
        error instanceof Error ? error.message : String(error),
        error,
      )
    }
  }

  private docToEntity(
    key: Key,
    doc: Record<string, unknown>,
  ): { key: Key; data: Record<string, unknown> } {
    const { _key, ...data } = doc
    return { key, data }
  }

  private entityToDoc(
    entity: Record<string, unknown>,
    key: Key,
  ): TDoc {
    return {
      ...entity,
      _key: key,
    } as TDoc
  }
}

function isNotFound(error: unknown): boolean {
  const err = error as { code?: number | string }
  return err.code === 404 || err.code === 'NOT_FOUND'
}

export type DatastoreQuery = (
  query: Query,
  key: (id: DatastoreKey) => Key,
) => Query
export type DatastoreKey = (string | number)[] | string | number
