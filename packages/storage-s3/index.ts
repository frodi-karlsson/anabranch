/**
 * @anabranch/storage-s3
 *
 * S3 adapter for @anabranch/storage using @aws-sdk/client-s3.
 * Supports presigned URLs, multipart uploads, and all storage operations.
 *
 * ## Connector vs Adapter
 *
 * A **StorageConnector** produces connected **StorageAdapter** instances. Use
 * `createS3()` for production code to properly manage S3 connections.
 *
 * ## Core Types
 *
 * - {@linkcode StorageConnector} - Connection factory for S3
 * - {@linkcode StorageAdapter} - Low-level storage operations (put, get, delete, head, list)
 * - {@linkcode PresignableAdapter} - Extended interface with presign() for presigned URLs
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
 * import { Task, createS3 } from "@anabranch/storage-s3";
 * import { Storage } from "@anabranch/storage";
 *
 * const connector = createS3({ bucket: "uploads", region: "us-east-1" });
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
 * @example Upload with presigned URL and result handling
 * ```ts
 * import { Task, createS3 } from "@anabranch/storage-s3";
 * import { Storage } from "@anabranch/storage";
 *
 * const connector = createS3({ bucket: "images", region: "us-east-1" });
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
 *   createS3({ bucket: "logs", prefix: "archive/" })
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
export { S3Adapter } from "./s3.ts";
export { createS3 } from "./connector.ts";
export type { S3StorageOptions } from "./connector.ts";
