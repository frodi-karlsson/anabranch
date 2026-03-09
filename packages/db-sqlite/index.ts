/**
 * @anabranch/db-sqlite
 *
 * SQLite database connector for the @anabranch/db package using Node.js built-in
 * `node:sqlite`.
 *
 * Provides a `DBConnector` implementation using SQLite's synchronous database
 * for in-memory or file-based databases. Ideal for testing or lightweight
 * applications.
 *
 * @example
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createSqlite } from "@anabranch/db-sqlite";
 *
 * const db = new DB(
 *   await createSqlite({ filename: "./mydb.sqlite" }).connect(),
 * );
 *
 * const users = await db
 *   .query<{ id: number; name: string }>("SELECT * FROM users")
 *   .run();
 * ```
 *
 * @module
 */
export {
  createSqlite,
  type SQLiteConnector,
  type SQLiteOptions,
} from './sqlite.ts'
