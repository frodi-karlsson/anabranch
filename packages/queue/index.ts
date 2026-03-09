/**
 * @anabranch/queue
 *
 * Queue primitives with Task/Stream semantics for error-tolerant message processing.
 * Integrates with anabranch's {@linkcode Task}, {@linkcode Stream}, {@linkcode Source}, and
 * {@linkcode Channel} types for composable error handling and concurrent processing.
 *
 * ## Adapters vs Connectors
 *
 * A **QueueConnector** produces connected **QueueAdapter** instances. Use connectors for
 * production code to properly manage connection lifecycles:
 *
 * - **Connector**: Manages connection pool/lifecycle, produces adapters
 * - **Adapter**: Low-level send/receive/ack/nack interface
 * - **Queue**: Wrapper providing Task/Stream methods over an adapter
 *
 * ## Core Types
 *
 * - {@link QueueConnector} - Interface for connection factories
 * - {@link QueueAdapter} - Low-level queue operations interface
 * - {@link Queue} - High-level wrapper with Task/Stream methods
 * - {@link QueueMessage} - Message envelope with id, data, attempt count
 *
 * ## Error Types
 *
 * All errors are typed for catchable handling:
 * - {@link QueueConnectionFailed} - Connection establishment failed
 * - {@link QueueSendFailed} - Send operation failed
 * - {@link QueueReceiveFailed} - Receive operation failed
 * - {@link QueueAckFailed} - Acknowledgment failed
 *
 * @example Basic send with Task semantics
 * ```ts
 * import { Queue, createInMemory } from "@anabranch/queue";
 *
 * const connector = createInMemory();
 * const queue = await Queue.connect(connector).run();
 *
 * const messageId = await queue
 *   .send("notifications", { userId: 123, type: "welcome" })
 *   .run();
 * ```
 *
 * @example Stream messages with concurrent processing and error collection
 * ```ts
 * const connector = createInMemory();
 * const queue = await Queue.connect(connector).run();
 *
 * const { successes, errors } = await queue
 *   .stream("notifications")
 *   .withConcurrency(5)
 *   .map(async (msg) => await sendEmail(msg.data))
 *   .tapErr((err) => logError(err))
 *   .partition();
 * ```
 *
 * @example Delayed messages with visibility timeout
 * ```ts
 * import { Queue, createInMemory } from "@anabranch/queue";
 *
 * const connector = createInMemory({ visibilityTimeout: 60_000 });
 * const queue = await Queue.connect(connector).run();
 *
 * await queue.send("notifications", reminder, { delayMs: 30_000 }).run();
 * ```
 *
 * @example Dead letter queue with max attempts
 * ```ts
 * import { Queue, createInMemory } from "@anabranch/queue";
 *
 * const connector = createInMemory({
 *   queues: {
 *     orders: {
 *       maxAttempts: 3,
 *       deadLetterQueue: "orders-dlq",
 *     },
 *   },
 * });
 * const queue = await Queue.connect(connector).run();
 *
 * await queue.nack("orders", msg.id, { deadLetter: true }).run();
 * ```
 *
 * @module
 */
export { Queue } from './queue.ts'
export type { QueueMessage } from './adapter.ts'
export type {
  NackOptions,
  QueueAdapter,
  QueueConnector,
  QueueOptions,
  SendOptions,
  StreamAdapter,
} from './adapter.ts'
export * from './errors.ts'
export { createInMemory } from './in-memory.ts'
export type { InMemoryConnector } from './in-memory.ts'
export { Task } from '@anabranch/anabranch'
export type { Source, Stream } from '@anabranch/anabranch'
