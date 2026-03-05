import { Channel, Source, Task } from "@anabranch/anabranch";
import type { Stream } from "@anabranch/anabranch";
import { _extractLinks } from "./extract.ts";
import type {
  BrokenLinkCheckerOptions,
  CheckResult,
  RetryOptions,
} from "./types.ts";

export class BrokenLinkChecker {
  private readonly concurrency: number;
  private readonly timeout: number;
  private readonly retry: Required<RetryOptions>;
  private readonly fetch: typeof globalThis.fetch;
  private readonly userAgent: string;
  private readonly urlFilters: Array<(url: URL) => boolean>;
  private readonly errorFilters: Array<(result: CheckResult) => boolean>;

  constructor(options?: BrokenLinkCheckerOptions) {
    this.concurrency = options?.concurrency ?? 10;
    this.timeout = options?.timeout ?? 30_000;
    this.retry = {
      attempts: options?.retry?.attempts ?? 3,
      delay: options?.retry?.delay ?? ((attempt) => 1000 * 2 ** attempt),
      when: options?.retry?.when ?? (() => true),
    };
    this.fetch = options?.fetch ?? globalThis.fetch;
    this.userAgent = options?.userAgent ?? "BrokenLinkChecker/1.0";
    this.urlFilters = [];
    this.errorFilters = [];
  }

  filterUrls(fn: (url: URL) => boolean): BrokenLinkChecker {
    this.urlFilters.push(fn);
    return this;
  }

  filterErrors(fn: (result: CheckResult) => boolean): BrokenLinkChecker {
    this.errorFilters.push(fn);
    return this;
  }

  check(startUrl: string | URL): Stream<CheckResult, Error> {
    const seed = typeof startUrl === "string" ? new URL(startUrl) : startUrl;
    const host = seed.hostname;
    const {
      concurrency,
      timeout,
      retry,
      fetch,
      userAgent,
      urlFilters,
      errorFilters,
    } = this;

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

      return await Task.of<CheckResult, Error>(async (signal) => {
        const response = await fetch(url.href, {
          signal,
          headers: { "User-Agent": userAgent },
        });

        // Extract and enqueue child links before returning so pending is
        // incremented synchronously before .tap() decrements it.
        if (isPath && response.ok) {
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("text/html")) {
            const html = await response.text();
            const finalUrl = new URL(response.url || url.href);
            for (const link of _extractLinks(html, finalUrl)) {
              enqueue(link, url, { skipFilter: false });
            }
          }
        }

        return {
          url,
          parent,
          ok: response.ok,
          status: response.status,
          reason: response.ok ? undefined : `HTTP ${response.status}`,
          isPath,
          durationMs: Date.now() - start,
        };
      })
        .timeout(timeout)
        .retry({
          attempts: retry.attempts,
          delay: retry.delay,
          when: retry.when as (error: Error) => boolean,
        })
        .recover(
          (error: Error): CheckResult => ({
            url,
            parent,
            ok: false,
            status: undefined,
            reason: error.message,
            isPath,
            durationMs: Date.now() - start,
          }),
        )
        .run();
    }

    // Seed bypasses URL filters.
    enqueue(seed, undefined, { skipFilter: true });

    return Source.from<WorkItem, Error>(channel.successes(), concurrency)
      .map(checkOne)
      .tap(() => {
        pending--;
        if (pending === 0) channel.close();
      })
      .filter((result) => result.ok || errorFilters.every((f) => f(result)));
  }
}

interface WorkItem {
  url: URL;
  parent: URL | undefined;
}
