/**
 * Google Cloud Datastore adapter for @anabranch/nosql.
 *
 * Provides a DocumentAdapter implementation using the Datastore API with
 * support for batch operations, queries with filters, and streaming results.
 *
 * @example Basic CRUD
 * ```ts
 * import { createDatastore, PropertyFilter } from "@anabranch/nosql-datastore";
 * import { Collection } from "@anabranch/nosql";
 *
 * const connector = createDatastore<User>({
 *   projectId: "my-project",
 *   kind: "User"
 * });
 *
 * const users = await Collection.connect(connector, "users").run();
 *
 * await users.put("alice@example.com", {
 *   name: "Alice",
 *   email: "alice@example.com",
 *   status: "active"
 * }).run();
 *
 * const user = await users.get("alice@example.com").run();
 * ```
 *
 * @example Query with filters
 * ```ts
 * const activeUsers = await users
 *   .find((q) => q.filter(new PropertyFilter("status", "=", "active")))
 *   .map((u) => u.name)
 *   .collect();
 * ```
 *
 * @module
 */
export { DatastoreAdapter } from './datastore.ts'
export type { DatastoreOptions } from './connector.ts'
export { createDatastore } from './connector.ts'
export { Datastore, Key, Query } from '@google-cloud/datastore'
export * from './errors.ts'
export { PropertyFilter } from '@google-cloud/datastore'
