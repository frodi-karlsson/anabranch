/**
 * @anabranch/db
 *
 * Database primitives with Task/Stream semantics for error-tolerant async operations.
 * Integrates with anabranch's {@link Task}, {@link Stream}, {@link Source}, and
 * {@link Channel} types for composable error handling and concurrent processing.
 *
 * ## Adapters vs Connectors
 *
 * A **DBConnector** produces connected **DBAdapter** instances. Use connectors for
 * production code to properly manage connection lifecycles:
 *
 * - **Connector**: Manages connection pool/lifecycle, produces adapters
 * - **Adapter**: Low-level query/execute/close interface
 * - **DB**: Wrapper providing Task/Stream semantics over an adapter
 *
 * ## Core Types
 *
 * - {@link DBConnector} - Interface for connection factories
 * - {@link DBAdapter} - Low-level database operations interface
 * - {@link DB} - High-level wrapper with Task/Stream methods
 * - {@link DBTransaction} - Transaction scope with commit/rollback
 *
 * ## Pub/Sub
 *
 * Connectors that support it expose `listen()` and `notify()` for PostgreSQL-style
 * pub/sub. The in-memory connector implements the same API for testing.
 *
 * - {@link Notification} - Notification received from a channel
 * - {@link ListenFailed} - Failed to establish or maintain a subscription
 *
 * ## Error Types
 *
 * All errors are typed for catchable handling:
 * - {@link ConnectionFailed} - Connection establishment failed
 * - {@link QueryFailed} - Query execution error
 * - {@link ConstraintViolation} - Constraint violation (UNIQUE, FOREIGN KEY, etc.)
 * - {@link TransactionFailed} - Transaction error
 * - {@link ListenFailed} - Pub/sub subscription failed
 *
 * @example Basic query with Task semantics
 * ```ts
 * import { DB, createInMemory } from "@anabranch/db";
 *
 * const users = await DB.withConnection(createInMemory(), (db) =>
 *   db.query("SELECT * FROM users WHERE active = ?", [true])
 * ).run();
 * ```
 *
 * @example Streaming large result sets with error collection
 * ```ts
 * import { DB, createInMemory } from "@anabranch/db";
 *
 * const { successes, errors } = await DB.withConnection(createInMemory(), (db) =>
 *   db.stream("SELECT * FROM large_table")
 *     .withConcurrency(10)
 *     .map(row => processRow(row))
 *     .partition()
 * ).run();
 * ```
 *
 * @example Transactions with automatic rollback on error
 * ```ts
 * import { DB, ConstraintViolation, createInMemory } from "@anabranch/db";
 *
 * const result = await DB.withConnection(createInMemory(), (db) =>
 *   db.withTransaction(async (tx) => {
 *     await tx.execute("INSERT INTO orders (user_id) VALUES (?)", [userId]);
 *     await tx.execute("UPDATE users SET order_count = order_count + 1 WHERE id = ?", [userId]);
 *     return tx.query("SELECT last_insert_rowid()");
 *   })
 * ).recoverWhen(
 *   (e) => e instanceof ConstraintViolation,
 *   (e) => ({ id: 0, error: e.message })
 * ).run();
 * ```
 *
 * @example Retry with exponential backoff
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createPostgres } from "@anabranch/db-postgres";
 *
 * const users = await DB.withConnection(createPostgres(), (db) =>
 *   db.query("SELECT * FROM users")
 *     .retry({ attempts: 3, delay: (attempt) => 100 * Math.pow(2, attempt) })
 * ).run();
 * ```
 *
 * @example Pub/sub with in-memory connector (swap for createPostgres in production)
 * ```ts
 * import { createInMemory } from "@anabranch/db";
 *
 * const connector = createInMemory();
 * const ch = await connector.listen("orders").run();
 *
 * await connector.notify("orders", JSON.stringify({ id: 1 })).run();
 *
 * for await (const n of ch.successes()) {
 *   console.log(n.payload);
 * }
 * ```
 *
 * @module
 */
/** A notification received from a pub/sub channel. */
export type Notification = {
  /** The channel the notification was sent to. */
  channel: string
  /** The payload string. */
  payload: string
}

export { DB, DBTransaction } from './db.ts'
export type { DBAdapter, DBConnector, DBTransactionAdapter } from './adapter.ts'
export * from './errors.ts'
export { createInMemory } from './in-memory.ts'
