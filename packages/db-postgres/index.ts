/**
 * @anabranch/db-postgres
 *
 * PostgreSQL database connector for the @anabranch/db package using `node:pg`.
 *
 * Provides a `DBConnector` implementation with connection pooling and
 * cursor-based streaming via `pg-cursor` for memory-efficient processing
 * of large result sets.
 *
 * @example
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createPostgres } from "@anabranch/db-postgres";
 *
 * const db = DB.from(
 *   await createPostgres({
 *     connectionString: "postgresql://user:pass@localhost:5432/mydb",
 *   }).connect(),
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
  createPostgres,
  type PostgresConnector,
  type PostgresOptions,
} from './postgres.ts'
