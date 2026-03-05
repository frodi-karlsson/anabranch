import { Channel, Source } from "@anabranch/anabranch";
import type { Stream, Task } from "@anabranch/anabranch";
import { WebClient } from "@anabranch/web-client";
import type { HttpError, ResponseResult } from "@anabranch/web-client";
import { _extractLinks } from "./extract.ts";
import type { BrokenLinkCheckerOptions, CheckResult } from "./types.ts";

export class BrokenLinkChecker {
  private readonly concurrency: number;
  private readonly timeout: number;
  private readonly client: WebClient;
  private readonly urlFilters: Array<(url: URL) => boolean>;
  private readonly keepBrokenPredicates: Array<
    (result: CheckResult) => boolean
  >;

  constructor(options?: BrokenLinkCheckerOptions) {
    this.concurrency = options?.concurrency ?? 10;
    this.timeout = options?.timeout ?? 30_000;
    this.client = new WebClient({
      timeout: this.timeout,
      retry: options?.retry,
      fetch: options?.fetch,
      headers: { "User-Agent": options?.userAgent ?? "BrokenLinkChecker/1.0" },
    });
    this.urlFilters = [];
    this.keepBrokenPredicates = [];
  }

  filterUrls(fn: (url: URL) => boolean): BrokenLinkChecker {
    this.urlFilters.push(fn);
    return this;
  }

  keepBroken(fn: (result: CheckResult) => boolean): BrokenLinkChecker {
    this.keepBrokenPredicates.push(fn);
    return this;
  }

  check(startUrl: string | URL): Stream<CheckResult, Error> {
    const seed = typeof startUrl === "string" ? new URL(startUrl) : startUrl;
    const host = seed.hostname;
    const { concurrency, client, urlFilters, keepBrokenPredicates } = this;

    const channel = new Channel<WorkItem>();
    const visited = new Set<string>();
    let pending = 0;

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
      const isPath = url.hostname === host;

      const task: Task<ResponseResult, HttpError> = client.get(url.href, {
        headers: { Accept: "text/html, application/xhtml+xml" },
      });

      const result = await task
        .map((res): CheckResult => {
          const finalUrl = res.url;
          if (isPath) {
            const contentType = res.headers.get("content-type") ?? "";
            if (contentType.includes("text/html")) {
              const html = typeof res.data === "string" ? res.data : "";
              for (const link of _extractLinks(html, finalUrl)) {
                enqueue(link, url, { skipFilter: false });
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

      pending--;
      if (pending === 0) channel.close();
      return result;
    }

    enqueue(seed, undefined, { skipFilter: true });

    return Source.from<WorkItem, Error>(channel.successes())
      .withConcurrency(concurrency)
      .map(checkOne)
      .filter((result) =>
        result.ok || keepBrokenPredicates.every((f) => f(result))
      );
  }
}

interface WorkItem {
  url: URL;
  parent: URL | undefined;
}
