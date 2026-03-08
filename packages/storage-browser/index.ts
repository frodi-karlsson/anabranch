/**
 * @anabranch/storage-browser
 *
 * Browser storage adapter using IndexedDB for the @anabranch/storage package.
 * Works in browsers and Web Workers.
 *
 * ## Usage
 *
 * ```ts
 * import { createIndexedDB } from "@anabranch/storage-browser";
 * import { Storage } from "@anabranch/storage";
 *
 * const connector = createIndexedDB({ prefix: "app/" });
 * const storage = await Storage.connect(connector).run();
 *
 * await storage.put("config.json", JSON.stringify({ theme: "dark" })).run();
 * await storage.put("avatar.png", avatarBytes).run();
 *
 * const { successes } = await storage.list("avatars/").partition();
 * ```
 *
 * @module
 */
export { createIndexedDB } from "./connector.ts";
