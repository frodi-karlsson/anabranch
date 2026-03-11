/**
 * @anabranch/storage
 *
 * Storage primitives with Task/Stream semantics for error-tolerant object operations.
 * Integrates with anabranch's {@linkcode Task}, {@linkcode Stream}, {@linkcode Source},
 * and {@linkcode Channel} types for composable error handling and concurrent processing.
 *
 * ## Adapters vs Connectors
 *
 * A **StorageConnector** produces connected **StorageAdapter** instances. Use connectors
 * for production code to properly manage connection lifecycles:
 *
 * - **Connector**: Manages connection pool/lifecycle, produces adapters
 * - **Adapter**: Low-level put/get/delete/list interface
 * - **Storage**: High-level wrapper with Task/Stream methods
 *
 * ## Core Types
 *
 * - {@link StorageConnector} - Interface for connection factories
 * - {@link StorageAdapter} - Low-level storage operations interface
 * - {@link StorageObject} - Retrieved object with body stream and metadata
 * - {@link StorageMetadata} - Object metadata (size, contentType, etag, etc.)
 *
 * ## Error Types
 *
 * All errors are typed for catchable handling:
 * - {@link StorageConnectionFailed} - Connection establishment failed
 * - {@link StorageObjectNotFound} - Object does not exist
 * - {@link StoragePutFailed} - Put operation failed
 * - {@link StorageGetFailed} - Get operation failed
 * - {@link StorageDeleteFailed} - Delete operation failed
 * - {@link StorageHeadFailed} - Head operation failed
 *
 * @example Basic put/get operations with Storage wrapper
 * ```ts
 * import { Storage, createInMemory } from "@anabranch/storage";
 *
 * const connector = createInMemory({ prefix: "files/" });
 * const storage = await Storage.connect(connector).run();
 *
 * await storage.put("hello.txt", "Hello, World!").run();
 * const object = await storage.get("hello.txt").run();
 * console.log(await new Response(object.body).text());
 * ```
 *
 * @example Stream listing with concurrent processing
 * ```ts
 * const connector = createInMemory();
 * const storage = await Storage.connect(connector).run();
 *
 * await storage.put("users/1.json", '{"name": "Alice"}');
 * await storage.put("users/2.json", '{"name": "Bob"}');
 *
 * const { successes, errors } = await storage.list("users/")
 *   .withConcurrency(5)
 *   .map(async (entry) => await processEntry(entry))
 *   .tapErr((err) => console.error("Failed:", err))
 *   .partition();
 * ```
 *
 * @example Head request for metadata
 * ```ts
 * import { Storage, createInMemory } from "@anabranch/storage";
 *
 * const connector = createInMemory();
 * const storage = await Storage.connect(connector).run();
 *
 * await storage.put("image.png", imageBytes, { contentType: "image/png" }).run();
 * const metadata = await storage.head("image.png").run();
 * console.log(metadata.contentType, metadata.size);
 * ```
 *
 * @example With retry and timeout
 * ```ts
 * await storage.put("important.txt", data)
 *   .retry({ attempts: 3, delay: (attempt) => 100 * Math.pow(2, attempt) })
 *   .timeout(30_000)
 *   .run();
 * ```
 *
 * @module
 */
export { Storage } from './storage.ts'
export type {
  BodyInput,
  PresignableAdapter,
  PresignOptions,
  PutOptions,
  StorageAdapter,
  StorageConnector,
  StorageEntry,
  StorageMetadata,
  StorageObject,
  StorageOptions,
} from './adapter.ts'
export * from './errors.ts'
export { createInMemory } from './connector.ts'
