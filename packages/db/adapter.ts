/**
 * Database adapter interface for DB-agnostic operations.
 *
 * Implement this interface to create drivers for specific databases.
 * The DB class wraps adapters with Task/Stream semantics.
 *
 * Adapters that support cursor-based streaming should implement the optional
 * stream method. Adapters without stream buffer the full result set in memory.
 *
 * For connection lifecycle management, use DBConnector which produces adapters.
 * The adapter's close() method releases the connection (e.g., back to a pool)
 * rather than terminating it — termination is the connector's responsibility.
 */
export interface DBAdapter {
  /** Execute a SELECT query and return rows. */
  // deno-lint-ignore no-explicit-any
  query<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>

  /** Execute INSERT/UPDATE/DELETE and return affected row count. */
  execute(sql: string, params?: unknown[]): Promise<number>

  /**
   * Release the connection back to its source (e.g., pool).
   * For pooled connections, this returns the client to the pool.
   * For single connections, this may close the underlying connection.
   */
  close(): Promise<void>

  /**
   * Stream rows from a SELECT query using a cursor.
   * If not implemented, the DB class falls back to buffering the full result.
   */
  // deno-lint-ignore no-explicit-any
  stream?<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): AsyncIterable<T>
}

/**
 * Connector that produces connected DBAdapter instances.
 *
 * Implement this to provide connection acquisition logic for your database.
 * Handles pool checkout, connection creation, and termination on error.
 */
export interface DBConnector {
  /**
   * Acquire a connected adapter.
   * @param signal Optional AbortSignal for cancellation
   * @throws ConnectionFailed if the connection cannot be established
   */
  connect(signal?: AbortSignal): Promise<DBAdapter>
}

/** Transaction adapter interface. */
export interface DBTransactionAdapter {
  // deno-lint-ignore no-explicit-any
  query<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<number>
  commit(): Promise<void>
  rollback(): Promise<void>
}
