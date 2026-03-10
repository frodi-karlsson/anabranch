/**
 * @anabranch/nosql
 *
 * NoSQL document collection primitives with Task/Stream semantics.
 * Integrates with anabranch's {@linkcode Task}, {@linkcode Source}, and
 * {@linkcode Stream} types for composable error handling and processing.
 *
 * ## Adapters vs Connectors
 *
 * A **DocumentConnector** produces connected **DocumentAdapter** instances:
 *
 * - **Connector**: Manages connection pool/lifecycle, produces adapters
 * - **Adapter**: Low-level get/put/delete/query interface
 * - **Collection**: Wrapper providing Task/Stream methods over an adapter
 *
 * ## Core Types
 *
 * - {@link DocumentConnector} - Interface for connection factories
 * - {@link DocumentAdapter} - Low-level document operations interface
 * - {@link Collection} - High-level wrapper with Task/Stream methods
 *
 * ## Error Types
 *
 * - {@link CollectionConnectionFailed} - Connection establishment failed
 * - {@link CollectionGetFailed} - Get operation failed
 * - {@link CollectionPutFailed} - Put operation failed
 * - {@link CollectionPutManyFailed} - Batch put failed
 * - {@link CollectionDeleteFailed} - Delete operation failed
 * - {@link CollectionFindFailed} - Query operation failed
 *
 * @example Basic CRUD with Collection
 * ```ts
 * import { Collection, createInMemory } from "@anabranch/nosql";
 *
 * interface User {
 *   name: string
 *   status: "active" | "pending" | "inactive"
 * }
 *
 * const connector = createInMemory<User, string>();
 * const users = await Collection.connect(connector, "users").run();
 *
 * await users.put("user-1", { name: "Alice", status: "active" }).run();
 * const user = await users.get("user-1").run();
 * console.log(user?.name); // "Alice"
 * ```
 *
 * @example Query with predicate
 * ```ts
 * const connector = createInMemory<User, string>();
 * const users = await Collection.connect(connector, "users").run();
 *
 * const activeUsers = await users
 *   .find((u) => u.status === "active")
 *   .map((u) => u.name)
 *   .collect();
 * ```
 *
 * @example Stream with concurrent processing
 * ```ts
 * const { successes, errors } = await users
 *   .find(() => true)
 *   .withConcurrency(5)
 *   .map(async (user) => await sendWelcomeEmail(user))
 *   .partition();
 *
 * console.log(`${successes.length} processed, ${errors.length} failed`);
 * ```
 *
 * @module
 */
export { Collection } from './collection.ts'
export type { DocumentAdapter, DocumentConnector } from './document.ts'
export * from './errors.ts'
export { createInMemory } from './in-memory.ts'
export type { InMemoryConnector, InMemoryQuery } from './in-memory.ts'
export { Source, Task } from '@anabranch/anabranch'
