import { Channel, Source } from "@anabranch/anabranch";
import type { Stream, Task } from "@anabranch/anabranch";
import { WebClient } from "@anabranch/web-client";
import type { HttpError, ResponseResult } from "@anabranch/web-client";
import { _extractLinks, _extractLinksFromXml } from "./extract.ts";
import type {
  BrokenLinkCheckerOptions,
  CheckResult,
  LogLevel,
} from "./types.ts";

function getText(data: unknown): Promise<string> {
  if (typeof data === "string") return Promise.resolve(data);
  if (data instanceof Blob) return data.text();
  return Promise.resolve("");
}

/** A concurrent website crawler that finds broken links. */
export class BrokenLinkChecker {
  private readonly concurrency: number;
  private readonly timeout: number;
  private readonly logLevel: LogLevel;
  private readonly client: WebClient;
  private readonly urlFilters: Array<(url: URL) => boolean>;
  private readonly keepBrokenPredicates: Array<
    (result: CheckResult) => boolean
  >;

  constructor(options?: BrokenLinkCheckerOptions) {
    this.concurrency = options?.concurrency ?? 10;
    this.timeout = options?.timeout ?? 30_000;
    this.logLevel = options?.logLevel ?? "warn";
    this.client = new WebClient({
      timeout: this.timeout,
      retry: options?.retry,
      fetch: options?.fetch,
      headers: { "User-Agent": options?.userAgent ?? "BrokenLinkChecker/1.0" },
    });
    this.urlFilters = [];
    this.keepBrokenPredicates = [];
  }

  /** Filter URLs before checking them. */
  filterUrls(fn: (url: URL) => boolean): BrokenLinkChecker {
    this.urlFilters.push(fn);
    return this;
  }

  /** Keep broken links in results that match the predicate. */
  keepBroken(fn: (result: CheckResult) => boolean): BrokenLinkChecker {
    this.keepBrokenPredicates.push(fn);
    return this;
  }

  /**
   * Start crawling from one or more entrypoints.
   * Returns a stream of CheckResult. Use partition() to separate ok/broken links
   * (successes) from stream errors (errors).
   * @example
   * ```ts
   * const { successes } = await new BrokenLinkChecker()
   *   .check(["https://example.com", "https://example.com/sitemap.xml"])
   *   .partition();
   * ```
   */
  check(startUrls: (string | URL)[]): Stream<CheckResult, Error> {
    const seeds = startUrls.map((
      u,
    ) => (typeof u === "string" ? new URL(u) : u));
    const hosts = new Set(seeds.map((s) => s.hostname));
    const { concurrency, client, urlFilters, keepBrokenPredicates, logLevel } =
      this;

    const channel = new Channel<WorkItem>();
    const visited = new Set<string>();
    let pending = 0;
    let checkedCount = 0;
    let brokenCount = 0;

    log(
      logLevel,
      `Starting crawl of ${seeds.length} entrypoints (hosts: ${
        Array.from(hosts).join(", ")
      })`,
    );
    log(logLevel, `Concurrency: ${concurrency}`);

    function enqueue(
      url: URL,
      parent: URL | undefined,
      { skipFilter }: { skipFilter: boolean },
    ): void {
      const key = url.href;
      if (visited.has(key)) return;
      if (!skipFilter && !urlFilters.every((f) => f(url))) return;
      visited.add(key);
      pending++;
      channel.send({ url, parent });
    }

    async function checkOne(item: WorkItem): Promise<CheckResult> {
      const { url, parent } = item;
      const start = Date.now();
      const isPath = hosts.has(url.hostname);

      const task: Task<ResponseResult, HttpError> = client.get(url.href, {
        headers: {
          Accept: "text/html, application/xhtml+xml, application/xml, text/xml",
        },
      });

      const result = await task
        .map(async (res): Promise<CheckResult> => {
          const finalUrl = res.url;
          if (isPath) {
            const contentType = res.headers.get("content-type") ?? "";
            if (contentType.includes("text/html")) {
              const html = await getText(res.data);
              const links = _extractLinks(html, finalUrl);
              for (const link of links) {
                enqueue(link, url, { skipFilter: false });
              }
              if (links.length > 0) {
                log(
                  logLevel,
                  `Found ${links.length} links on ${finalUrl.href}`,
                );
              }
            } else if (
              contentType.includes("application/xml") ||
              contentType.includes("text/xml") ||
              contentType.includes("application/x-sitemap+xml")
            ) {
              const xml = await getText(res.data);
              const links = _extractLinksFromXml(xml);
              for (const link of links) {
                enqueue(link, url, { skipFilter: false });
              }
              if (links.length > 0) {
                log(
                  logLevel,
                  `Found ${links.length} URLs in sitemap ${finalUrl.href}`,
                );
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
          };
        })
        .recover((error: HttpError): CheckResult => ({
          url,
          parent,
          ok: false,
          status: error.status,
          reason: error.reason,
          isPath,
          durationMs: Date.now() - start,
        }))
        .run();

      checkedCount++;
      if (logLevel === "debug") {
        const status = result.status ?? "NETWORK_ERROR";
        log(
          logLevel,
          `[${
            result.ok ? "OK" : "FAIL"
          }] ${status} ${result.url.href} (${result.durationMs}ms)`,
        );
      }
      if (!result.ok) {
        brokenCount++;
        log(logLevel, `BROKEN: ${result.url.href} (${result.reason})`);
      }

      pending--;
      if (pending === 0) {
        log(
          logLevel,
          `Crawl complete. Checked: ${checkedCount}, Broken: ${brokenCount}`,
        );
        channel.close();
      }
      return result;
    }

    for (const seed of seeds) {
      enqueue(seed, undefined, { skipFilter: true });
    }

    return Source.from<WorkItem, Error>(channel.successes())
      .withConcurrency(concurrency)
      .map(checkOne)
      .filter((result) =>
        result.ok || keepBrokenPredicates.every((f) => f(result))
      );
  }
}

function log(level: LogLevel, message: string): void {
  if (level === "none") return;
  const prefix = level === "debug"
    ? "DEBUG"
    : level === "info"
    ? "INFO"
    : level === "warn"
    ? "WARN"
    : "ERROR";
  console[`${level}`](`[BrokenLinkChecker] ${prefix}: ${message}`);
}

interface WorkItem {
  url: URL;
  parent: URL | undefined;
}
