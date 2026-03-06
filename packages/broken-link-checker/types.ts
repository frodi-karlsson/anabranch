import type { RequestOptions } from "@anabranch/web-client";

/** Log level for output verbosity. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "none";

/** Result of checking a single URL. */
export interface CheckResult {
  /** The URL that was checked. */
  url: URL;
  /** The page containing the link, undefined for seed URLs. */
  parent: URL | undefined;
  /** Whether the URL loaded successfully (2xx status). */
  ok: boolean;
  /** HTTP status code, undefined for network errors. */
  status: number | undefined;
  /** Error message for failed requests. */
  reason: string | undefined;
  /** Whether the URL is on the same host as the seed. */
  isPath: boolean;
  /** Time in milliseconds to complete the request. */
  durationMs: number;
}

/** Retry configuration for failed requests. */
export type RetryOptions = RequestOptions["retry"];

/** Configuration for the broken link checker. */
export interface BrokenLinkCheckerOptions {
  /** Maximum concurrent requests. @default 10 */
  concurrency?: number;
  /** Request timeout in milliseconds. @default 10000 */
  timeout?: number;
  /** Retry configuration for failed requests. */
  retry?: RetryOptions;
  /** Custom fetch function. */
  fetch?: typeof globalThis.fetch;
  /** User-Agent header for requests. */
  userAgent?: string;
  /** Log level for output verbosity. @default "warn" */
  logLevel?: LogLevel;
}
