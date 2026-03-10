import { Channel, Task } from '@anabranch/anabranch'
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
 * Event log wrapper with Task/Stream semantics for event-sourced systems.
 *
 * Provides high-level methods for appending events, consuming streams,
 * and managing cursors. All operations return Tasks for composable error
 * handling.
 *
 * @example Basic usage
 * ```ts
 * import { EventLog, createInMemory } from "@anabranch/eventlog";
 *
 * const connector = createInMemory();
 * const log = await EventLog.connect(connector).run();
 *
 * // Append an event
 * const eventId = await log.append("users", { userId: 123 }).run();
 *
 * // Consume events as a stream
 * const { successes, errors } = await log
 *   .consume("users", "my-processor")
 *   .withConcurrency(5)
 *   .map(async (batch) => {
 *     for (const event of batch.events) {
 *       await processEvent(event.data);
 *     }
 *   })
 *   .partition();
 *
 * await log.close().run();
 * ```
 *
 * @example Manual cursor management
 * ```ts
 * // Get current cursor position
 * const cursor = await log.getCommittedCursor("users", "my-processor").run();
 *
 * // Save cursor after processing
 * await log.commit("users", "my-processor", batch.cursor).run();
 * ```
 */
export class EventLog<Cursor = string> {
  constructor(private readonly adapter: EventLogAdapter<Cursor>) {}

  /**
   * Connect to an event log via a connector.
   *
   * @example
   * ```ts
   * const log = await EventLog.connect(createInMemory()).run();
   * ```
   */
  static connect<Cursor = string>(
    connector: EventLogConnector<Cursor>,
  ): Task<EventLog<Cursor>, EventLogConnectionFailed> {
    return Task.of(async () => {
      try {
        return new EventLog<Cursor>(await connector.connect())
      } catch (error) {
        throw new EventLogConnectionFailed(
          error instanceof Error ? error.message : String(error),
          error,
        )
      }
    })
  }

  /**
   * Close the event log connection.
   *
   * After closing, no further operations can be performed on this instance.
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
   * Returns the event ID which can be used for logging or correlation.
   *
   * @example
   * ```ts
   * const eventId = await log.append("users", { action: "created" }).run();
   *
   * // With options
   * await log.append("orders", order, {
   *   partitionKey: order.userId,
   *   metadata: { source: "checkout" },
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
   * Consume events from a topic as a stream.
   *
   * Returns a Channel that yields batches of events. Each batch includes
   * a cursor that can be committed to mark progress. Use stream methods
   * like `withConcurrency()`, `map()`, and `partition()` for processing.
   *
   * Batches are delivered asynchronously as they become available. Use
   * `take()` to limit iterations or pass an AbortSignal in options to
   * cancel consumption.
   *
   * @example
   * ```ts
   * const ac = new AbortController();
   *
   * await log.consume("users", "processor-1", { signal: ac.signal })
   *   .withConcurrency(10)
   *   .map(async (batch) => {
   *     for (const event of batch.events) {
   *       await processUser(event.data);
   *     }
   *     await batch.commit(); // Mark progress
   *   })
   *   .partition();
   *
   * ac.abort(); // Stop consumption
   * ```
   *
   * @example Resume from a saved cursor
   * ```ts
   * const cursor = await log.getCommittedCursor("users", "processor-1").run();
   * const stream = log.consume("users", "processor-1", { cursor });
   * ```
   */
  consume<T>(
    topic: string,
    consumerGroup: string,
    options?: ConsumeOptions<Cursor>,
  ): Channel<EventBatch<T, Cursor>, EventLogConsumeFailed> {
    if (options?.bufferSize !== undefined) {
      if (options.bufferSize <= 0 || !Number.isInteger(options.bufferSize)) {
        throw new Error('bufferSize must be a positive integer')
      }
    }

    if (options?.batchSize !== undefined) {
      if (options.batchSize <= 0 || !Number.isInteger(options.batchSize)) {
        throw new Error('batchSize must be a positive integer')
      }
    }

    const channel = new Channel<EventBatch<T, Cursor>, EventLogConsumeFailed>({
      onDrop: (batch) => {
        channel.fail(
          new EventLogConsumeFailed(
            topic,
            consumerGroup,
            `Batch dropped due to full buffer (events ${
              batch.events
                .map((e) => e.id)
                .join(',')
            })`,
          ),
        )
      },
      onClose: () => close(),
      bufferSize: options?.bufferSize ?? Infinity,
      signal: options?.signal,
    })

    const { close } = this.adapter.consume<T>(
      topic,
      consumerGroup,
      async (batch) => {
        await channel.waitForCapacity()
        channel.send(batch)
      },
      (error) => {
        channel.fail(
          new EventLogConsumeFailed(
            topic,
            consumerGroup,
            error instanceof Error ? error.message : String(error),
          ),
        )
      },
      options,
    )

    return channel
  }

  /**
   * Commit a cursor to mark progress for a consumer group.
   *
   * This is for administrative use cases where you can't commit in-band, preferably when you're
   * not actively consuming events. For example, you might want to skip ahead after a downtime or reset to the beginning for reprocessing.
   * Do prefer to commit in-band, i.e. after processing each batch, by calling `batch.commit()`.
   *
   * After processing events, commit the cursor to resume from that position
   * on the next run. Cursors are obtained from `batch.cursor` in the consume
   * stream or from `getCommittedCursor()`.
   *
   * @example
   * ```ts
   * await log.commit("users", "processor-1", batch.cursor).run();
   * ```
   */
  commit(
    topic: string,
    consumerGroup: string,
    cursor: Cursor,
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
   * Get the last committed cursor for a consumer group.
   *
   * Returns null if no cursor has been committed yet. Use this to resume
   * consumption from the last processed position.
   *
   * @example
   * ```ts
   * const cursor = await log.getCommittedCursor("users", "processor-1").run();
   * if (cursor) {
   *   // Resume from saved position
   *   const stream = log.consume("users", "processor-1", { cursor });
   * }
   * ```
   */
  getCommittedCursor(
    topic: string,
    consumerGroup: string,
  ): Task<Cursor | null, EventLogGetCursorFailed> {
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
