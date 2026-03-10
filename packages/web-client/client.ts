import { Task } from '@anabranch/anabranch'
import {
  HttpError,
  Method,
  RequestOptions,
  ResponseResult,
  RetryOptions,
} from './types.ts'

const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

/**
 * An HTTP client built on fetch with automatic retries and error handling.
 *
 * @example
 * ```ts
 * const client = WebClient.create()
 *   .withBaseUrl("https://api.example.com")
 *   .withHeaders({ Authorization: "Bearer token" })
 *   .withTimeout(10_000)
 *   .withRetry({ attempts: 3, delay: (n) => 1000 * 2 ** n });
 *
 * const result = await client.get("/users/1").run();
 * console.log(result.data);
 * ```
 */
export class WebClient {
  private readonly config: ResolvedConfig

  private constructor(config: ResolvedConfig) {
    this.config = config
  }

  /** Creates a new WebClient with all defaults. */
  static create(): WebClient {
    return new WebClient({
      baseUrl: undefined,
      headers: {},
      timeout: 30_000,
      retry: {
        attempts: 3,
        delay: (_attempt: number, _error: HttpError) => 1000 * 2 ** _attempt,
        when: isRetryable,
      },
      fetch: globalThis.fetch,
    })
  }

  /** Returns a new WebClient with the given base URL. */
  withBaseUrl(url: string | URL): WebClient {
    const base = url instanceof URL ? url : new URL(url)
    const normalized = new URL(
      base.href.endsWith('/') ? base.href : base.href + '/',
    )
    return new WebClient({ ...this.config, baseUrl: normalized })
  }

  /** Returns a new WebClient with the given headers merged into existing ones. */
  withHeaders(headers: Record<string, string>): WebClient {
    return new WebClient({
      ...this.config,
      headers: { ...this.config.headers, ...headers },
    })
  }

  /** Returns a new WebClient with the given timeout in milliseconds. */
  withTimeout(ms: number): WebClient {
    return new WebClient({ ...this.config, timeout: ms })
  }

  /** Returns a new WebClient with retry options field-merged into existing ones. */
  withRetry(retry: RetryOptions): WebClient {
    return new WebClient({
      ...this.config,
      retry: {
        attempts: retry.attempts ?? this.config.retry.attempts,
        delay: retry.delay ?? this.config.retry.delay,
        when: retry.when ?? this.config.retry.when,
      },
    })
  }

  /** Returns a new WebClient using the given fetch function. */
  withFetch(fetch: typeof globalThis.fetch): WebClient {
    return new WebClient({ ...this.config, fetch })
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
    const {
      baseUrl,
      headers: defaultHeaders,
      timeout: defaultTimeout,
      retry: defaultRetry,
      fetch,
    } = this.config
    const url = buildUrl(baseUrl, path)
    const headers = mergeHeaders(defaultHeaders, options?.headers)
    const timeout = options?.timeout ?? defaultTimeout
    const retryAttempts = options?.retry?.attempts ?? defaultRetry.attempts
    const retryDelay = options?.retry?.delay ?? defaultRetry.delay
    const retryWhen = options?.retry?.when ?? defaultRetry.when

    return Task.of<Response, Error>((signal) =>
      fetch(url.href, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      })
    ).map<Response, HttpError>((response) => {
      const retryAfter = parseRetryAfter(
        response.headers.get('retry-after'),
      )
      const rateLimited = response.status === 429

      if (!response.ok) {
        const reason = response.statusText || `HTTP ${response.status}`
        throw new HttpError({
          url,
          method,
          status: response.status,
          reason,
          isRetryable: RETRYABLE_STATUS_CODES.includes(response.status),
          isRateLimited: rateLimited,
          retryAfter,
        })
      }

      return response
    })
      .mapErr((error) => {
        if (error instanceof HttpError) return error
        return new HttpError({
          url,
          method,
          status: undefined,
          reason: error instanceof Error ? error.message : String(error),
          isRetryable: true, // Network errors may be transient, so retry by default
          isRateLimited: false,
          retryAfter: undefined,
        })
      })
      .map(async (response) => {
        const contentType = response.headers.get('content-type') ?? ''
        let data: unknown
        if (contentType.includes('application/json')) {
          data = await response.json()
        } else if (contentType.includes('text/')) {
          data = await response.text()
        } else {
          data = await response.blob()
        }

        return {
          url: new URL(response.url || url.href),
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          ok: response.ok,
          data,
        }
      }).timeout(
        timeout,
        new HttpError({
          url,
          method,
          status: undefined,
          reason: `Timeout after ${timeout}ms`,
          isRetryable: true, // Timeouts may be transient, so retry by default
          isRateLimited: false,
          retryAfter: undefined,
        }),
      )
      .retry({
        attempts: retryAttempts,
        delay: (attempt, error) => {
          if (error.details.isRateLimited && error.details.retryAfter) {
            return error.details.retryAfter * 1000
          }
          return typeof retryDelay === 'function'
            ? retryDelay(attempt, error)
            : retryDelay
        },
        when: retryWhen,
      })
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
    return this.request(path, 'GET', options)
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
    return this.request(path, 'POST', options, body)
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
    return this.request(path, 'PUT', options, body)
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
    return this.request(path, 'PATCH', options, body)
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
    return this.request(path, 'DELETE', options)
  }
}

interface ResolvedConfig {
  baseUrl: URL | undefined
  headers: Record<string, string>
  timeout: number
  retry: {
    attempts: number
    delay: number | ((attempt: number, error: HttpError) => number)
    when: (error: HttpError) => boolean
  }
  fetch: typeof globalThis.fetch
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const delay = Number(header)
  if (!Number.isNaN(delay)) return delay
  const httpDate = Date.parse(header)
  if (!Number.isNaN(httpDate)) {
    return Math.max(0, (httpDate - Date.now()) / 1000)
  }
  return undefined
}

function buildUrl(baseUrl: URL | undefined, path: string): URL {
  if (baseUrl) {
    const url = path.startsWith('/') ? path.slice(1) : path
    return new URL(url, baseUrl.href)
  }
  return new URL(path)
}

function mergeHeaders(
  base: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> {
  const merged = { ...base }
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      merged[key] = value
    }
  }
  return merged
}

function isRetryable(error: HttpError): boolean {
  if (error.details.isRateLimited) return true
  if (
    error.details.status &&
    RETRYABLE_STATUS_CODES.includes(error.details.status)
  ) {
    return true
  }
  return false
}
