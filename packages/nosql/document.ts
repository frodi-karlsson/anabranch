/**
 * Document adapter interface for NoSQL database operations.
 *
 * Implement this interface to create drivers for specific document stores
 * (e.g., Google Cloud Datastore, DynamoDB, Firestore).
 * The Collection class wraps adapters with Task/Stream semantics.
 *
 * For connection lifecycle management, use DocumentConnector which produces adapters.
 */
export interface DocumentAdapter<TDoc, TQuery, TKey> {
  /**
   * Fetches a single document by its primary key/reference.
   */
  get(key: TKey): Promise<TDoc | null>

  /**
   * Upserts a document.
   */
  put(key: TKey, doc: TDoc): Promise<void>

  /**
   * Deletes a document by its key.
   */
  delete(key: TKey): Promise<void>

  /**
   * Executes a native query and yields results as an AsyncIterable.
   * The adapter handles underlying pagination (e.g., Datastore's endCursor
   * or DynamoDB's LastEvaluatedKey) internally.
   */
  query(query: TQuery): AsyncIterable<TDoc>

  /**
   * Batch writes multiple documents.
   */
  putMany(entries: { key: TKey; doc: TDoc }[]): Promise<void>
}

/**
 * Connector that produces connected DocumentAdapter instances.
 *
 * Implement this to provide connection acquisition logic for your document store.
 * Handles connection creation, pool management, and cleanup on end().
 */
export interface DocumentConnector<TDoc, TQuery, TKey> {
  /**
   * Acquires a connected adapter.
   * @throws Error if connection cannot be established
   */
  connect(): Promise<DocumentAdapter<TDoc, TQuery, TKey>>

  /**
   * Closes all connections and cleans up resources.
   * After calling end(), the connector cannot be used to create new adapters.
   */
  end(): Promise<void>
}
