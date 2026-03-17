import { Channel, Source } from '@anabranch/anabranch'
import type { Stream, Task } from '@anabranch/anabranch'
import { WebClient } from '@anabranch/web-client'
import type {
  HttpError,
  ResponseResult,
  RetryOptions,
} from '@anabranch/web-client'
import { _extractLinks, _extractLinksFromXml } from './extract.ts'
import type { CheckResult, LogLevel } from './types.ts'

/**
 * A concurrent website crawler that finds broken links.
 *
 * @example
 * ```ts
 * const { successes } = await BrokenLinkChecker.create()
 *   .withConcurrency(20)
 *   .withTimeout(10_000)
 *   .keepBroken((r) => r.reason !== "Forbidden")
 *   .check(["https://example.com", "https://example.com/sitemap.xml"])
 *   .partition();
 * ```
 */
export class BrokenLinkChecker {
  private readonly config: ResolvedConfig

  private constructor(config: ResolvedConfig) {
    this.config = config
  }

  /** Creates a new BrokenLinkChecker with all defaults. */
  static create(): BrokenLinkChecker {
    return new BrokenLinkChecker({
      concurrency: 10,
      timeout: 30_000,
      logLevel: 'warn',
      retry: undefined,
      fetch: undefined,
      userAgent: 'BrokenLinkChecker/1.0',
      urlFilters: [],
      keepBrokenPredicates: [],
    })
  }

  /** Returns a new BrokenLinkChecker with the given concurrency limit. */
  withConcurrency(n: number): BrokenLinkChecker {
    return new BrokenLinkChecker({ ...this.config, concurrency: n })
  }

  /** Returns a new BrokenLinkChecker with the given request timeout in milliseconds. */
  withTimeout(ms: number): BrokenLinkChecker {
    return new BrokenLinkChecker({ ...this.config, timeout: ms })
  }

  /** Returns a new BrokenLinkChecker with the given log level. */
  withLogLevel(level: LogLevel): BrokenLinkChecker {
    return new BrokenLinkChecker({ ...this.config, logLevel: level })
  }

  /** Returns a new BrokenLinkChecker with retry options merged into existing ones. */
  withRetry(retry: RetryOptions): BrokenLinkChecker {
    return new BrokenLinkChecker({ ...this.config, retry })
  }

  /** Returns a new BrokenLinkChecker using the given fetch function. */
  withFetch(fetch: typeof globalThis.fetch): BrokenLinkChecker {
    return new BrokenLinkChecker({ ...this.config, fetch })
  }

  /** Returns a new BrokenLinkChecker with the given User-Agent header. */
  withUserAgent(ua: string): BrokenLinkChecker {
    return new BrokenLinkChecker({ ...this.config, userAgent: ua })
  }

  /** Returns a new BrokenLinkChecker that filters URLs before checking them. */
  filterUrls(fn: (url: URL) => boolean): BrokenLinkChecker {
    return new BrokenLinkChecker({
      ...this.config,
      urlFilters: [...this.config.urlFilters, fn],
    })
  }

  /** Returns a new BrokenLinkChecker that keeps broken links matching the predicate in results. */
  keepBroken(fn: (result: CheckResult) => boolean): BrokenLinkChecker {
    return new BrokenLinkChecker({
      ...this.config,
      keepBrokenPredicates: [...this.config.keepBrokenPredicates, fn],
    })
  }

  /**
   * Start crawling from one or more entrypoints.
   * Returns a stream of CheckResult. Use partition() to separate ok/broken links
   * (successes) from stream errors (errors).
   * @example
   * ```ts
   * const { successes } = await BrokenLinkChecker.create()
   *   .check(["https://example.com", "https://example.com/sitemap.xml"])
   *   .partition();
   * ```
   */
  check(startUrls: (string | URL)[]): Stream<CheckResult, Error> {
    const seeds = startUrls.map((u) => typeof u === 'string' ? new URL(u) : u)
    const hosts = new Set(seeds.map((s) => s.hostname))
    const {
      concurrency,
      timeout,
      logLevel,
      retry,
      fetch,
      userAgent,
      urlFilters,
      keepBrokenPredicates,
    } = this.config

    let client = WebClient.create()
      .withTimeout(timeout)
      .withHeaders({ 'User-Agent': userAgent })
    if (retry) client = client.withRetry(retry)
    if (fetch) client = client.withFetch(fetch)

    const channel = Channel.create<WorkItem>()
    const visited = new Set<string>()
    let pending = 0
    let checkedCount = 0
    let brokenCount = 0

    log(
      logLevel,
      'info',
      `Starting crawl of ${seeds.length} entrypoints (hosts: ${
        Array.from(hosts).join(', ')
      })`,
    )
    log(logLevel, 'info', `Concurrency: ${concurrency}`)

    function enqueue(
      url: URL,
      parent: URL | undefined,
      { skipFilter }: { skipFilter: boolean },
    ): void {
      const key = url.href
      if (visited.has(key)) return
      if (!skipFilter && !urlFilters.every((f) => f(url))) return
      visited.add(key)
      pending++
      channel.send({ url, parent })
    }

    async function checkOne(item: WorkItem): Promise<CheckResult> {
      const { url, parent } = item
      const start = Date.now()
      const isPath = hosts.has(url.hostname)

      const task: Task<ResponseResult, HttpError> = client.get(url.href, {
        headers: {
          Accept: 'text/html, application/xhtml+xml, application/xml, text/xml',
        },
      })

      const result = await task
        .map(async (res): Promise<CheckResult> => {
          const finalUrl = res.url
          if (isPath) {
            const contentType = res.headers.get('content-type') ?? ''
            if (contentType.includes('text/html')) {
              const html = await getText(res.data)
              const links = _extractLinks(html, finalUrl)
              for (const link of links) {
                enqueue(link, url, { skipFilter: false })
              }
              if (links.length > 0) {
                log(
                  logLevel,
                  'info',
                  `Found ${links.length} links on ${finalUrl.href}`,
                )
              }
            } else if (
              contentType.includes('application/xml') ||
              contentType.includes('text/xml') ||
              contentType.includes('application/x-sitemap+xml')
            ) {
              const xml = await getText(res.data)
              const links = _extractLinksFromXml(xml)
              for (const link of links) {
                enqueue(link, url, { skipFilter: false })
              }
              if (links.length > 0) {
                log(
                  logLevel,
                  'info',
                  `Found ${links.length} URLs in sitemap ${finalUrl.href}`,
                )
              }
            }
          }
          return {
            url: finalUrl,
            parent,
            ok: res.ok,
            status: res.status,
            reason: res.ok ? undefined : `HTTP ${res.status}`,
            isPath,
            durationMs: Date.now() - start,
          }
        })
        .recover((error: HttpError): CheckResult => ({
          url,
          parent,
          ok: false,
          status: error.details.status,
          reason: error.details.reason,
          isPath,
          durationMs: Date.now() - start,
        }))
        .run()

      checkedCount++
      if (logLevel === 'debug') {
        const status = result.status ?? 'NETWORK_ERROR'
        log(
          logLevel,
          'debug',
          `[${
            result.ok ? 'OK' : 'FAIL'
          }] ${status} ${result.url.href} (${result.durationMs}ms)`,
        )
      }
      if (!result.ok) {
        brokenCount++
        log(logLevel, 'warn', `BROKEN: ${result.url.href} (${result.reason})`)
      }

      pending--
      if (pending === 0) {
        log(
          logLevel,
          'info',
          `Crawl complete. Checked: ${checkedCount}, Broken: ${brokenCount}`,
        )
        channel.close()
      }
      return result
    }

    for (const seed of seeds) {
      enqueue(seed, undefined, { skipFilter: true })
    }

    return Source.from<WorkItem, Error>(channel.successes())
      .withConcurrency(concurrency)
      .map(checkOne)
      .filter((result) =>
        result.ok || keepBrokenPredicates.every((f) => f(result))
      )
  }
}

interface ResolvedConfig {
  concurrency: number
  timeout: number
  logLevel: LogLevel
  retry: RetryOptions | undefined
  fetch: typeof globalThis.fetch | undefined
  userAgent: string
  urlFilters: ReadonlyArray<(url: URL) => boolean>
  keepBrokenPredicates: ReadonlyArray<(result: CheckResult) => boolean>
}

function getText(data: unknown): Promise<string> {
  if (typeof data === 'string') return Promise.resolve(data)
  if (data instanceof Blob) return data.text()
  return Promise.resolve('')
}

const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error', 'none']

function log(configLevel: LogLevel, level: LogLevel, message: string): void {
  if (LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(configLevel)) {
    const prefix = level === 'debug'
      ? 'DEBUG'
      : level === 'info'
      ? 'INFO'
      : level === 'warn'
      ? 'WARN'
      : 'ERROR'
    const msg = `[BrokenLinkChecker] ${prefix}: ${message}`
    if (level === 'debug' || level === 'info') console.log(msg)
    else if (level === 'warn') console.warn(msg)
    else if (level === 'error') console.error(msg)
  }
}

interface WorkItem {
  url: URL
  parent: URL | undefined
}
