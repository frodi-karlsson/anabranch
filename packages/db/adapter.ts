/**
 * Database adapter interface for DB-agnostic operations.
 */
export interface DBAdapter {
  /**
   * Execute a SELECT query and return rows.
   */
  // deno-lint-ignore no-explicit-any
  query<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>

  /**
   * Execute INSERT/UPDATE/DELETE and return affected row count.
   */
  execute(sql: string, params?: unknown[]): Promise<number>

  /**
   * Execute multiple commands in a batch.
   * Implementation should optimize this if possible (e.g. using prepared statements or multi-row inserts).
   */
  executeBatch(sql: string, paramsArray: unknown[][]): Promise<number[]>

  /**
   * Release the connection back to its source (e.g., pool).
   */
  close(): Promise<void>

  /**
   * Stream rows from a SELECT query using a cursor.
   */
  // deno-lint-ignore no-explicit-any
  stream?<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): AsyncIterable<T>
}

/**
 * Connector that produces connected DBAdapter instances.
 */
export interface DBConnector {
  /**
   * Acquire a connected adapter.
   * @throws ConnectionFailed if the connection cannot be established
   */
  connect(signal?: AbortSignal): Promise<DBAdapter>
}

/**
 * Transaction adapter interface.
 */
export interface DBTransactionAdapter {
  /**
   * Execute a SELECT query and return rows.
   */
  // deno-lint-ignore no-explicit-any
  query<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>

  /**
   * Execute INSERT/UPDATE/DELETE and return affected row count.
   */
  execute(sql: string, params?: unknown[]): Promise<number>

  /**
   * Execute multiple commands in a batch.
   */
  executeBatch(sql: string, paramsArray: unknown[][]): Promise<number[]>

  /**
   * Commit the transaction.
   */
  commit(): Promise<void>

  /**
   * Rollback the transaction.
   */
  rollback(): Promise<void>
}
