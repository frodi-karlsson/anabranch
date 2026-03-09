/**
 * A concurrent website crawler that finds broken links.
 *
 * The entry point is {@link BrokenLinkChecker}. Configure it with
 * {@link BrokenLinkChecker.filterUrls filterUrls} to skip unwanted URLs and
 * {@link BrokenLinkChecker.keepBroken keepBroken} to control which broken
 * results appear in the output. Then call
 * {@link BrokenLinkChecker.check check} with one or more seed URLs (including
 * a sitemap) and consume the resulting stream with `.partition()`.
 *
 * @example Crawl a site and report broken links
 * ```ts
 * import { BrokenLinkChecker } from "@anabranch/broken-link-checker";
 *
 * const { successes } = await BrokenLinkChecker.create()
 *   .withConcurrency(20)
 *   .withTimeout(10_000)
 *   .keepBroken((r) => r.reason !== "Forbidden")
 *   .check(["https://example.com", "https://example.com/sitemap.xml"])
 *   .partition();
 *
 * const broken = successes.filter(r => !r.ok);
 * console.log(`Found ${broken.length} broken links`);
 * ```
 *
 * @module
 */
export { BrokenLinkChecker } from './checker.ts'
export type { CheckResult, LogLevel, RetryOptions } from './types.ts'
