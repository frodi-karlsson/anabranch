/**
 * @anabranch/db-mysql
 *
 * MySQL database connector for the @anabranch/db package using `mysql2`.
 *
 * Provides a `DBConnector` implementation with connection pooling for MySQL
 * databases. Supports transactions with automatic rollback on error.
 *
 * @example
 * ```ts
 * import { DB } from "@anabranch/db";
 * import { createMySQL } from "@anabranch/db-mysql";
 *
 * const db = new DB(
 *   await createMySQL({
 *     connectionString: "mysql://user:pass@localhost:3306/mydb",
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
export { createMySQL, type MySQLConnector, type MySQLOptions } from './mysql.ts'
