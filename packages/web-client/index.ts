/**
 * A lightweight HTTP client built on `fetch` with automatic retries,
 * configurable timeouts, and rate-limit handling via `Retry-After`.
 *
 * The entry point is {@link WebClient}. Construct it once with shared defaults
 * (base URL, headers, timeout, retry policy) and call
 * {@link WebClient.get get}, {@link WebClient.post post}, etc. Each method
 * returns a {@link Task} so you can chain `.map`, `.recover`, and `.retry`
 * before calling `.run()`.
 *
 * @example Fetch JSON with retries and a timeout
 * ```ts
 * import { WebClient } from "@anabranch/web-client";
 *
 * const client = new WebClient({
 *   baseUrl: "https://api.example.com",
 *   timeout: 10_000,
 *   retry: { attempts: 3 },
 * });
 *
 * const user = await client.get("/users/1").map(r => r.data).run();
 * ```
 *
 * @module
 */
export { WebClient } from "./client.ts";
export type {
  HttpError,
  Method,
  RequestOptions,
  ResponseResult,
  WebClientOptions,
} from "./types.ts";
