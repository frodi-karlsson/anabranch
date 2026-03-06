export type { RetryOptions } from "@anabranch/web-client";

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
