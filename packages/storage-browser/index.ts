/**
 * @anabranch/storage-browser
 *
 * Browser storage adapter using IndexedDB for the @anabranch/storage package.
 * Works in browsers and Web Workers.
 *
 * ## Connector vs Adapter
 *
 * A **StorageConnector** produces connected **StorageAdapter** instances. Use
 * `createIndexedDB()` for production code to properly manage IndexedDB connections.
 *
 * ## Core Types
 *
 * - {@linkcode StorageConnector} - Connection factory for IndexedDB
 * - {@linkcode StorageAdapter} - Low-level storage operations (put, get, delete, head, list)
 *
 * ## Error Types
 *
 * All errors are typed for catchable handling:
 * - {@linkcode StorageObjectNotFound} - Object does not exist
 * - {@linkcode StoragePutFailed} - Put operation failed
 * - {@linkcode StorageGetFailed} - Get operation failed
 * - {@linkcode StorageDeleteFailed} - Delete operation failed
 * - {@linkcode StorageHeadFailed} - Head operation failed
 * - {@linkcode StorageListFailed} - List operation failed
 *
 * @example Basic put/get operations
 * ```ts
 * import { createIndexedDB } from "@anabranch/storage-browser";
 * import { Storage } from "@anabranch/storage";
 *
 * const connector = createIndexedDB({ prefix: "app/" });
 * const storage = await Storage.connect(connector).run();
 *
 * await storage.put("config.json", JSON.stringify({ theme: "dark" })).run();
 * const { body, metadata } = await storage.get("config.json").run();
 * ```
 *
 * @example Stream listing with concurrent processing
 * ```ts
 * const storage = await Storage.connect(createIndexedDB()).run();
 *
 * await storage.put("users/1.json", '{"name": "Alice"}');
 * await storage.put("users/2.json", '{"name": "Bob"}');
 *
 * const { successes } = await storage.list("users/")
 *   .withConcurrency(5)
 *   .map(async (entry) => await processEntry(entry))
 *   .partition();
 * ```
 *
 * @example Head request for metadata
 * ```ts
 * const metadata = await storage.head("config.json").run();
 * console.log(metadata.size, metadata.contentType);
 * ```
 *
 * @module
 */
export { createIndexedDB } from './connector.ts'
