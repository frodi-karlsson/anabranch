/**
 * @anabranch/queue-rabbitmq
 *
 * RabbitMQ adapter for @anabranch/queue using `amqplib`.
 *
 * Provides a `QueueConnector` implementation backed by RabbitMQ, using
 * prefetch-based consumer for broker-pushed messages. Supports delayed
 * messages, dead letter queues, and automatic queue declaration.
 *
 * @example
 * ```ts
 * import { Queue } from "@anabranch/queue";
 * import { createRabbitMQ } from "@anabranch/queue-rabbitmq";
 *
 * const connector = createRabbitMQ({
 *   connection: "amqp://localhost:5672",
 *   prefix: "my-app",
 *   queues: {
 *     notifications: { maxAttempts: 3, deadLetterQueue: "notifications-dlq" },
 *   },
 * });
 * const queue = await Queue.connect(connector).run();
 *
 * await queue.send("notifications", { userId: 123, type: "email" }).run();
 * ```
 *
 * @module
 */
export {
  createRabbitMQ,
  type RabbitMQConnector,
  type RabbitMQQueueOptions,
} from "./connector.ts";
export { RabbitMQAdapter } from "./adapter.ts";
