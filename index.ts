/**
 * Anabranch is a TypeScript library for error-tolerant async streams.
 *
 * Instead of throwing on the first error, it collects errors alongside
 * successful values so you can process a stream to completion and deal with
 * failures at the end — or not at all.
 *
 * The entry point is {@link AnabranchSource}. Once you have a stream, chain
 * operations like {@link AnabranchStream.map map},
 * {@link AnabranchStream.filter filter},
 * {@link AnabranchStream.flatMap flatMap}, and
 * {@link AnabranchStream.fold fold} to transform it, then consume it with
 * {@link AnabranchStream.collect collect} or
 * {@link AnabranchStream.partition partition}.
 *
 * @example Fetch a list of URLs concurrently, collect results and failures separately
 * ```ts
 * import { AnabranchSource } from "anabranch";
 *
 * const { successes, errors } = await new AnabranchSource<string, Error>(
 *   async function* () {
 *     yield "https://example.com/1";
 *     yield "https://example.com/2";
 *     yield "https://example.com/3";
 *   },
 * )
 *   .withConcurrency(3)
 *   .map(async (url) => {
 *     const res = await fetch(url);
 *     if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
 *     return res.json();
 *   })
 *   .partition();
 *
 * console.log(`${successes.length} succeeded, ${errors.length} failed`);
 * ```
 *
 * @module
 */
export { AnabranchSource } from "./streams/source.ts";
export type { AnabranchStream } from "./streams/stream.ts";
export { AnabranchAggregateError } from "./streams/util.ts";
export type {
  AnabranchErrorResult,
  AnabranchPromisable,
  AnabranchResult,
  AnabranchSuccessResult,
} from "./streams/util.ts";
