/**
 * @anabranch/eventlog
 *
 * Event log primitives with Task/Stream semantics for event-sourced systems.
 * Integrates with anabranch's {@linkcode Task}, {@linkcode Stream}, {@linkcode Source}, and
 * {@linkcode Channel} types for composable error handling and concurrent processing.
 *
 * ## Adapters vs Connectors
 *
 * An **EventLogConnector** produces connected **EventLogAdapter** instances. Use connectors for
 * production code to properly manage connection lifecycles:
 *
 * - **Connector**: Manages connection pool/lifecycle, produces adapters
 * - **Adapter**: Low-level append/get/list/consume interface
 * - **EventLog**: Wrapper providing Task/Stream methods over an adapter
 *
 * ## Core Types
 *
 * - {@link EventLogConnector} - Interface for connection factories
 * - {@link EventLogAdapter} - Low-level event log operations interface
 * - {@link EventLog} - High-level wrapper with Task/Stream methods
 * - {@link Event} - Single event envelope with id, data, sequence number
 * - {@link EventBatch} - Batch of events consumed from a topic
 *
 * ## Error Types
 *
 * All errors are typed for catchable handling:
 * - {@link EventLogConnectionFailed} - Connection establishment failed
 * - {@link EventLogAppendFailed} - Append operation failed
 * - {@link EventLogGetFailed} - Get event operation failed
 * - {@link EventLogListFailed} - List events operation failed
 * - {@link EventLogCommitCursorFailed} - Cursor commit failed
 * - {@link EventLogGetCursorFailed} - Get cursor operation failed
 *
 * @example Basic usage with Task semantics
 * ```ts
 * import { EventLog, createInMemory } from "@anabranch/eventlog";
 *
 * const connector = createInMemory();
 * const log = await EventLog.connect(connector).run();
 *
 * const eventId = await log.append("users", { action: "created", userId: 123 }).run();
 * const events = await log.list("users").run();
 * ```
 *
 * @example Consuming events as a stream with auto-commit
 * ```ts
 * const connector = createInMemory();
 * const log = await EventLog.connect(connector).run();
 *
 * const { successes, errors } = await log
 *   .consume("users", "my-processor")
 *   .withConcurrency(5)
 *   .map(async (batch) => {
 *     for (const event of batch.events) {
 *       await processEvent(event.data);
 *     }
 *   })
 *   .partition();
 * ```
 *
 * @module
 */
export { EventLog } from "./eventlog.ts";
export type {
  Event,
  EventBatch,
  EventLogAdapter,
  EventLogConnector,
} from "./adapter.ts";
export type {
  AppendOptions,
  ConsumeOptions,
  EventLogOptions,
  ListOptions,
} from "./adapter.ts";
export * from "./errors.ts";
export { createInMemory } from "./in-memory.ts";
export type { InMemoryConnector, InMemoryOptions } from "./in-memory.ts";
export { Task } from "@anabranch/anabranch";
export type { Source, Stream } from "@anabranch/anabranch";
