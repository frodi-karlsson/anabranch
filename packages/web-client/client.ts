import { Task } from "@anabranch/anabranch";
import type {
  HttpError,
  Method,
  RequestOptions,
  ResponseResult,
  WebClientOptions,
} from "./types.ts";

const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * An HTTP client built on fetch with automatic retries and error handling.
 *
 * @example
 * ```ts
 * const client = new WebClient({
 *   baseUrl: "https://api.example.com",
 *   headers: { Authorization: "Bearer token" },
 *   timeout: 10_000,
 *   retry: { attempts: 3, delay: (n) => 1000 * 2 ** n },
 * });
 *
 * const result = await client.get("/users/1").run();
 * console.log(result.data);
 * ```
 */
export class WebClient {
  private readonly baseUrl?: URL;
  private readonly defaultHeaders: Record<string, string>;
  private readonly defaultTimeout: number;
  private readonly defaultRetry: {
    attempts: number;
    delay: number | ((attempt: number, error: HttpError) => number);
    when: (error: HttpError) => boolean;
  };
  private readonly fetch: typeof globalThis.fetch;

  constructor(options?: WebClientOptions) {
    if (options?.baseUrl) {
      const base = options.baseUrl instanceof URL
        ? options.baseUrl
        : new URL(options.baseUrl);
      this.baseUrl = new URL(
        base.href.endsWith("/") ? base.href : base.href + "/",
      );
    } else {
      this.baseUrl = undefined;
    }
    this.defaultHeaders = options?.headers ?? {};
    this.defaultTimeout = options?.timeout ?? 30_000;
    this.defaultRetry = {
      attempts: options?.retry?.attempts ?? 3,
      delay: options?.retry?.delay ??
        ((_attempt: number, _error: HttpError) => 1000 * 2 ** _attempt),
      when: options?.retry?.when ?? isRetryable,
    };
    this.fetch = options?.fetch ?? globalThis.fetch;
  }

  /**
   * Make an HTTP request with the specified method.
   *
   * @param path - The request path, relative to baseUrl if configured.
   * @param method - The HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
   * @param options - Request-specific options that override client defaults.
   * @param body - Request body for POST, PUT, PATCH requests.
   * @returns A Task that resolves with the response or rejects with an HttpError.
   *
   * @example
   * ```ts
   * // Simple GET
   * const result = await client.request("/users", "GET").run();
   *
   * // POST with body and options
   * const result = await client.request(
   *   "/users",
   *   "POST",
   *   { headers: { "Content-Type": "application/json" } },
   *   { name: "John" }
   * ).run();
   * ```
   */
  request(
    path: string,
    method: Method,
    options?: RequestOptions,
    body?: unknown,
  ): Task<ResponseResult, HttpError> {
    const url = buildUrl(this.baseUrl, path);
    const headers = mergeHeaders(this.defaultHeaders, options?.headers);
    const timeout = options?.timeout ?? this.defaultTimeout;
    const retryAttempts = options?.retry?.attempts ??
      this.defaultRetry.attempts;
    const retryDelay = options?.retry?.delay ?? this.defaultRetry.delay;
    const retryWhen = options?.retry?.when ?? this.defaultRetry.when;

    const performRequest = Task.of<ResponseResult, HttpError>(
      async (signal) => {
        const response = await this.fetch(url.href, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal,
        });

        const retryAfter = parseRetryAfter(
          response.headers.get("retry-after"),
        );
        const rateLimited = response.status === 429;

        if (!response.ok) {
          const reason = response.statusText || `HTTP ${response.status}`;
          throw {
            url,
            method,
            status: response.status,
            reason,
            isRetryable: RETRYABLE_STATUS_CODES.includes(response.status),
            isRateLimited: rateLimited,
            retryAfter,
          } as HttpError;
        }

        const contentType = response.headers.get("content-type") ?? "";
        let data: unknown;
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else if (contentType.includes("text/")) {
          data = await response.text();
        } else {
          data = await response.blob();
        }

        return {
          url: new URL(response.url || url.href),
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          ok: response.ok,
          data,
        } as ResponseResult;
      },
    );

    return performRequest
      .timeout(timeout, {
        url,
        method,
        status: undefined,
        reason: `Timeout after ${timeout}ms`,
        isRetryable: true, // Timeouts may be transient, so retry by default
        isRateLimited: false,
        retryAfter: undefined,
      } as HttpError)
      .retry({
        attempts: retryAttempts,
        delay: (attempt, error) => {
          if (error.isRateLimited && error.retryAfter) {
            return error.retryAfter * 1000;
          }
          return typeof retryDelay === "function"
            ? retryDelay(attempt, error)
            : retryDelay;
        },
        when: retryWhen,
      });
  }

  /**
   * Make a GET request.
   *
   * @param path - The request path, relative to baseUrl if configured.
   * @param options - Request-specific options.
   * @returns A Task that resolves with the response or rejects with an HttpError.
   *
   * @example
   * ```ts
   * const result = await client.get("/users/1").run();
   * ```
   */
  get(path: string, options?: RequestOptions): Task<ResponseResult, HttpError> {
    return this.request(path, "GET", options);
  }

  /**
   * Make a POST request with a body.
   *
   * @param path - The request path, relative to baseUrl if configured.
   * @param body - The request body (serialized as JSON).
   * @param options - Request-specific options.
   * @returns A Task that resolves with the response or rejects with an HttpError.
   *
   * @example
   * ```ts
   * const result = await client.post("/users", { name: "John" }).run();
   * ```
   */
  post(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Task<ResponseResult, HttpError> {
    return this.request(path, "POST", options, body);
  }

  /**
   * Make a PUT request with a body.
   *
   * @param path - The request path, relative to baseUrl if configured.
   * @param body - The request body (serialized as JSON).
   * @param options - Request-specific options.
   * @returns A Task that resolves with the response or rejects with an HttpError.
   *
   * @example
   * ```ts
   * const result = await client.put("/users/1", { name: "Jane" }).run();
   * ```
   */
  put(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Task<ResponseResult, HttpError> {
    return this.request(path, "PUT", options, body);
  }

  /**
   * Make a PATCH request with a body.
   *
   * @param path - The request path, relative to baseUrl if configured.
   * @param body - The request body (serialized as JSON).
   * @param options - Request-specific options.
   * @returns A Task that resolves with the response or rejects with an HttpError.
   *
   * @example
   * ```ts
   * const result = await client.patch("/users/1", { name: "Jane" }).run();
   * ```
   */
  patch(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Task<ResponseResult, HttpError> {
    return this.request(path, "PATCH", options, body);
  }

  /**
   * Make a DELETE request.
   *
   * @param path - The request path, relative to baseUrl if configured.
   * @param options - Request-specific options.
   * @returns A Task that resolves with the response or rejects with an HttpError.
   *
   * @example
   * ```ts
   * await client.delete("/users/1").run();
   * ```
   */
  delete(
    path: string,
    options?: RequestOptions,
  ): Task<ResponseResult, HttpError> {
    return this.request(path, "DELETE", options);
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const delay = Number(header);
  if (!Number.isNaN(delay)) return delay;
  const httpDate = Date.parse(header);
  if (!Number.isNaN(httpDate)) {
    return Math.max(0, (httpDate - Date.now()) / 1000);
  }
  return undefined;
}

function buildUrl(baseUrl: URL | undefined, path: string): URL {
  if (baseUrl) {
    const url = path.startsWith("/") ? path.slice(1) : path;
    return new URL(url, baseUrl.href);
  }
  return new URL(path);
}

function mergeHeaders(
  base: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> {
  const merged = { ...base };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      merged[key] = value;
    }
  }
  return merged;
}

function isRetryable(error: HttpError): boolean {
  if (error.isRateLimited) return true;
  if (error.status && RETRYABLE_STATUS_CODES.includes(error.status)) {
    return true;
  }
  return false;
}
