/**
 * @anabranch/storage-gcs
 *
 * GCS adapter for @anabranch/storage using @google-cloud/storage.
 * Supports signed URLs and all storage operations.
 *
 * ## Connector vs Adapter
 *
 * A **StorageConnector** produces connected **StorageAdapter** instances. Use
 * `createGcs()` for production code to properly manage GCS connections.
 *
 * ## Core Types
 *
 * - {@linkcode StorageConnector} - Connection factory for GCS
 * - {@linkcode StorageAdapter} - Low-level storage operations (put, get, delete, head, list)
 * - {@linkcode PresignableAdapter} - Extended interface with presign() for signed URLs
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
 * - {@linkcode StoragePresignFailed} - Presign operation failed
 * - {@linkcode StoragePresignNotSupported} - Adapter doesn't support presigning
 *
 * @example Concurrent uploads with retry and backpressure
 * ```ts
 * import { Task, createGcs } from "@anabranch/storage-gcs";
 * import { Storage } from "@anabranch/storage";
 *
 * const connector = createGcs({ bucket: "uploads", projectId: "my-project" });
 * const storage = await Storage.connect(connector).run();
 *
 * const files = ["a.txt", "b.txt", "c.txt"];
 *
 * await Task.all(
 *   files.map((file) =>
 *     storage.put(file, Deno.readFileSync(`./${file}`))
 *       .retry({ attempts: 3, delay: (i) => 500 * Math.pow(2, i) })
 *       .timeout(30_000)
 *   )
 * ).run();
 * ```
 *
 * @example Upload with signed URL and result handling
 * ```ts
 * import { Task, createGcs } from "@anabranch/storage-gcs";
 * import { Storage } from "@anabranch/storage";
 *
 * const connector = createGcs({ bucket: "images", projectId: "my-project" });
 * const storage = await Storage.connect(connector).run();
 *
 * const result = await storage
 *   .presign("photo.jpg", { method: "PUT", expiresIn: 3600 })
 *   .result();
 *
 * if (result.type === "error") {
 *   console.error("Failed to generate upload URL:", result.error);
 *   return;
 * }
 *
 * const uploadUrl = result.value;
 *
 * await Task.of(async () => {
 *   const response = await fetch(uploadUrl, {
 *     method: "PUT",
 *     body: await Deno.readFile("photo.jpg"),
 *     headers: { "Content-Type": "image/jpeg" },
 *   });
 *   if (!response.ok) throw new Error("Upload failed");
 * })
 * .retry({ attempts: 3 })
 * .timeout(60_000)
 * .run();
 * ```
 *
 * @example Process list results with concurrency limits
 * ```ts
 * const storage = await Storage.connect(
 *   createGcs({ bucket: "logs", prefix: "archive/" })
 * ).run();
 *
 * const { successes, errors } = await storage.list()
 *   .withConcurrency(10)
 *   .map(async (entry) => {
 *     const obj = await storage.get(entry.key).run();
 *     const text = await new Response(obj.body).text();
 *     return { key: entry.key, lines: text.split("\n").length };
 *   })
 *   .tapErr((err) => console.error("Failed processing:", err))
 *   .partition();
 *
 * console.log(`Processed ${successes.length} files with ${errors.length} errors`);
 * ```
 *
 * @module
 */
export { GcsAdapter } from './gcs.ts'
export { createGcs } from './connector.ts'
export type { GcsStorageOptions } from './connector.ts'
