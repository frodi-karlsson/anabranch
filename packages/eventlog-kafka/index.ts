/**
 * @anabranch/eventlog-kafka
 *
 * Kafka adapter for @anabranch/eventlog using kafkajs.
 * Supports Apache Kafka, Confluent Cloud, Redpanda, and other Kafka-compatible services.
 *
 * ## Connector vs Adapter
 *
 * A **KafkaConnector** produces connected **KafkaAdapter** instances. Use
 * `createKafka()` for production code to properly manage Kafka connections.
 *
 * ## Core Types
 *
 * - {@linkcode KafkaConnector} - Connection factory for Kafka
 * - {@linkcode KafkaOptions} - Configuration options for the connector
 * - {@linkcode KafkaCursor} - Cursor type for Kafka (partition/offset mappings)
 *
 * ## Error Types
 *
 * All errors are typed for catchable handling:
 * - {@linkcode EventLogKafkaConnectionFailed} - Connection establishment failed
 * - {@linkcode EventLogKafkaAppendFailed} - Append operation failed
 * - {@linkcode EventLogKafkaConsumeFailed} - Consume operation failed
 * - {@linkcode EventLogKafkaGetFailed} - Get event operation failed
 * - {@linkcode EventLogKafkaListFailed} - List events operation failed
 * - {@linkcode EventLogKafkaCommitCursorFailed} - Cursor commit failed
 * - {@linkcode EventLogKafkaGetCursorFailed} - Get cursor operation failed
 * - {@linkcode EventLogKafkaCloseFailed} - Close operation failed
 *
 * @example Basic usage with Task semantics
 * ```ts
 * import { EventLog } from "@anabranch/eventlog";
 * import { createKafka } from "@anabranch/eventlog-kafka";
 *
 * const connector = createKafka({ brokers: ["localhost:9092"] });
 * const log = await EventLog.connect(connector).run();
 *
 * const eventId = await log.append("users", { action: "created", userId: 123 }).run();
 * ```
 *
 * @example Consuming events as a stream with manual cursor commit
 * ```ts
 * const connector = createKafka({ brokers: ["localhost:9092"], groupId: "processor-1" });
 * const log = await EventLog.connect(connector).run();
 *
 * const { successes, errors } = await log
 *   .consume("users", "processor-1")
 *   .withConcurrency(5)
 *   .map(async (batch) => {
 *     for (const event of batch.events) {
 *       await processEvent(event.data);
 *     }
 *     await log.commit(batch.topic, batch.consumerGroup, batch.cursor).run();
 *   })
 *   .partition();
 * ```
 *
 * @example With SASL authentication for Confluent Cloud
 * ```ts
 * const connector = createKafka({
 *   brokers: ["your-broker.confluent.cloud:9092"],
 *   clientId: "my-app",
 *   groupId: "my-consumer-group",
 *   sasl: {
 *     mechanism: "plain",
 *     username: "your-api-key",
 *     password: "your-api-secret",
 *   },
 *   ssl: true,
 * });
 * ```
 *
 * @module
 */
export { createKafka } from './kafka.ts'
export type { KafkaConnector, KafkaCursor, KafkaOptions } from './kafka.ts'
export * from './errors.ts'
export { EventLog } from '@anabranch/eventlog'
