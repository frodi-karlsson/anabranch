/**
 * @anabranch/db-postgres
 *
 * PostgreSQL connector for `@anabranch/db` with connection pooling,
 * cursor-based streaming, and pub/sub via LISTEN/NOTIFY.
 *
 * @example CRUD
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createPostgres } from "@anabranch/db-postgres";
 *
 * const connector = createPostgres({ connectionString: "postgresql://..." });
 * const users = await DB.withConnection(connector, (db) =>
 *   db.query<{ id: number; name: string }>("SELECT * FROM users")
 * ).run();
 * ```
 *
 * @example Pub/sub
 * ```ts
 * import { createPostgres } from "@anabranch/db-postgres";
 *
 * const connector = createPostgres({ connectionString: "postgresql://..." });
 *
 * const ch = await connector.listen("orders").run();
 * for await (const n of ch.successes()) {
 *   console.log(n.payload);
 * }
 *
 * await connector.notify("orders", JSON.stringify(order)).run();
 * ```
 *
 * @module
 */
export {
  createPostgres,
  type PostgresConnector,
  type PostgresOptions,
} from './postgres.ts'
