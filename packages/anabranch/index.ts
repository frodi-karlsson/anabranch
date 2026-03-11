/**
 * Anabranch is a TypeScript library for error-tolerant async streams.
 *
 * Instead of throwing on the first error, it collects errors alongside
 * successful values so you can process a stream to completion and deal with
 * failures at the end — or not at all.
 *
 * The entry point is {@link Source}. Once you have a stream, chain operations
 * like {@link Stream.map map}, {@link Stream.filter filter},
 * {@link Stream.flatMap flatMap}, and {@link Stream.fold fold} to transform it,
 * then consume it with {@link Stream.collect collect} or
 * {@link Stream.partition partition}.
 *
 * @example Fetch a list of URLs concurrently, collect results and failures separately
 * ```ts
 * import { Source } from "anabranch";
 *
 * const { successes, errors } = await Source.from<string, Error>(
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
export { Source } from './source/source.ts'
export { Task } from './task/task.ts'
export { Channel } from './channel/channel.ts'
export { PumpError } from './stream/stream.ts'
export type { Stream } from './stream/stream.ts'
export { AggregateError } from './util/util.ts'
export type {
  ErrorResult,
  Promisable,
  Result,
  SuccessResult,
} from './util/util.ts'
