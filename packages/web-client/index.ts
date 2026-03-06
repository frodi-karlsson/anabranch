/**
 * A lightweight HTTP client built on `fetch` with automatic retries,
 * configurable timeouts, and rate-limit handling via `Retry-After`.
 *
 * The entry point is {@link WebClient}. Call {@link WebClient.create} to get a
 * client with defaults, then chain {@link WebClient.withBaseUrl withBaseUrl},
 * {@link WebClient.withHeaders withHeaders}, {@link WebClient.withTimeout withTimeout},
 * and {@link WebClient.withRetry withRetry} to configure it. Each HTTP method
 * returns a {@link Task} so you can chain `.map`, `.recover`, and `.retry`
 * before calling `.run()`.
 *
 * @example Fetch JSON with retries and a timeout
 * ```ts
 * import { WebClient } from "@anabranch/web-client";
 *
 * const client = WebClient.create()
 *   .withBaseUrl("https://api.example.com")
 *   .withTimeout(10_000)
 *   .withRetry({ attempts: 3 });
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
  RetryOptions,
} from "./types.ts";
