/**
 * @abranch/db
 *
 * Database primitives with Task/Stream semantics for error-tolerant async operations.
 *
 * ## Adapters vs Connectors
 *
 * A **DBConnector** produces connected **DBAdapter** instances. Use connectors for
 * production code to properly manage connection lifecycles:
 *
 * ```ts
 * import { DB, createInMemory } from "@anabranch/db";
 *
 * // Idiomatic usage with connector (recommended)
 * const result = await DB.withConnection(createInMemory(), (db) =>
 *   db.query("SELECT * FROM users")
 * ).run();
 *
 * // Bare adapter for testing or custom lifecycle management
 * const adapter = await createInMemory().connect();
 * const db = new DB(adapter);
 * ```
 *
 * ## Usage
 *
 * ```ts
 * import { DB, createInMemory } from "@anabranch/db";
 *
 * // Using withConnection for automatic lifecycle management
 * await DB.withConnection(createInMemory(), async (db) => {
 *   await db.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)").run();
 *   await db.execute("INSERT INTO users (name) VALUES (?)", ["Alice"]).run();
 *   return db.query("SELECT * FROM users").run();
 * }).run();
 *
 * // Stream large result sets
 * const { successes, errors } = await db.stream("SELECT * FROM users")
 *   .map(u => processUser(u))
 *   .partition();
 *
 * // Transactions with automatic rollback on error
 * const result = await DB.withConnection(createInMemory(), (db) =>
 *   db.withTransaction(async (tx) => {
 *     await tx.execute("INSERT INTO users (name) VALUES (?)", ["Bob"]).run();
 *     return tx.query("SELECT last_insert_rowid()").run();
 *   })
 * ).run();
 * ```
 *
 * ## Error Types
 *
 * The following error types are exported for adapter implementors:
 *
 * - {@link ConnectionFailed} - Throw from connector's `connect()` on failure
 * - {@link CloseError} - Throw from adapter's `close()` on failure
 * - {@link QueryFailed} - Thrown for query execution errors
 * - {@link ConstraintViolation} - Thrown for constraint violations (e.g., UNIQUE, FOREIGN KEY)
 * - {@link TransactionFailed} - Thrown for transaction errors
 *
 * @module
 */
export { DB, DBTransaction } from "./db.ts";
export type {
  DBAdapter,
  DBConnector,
  DBTransactionAdapter,
} from "./adapter.ts";
export * from "./errors.ts";
export { createInMemory } from "./sqlite.ts";
