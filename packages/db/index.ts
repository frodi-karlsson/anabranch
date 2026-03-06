/**
 * @anabranch/db
 *
 * Database primitives with Task/Stream semantics for error-tolerant async operations.
 *
 * A **DBConnector** produces connected **DBAdapter** instances. Use connectors for
 * production code to properly manage connection lifecycles.
 *
 * @example
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
