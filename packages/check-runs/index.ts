/**
 * @anabranch/check-runs
 *
 * Check Runs API client with Task/Stream semantics.
 *
 * Provides a `CheckRuns` class for creating, updating, and completing check runs
 * with automatic annotation batching. Designed for CI/CD workflows with streaming
 * output support. Includes an in-memory implementation for testing.
 *
 * ## Core Types
 *
 * - {@linkcode CheckRuns} - Main class for managing check runs
 * - {@linkcode CheckRunsLike} - Interface for custom implementations
 * - {@linkcode CheckRun} - Check run state and metadata
 * - {@linkcode Annotation} - Code annotation for check run output
 * - {@linkcode AnnotationWriter} - Writer for streaming annotations with backpressure
 *
 * ## Error Types
 *
 * All errors are typed for catchable handling:
 * - {@linkcode CheckRunNotFound} - Check run does not exist
 * - {@linkcode CheckRunAlreadyStarted} - Check run already started
 * - {@linkcode CheckRunAlreadyCompleted} - Check run already completed
 * - {@linkcode AnnotationsClosedError} - Annotation channel closed
 * - {@linkcode CheckRunsApiError} - API request failed
 *
 * @example Basic usage with in-memory implementation (for testing)
 * ```ts
 * import { createInMemory } from "@anabranch/check-runs";
 *
 * const checkRuns = createInMemory();
 * const checkRun = await checkRuns.create("my-check", "abc123").run();
 * await checkRuns.start(checkRun).run();
 * await checkRuns.complete(checkRun, "success").run();
 * ```
 *
 * @example Streaming annotations during long-running jobs
 * ```ts
 * const checkRuns = createInMemory();
 * const checkRun = await checkRuns.create("build", "abc123").run();
 * const started = await checkRuns.start(checkRun).run();
 *
 * // Stream annotations with backpressure
 * await started.writeAnnotation({
 *   path: "src/index.ts",
 *   startLine: 42,
 *   endLine: 42,
 *   level: "warning",
 *   message: "Unused import"
 * });
 * started.closeAnnotations();
 *
 * await checkRuns.complete(started, "failure").run();
 * ```
 *
 * @module
 */
export { CheckRuns } from './check-runs.ts'
export type { AnyCheckRunsError, CheckRunsLike } from './check-runs.ts'
export type {
  AnnotationBatcherConfig,
  CheckRunComplete,
  CheckRunsOptions,
  CheckRunUpdate,
  CreateOptions,
  WatchOptions,
} from './types.ts'
export type {
  CheckRun,
  CheckRunConclusion,
  CheckRunStatus,
  StartedCheckRun,
} from './check-run.ts'
export type { Annotation } from './annotation.ts'
export {
  AnnotationsClosedError,
  AnnotationsViaChannelError,
  CheckRunAlreadyCompleted,
  CheckRunAlreadyStarted,
  CheckRunNotFound,
  CheckRunsApiError,
  CheckRunsError,
} from './errors.ts'
export type { CheckRunsErrorDetails } from './errors.ts'
export { createInMemory } from './in-memory.ts'
export type { InMemoryOptions } from './in-memory.ts'
