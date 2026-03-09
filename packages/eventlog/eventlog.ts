import { Source, Task } from '@anabranch/anabranch'
import type {
  AppendOptions,
  ConsumeOptions,
  EventBatch,
  EventLogAdapter,
  EventLogConnector,
} from './adapter.ts'
import {
  EventLogAppendFailed,
  EventLogCloseFailed,
  EventLogCommitCursorFailed,
  EventLogConnectionFailed,
  EventLogConsumeFailed,
  EventLogGetCursorFailed,
} from './errors.ts'

/**
 * EventLog wrapper with Task/Stream semantics for event-sourced systems.
 *
 * @example Basic usage
 * ```ts
 * import { EventLog, createInMemory } from "@anabranch/eventlog";
 *
 * const connector = createInMemory();
 * const log = await EventLog.connect(connector).run();
 *
 * // Append an event
 * const eventId = await log.append("users", { action: "created", userId: 123 }).run();
 *
 * await log.close().run();
 * ```
 *
 * @example Consuming events as a stream
 * ```ts
 * const { successes, errors } = await log
 *   .consume("users", "my-consumer-group")
 *   .withConcurrency(5)
 *   .map(async (batch) => {
 *     for (const event of batch.events) {
 *       await handleEvent(event.data);
 *     }
 *     // Explicitly commit after successful processing!
 *     await log.commit(batch.topic, batch.consumerGroup, batch.cursor).run();
 *   })
 *   .partition();
 * ```
 */
export class EventLog {
  constructor(private readonly adapter: EventLogAdapter) {}

  /**
   * Connect to an event log via a connector.
   *
   * @example
   * ```ts
   * const log = await EventLog.connect(createInMemory()).run();
   * ```
   */
  static connect(
    connector: EventLogConnector,
  ): Task<EventLog, EventLogConnectionFailed> {
    return Task.of(async () => {
      try {
        return new EventLog(await connector.connect())
      } catch (error) {
        throw new EventLogConnectionFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }

  /**
   * Release the connection back to its source.
   *
   * @example
   * ```ts
   * await log.close().run();
   * ```
   */
  close(): Task<void, EventLogCloseFailed> {
    return Task.of(async () => {
      try {
        await this.adapter.close()
      } catch (error) {
        throw new EventLogCloseFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }

  /**
   * Append an event to a topic.
   *
   * @example Basic append
   * ```ts
   * const eventId = await log.append("users", { action: "created", userId: 123 }).run();
   * ```
   *
   * @example With partition key
   * ```ts
   * const eventId = await log.append("orders", orderData, {
   *   partitionKey: orderData.userId,
   * }).run();
   * ```
   */
  append<T>(
    topic: string,
    data: T,
    options?: AppendOptions,
  ): Task<string, EventLogAppendFailed> {
    return Task.of(async () => {
      try {
        return await this.adapter.append(topic, data, options)
      } catch (error) {
        throw new EventLogAppendFailed(
          topic,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }

  /**
   * Consume events from a topic as a Source for streaming.
   *
   * Note: You must manually commit the cursor after processing to guarantee
   * at-least-once delivery. Auto-commit is intentionally omitted to prevent
   * data loss when using concurrent processing.
   *
   * @example Basic consumption
   * ```ts
   * const { successes, errors } = await log
   *   .consume("users", "processor-1")
   *   .withConcurrency(5)
   *   .map(async (batch) => {
   *     for (const event of batch.events) {
   *       await handleEvent(event.data);
   *     }
   *     await log.commit(batch.topic, batch.consumerGroup, batch.cursor).run();
   *   })
   *   .partition();
   * ```
   *
   * @example From specific cursor position
   * ```ts
   * const lastCursor = await log.getCommittedCursor("users", "processor-1").run();
   * const { successes } = await log
   *   .consume("users", "processor-1", { cursor: lastCursor })
   *   .tap(async (batch) => {
   *     for (const event of batch.events) {
   *       console.log(event);
   *     }
   *   })
   *   .partition();
   * ```
   */
  consume<T>(
    topic: string,
    consumerGroup: string,
    options?: ConsumeOptions,
  ): Source<EventBatch<T>, EventLogConsumeFailed> {
    const adapter = this.adapter
    return Source.from(async function* () {
      try {
        for await (
          const batch of adapter.consume<T>(topic, consumerGroup, options)
        ) {
          yield batch
        }
      } catch (error) {
        throw new EventLogConsumeFailed(
          topic,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }

  /**
   * Commit a cursor position for a consumer group.
   *
   * @example
   * ```ts
   * await log.commit("users", "processor-1", cursor).run();
   * ```
   */
  commit(
    topic: string,
    consumerGroup: string,
    cursor: string,
  ): Task<void, EventLogCommitCursorFailed> {
    return Task.of(async () => {
      try {
        await this.adapter.commitCursor(topic, consumerGroup, cursor)
      } catch (error) {
        throw new EventLogCommitCursorFailed(
          topic,
          consumerGroup,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }

  /**
   * Get the committed cursor position for a consumer group.
   *
   * @example
   * ```ts
   * const cursor = await log.getCommittedCursor("users", "processor-1").run();
   * if (cursor) {
   *   console.log(`Resuming from cursor: ${cursor}`);
   * }
   * ```
   */
  getCommittedCursor(
    topic: string,
    consumerGroup: string,
  ): Task<string | null, EventLogGetCursorFailed> {
    return Task.of(async () => {
      try {
        return await this.adapter.getCursor(topic, consumerGroup)
      } catch (error) {
        throw new EventLogGetCursorFailed(
          topic,
          consumerGroup,
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }
}
