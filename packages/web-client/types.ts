/**
 * HTTP request methods supported by the WebClient.
 */
export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * Configuration options for creating a WebClient instance.
 * @example
 * ```ts
 * new WebClient({ baseUrl: "https://api.example.com/v1" })
 * ```
 */
export interface WebClientOptions {
  /** @default undefined */
  baseUrl?: string | URL;

  /** @default {} */
  headers?: Record<string, string>;

  /** @default 30000 */
  timeout?: number;

  /** @default { attempts: 3, delay: (n) => 1000 * 2 ** n, when: retries on 408/429/5xx } */
  retry?: RetryOptions;

  /** @default globalThis.fetch */
  fetch?: typeof globalThis.fetch;
}

/**
 * Options for an individual request, overriding client defaults.
 */
export interface RequestOptions {
  /** @default {} (merged with client headers) */
  headers?: Record<string, string>;

  /** @default client.timeout */
  timeout?: number;

  /** @default client.retry */
  retry?: RetryOptions;
}

/**
 * Successful HTTP response data.
 */
export interface ResponseResult {
  url: URL;
  status: number;
  statusText: string;
  headers: Headers;
  ok: boolean;
  data: unknown;
}

/**
 * Error details for a failed HTTP request.
 */
export interface HttpError {
  url: URL;
  method: string;
  status?: number;
  reason: string;
  isRetryable: boolean;
  isRateLimited: boolean;
  retryAfter?: number;
}

/**
 * Configuration for automatic retry behavior.
 * @example
 * ```ts
 * // Custom retry with rate-limit handling
 * { attempts: 5, delay: (n, e) => e.isRateLimited ? e.retryAfter! * 1000 : 1000 * 2 ** n }
 * ```
 */
export interface RetryOptions {
  /** @default 3 */
  attempts?: number;

  /** @default (n) => 1000 * 2 ** n (exponential backoff) */
  delay?: number | ((attempt: number, error: HttpError) => number);

  /** @default retries on 408, 429, 500, 502, 503, 504 */
  when?: (error: HttpError) => boolean;
}
