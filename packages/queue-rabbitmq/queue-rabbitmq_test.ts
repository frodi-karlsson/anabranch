/**
 * Integration tests for queue-rabbitmq require a live RabbitMQ instance.
 * Set RABBITMQ_URL environment variable to run them (e.g., amqp://localhost:5672).
 * CI uses GitHub Actions service containers for this.
 */
import { assertEquals, assertExists } from "@std/assert";
import { createRabbitMQ } from "./index.ts";

const RABBITMQ_URL = Deno.env.get("RABBITMQ_URL");

Deno.test("createRabbitMQ - should return a valid connector", () => {
  const connector = createRabbitMQ("amqp://localhost:5672");
  assertEquals(typeof connector.connect, "function");
});

Deno.test("createRabbitMQ - should accept connection string", () => {
  const connector = createRabbitMQ("amqp://localhost:5672");
  assertEquals(typeof connector.connect, "function");
});

Deno.test("createRabbitMQ - should accept individual options", () => {
  const connector = createRabbitMQ({
    connection: { hostname: "localhost", port: 5672 },
  });
  assertEquals(typeof connector.connect, "function");
});

Deno.test("createRabbitMQ - should use RABBITMQ_URL env var", () => {
  const original = Deno.env.get("RABBITMQ_URL");
  Deno.env.set("RABBITMQ_URL", "amqp://localhost:5672");
  try {
    const connector = createRabbitMQ();
    assertEquals(typeof connector.connect, "function");
  } finally {
    if (original !== undefined) {
      Deno.env.set("RABBITMQ_URL", original);
    } else {
      Deno.env.delete("RABBITMQ_URL");
    }
  }
});

Deno.test({
  name: "RabbitMQQueue - send and receive basic message",
  ignore: !RABBITMQ_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queue = await connector.connect();

    const id = await queue.send(queueName, { value: "hello" });
    assertExists(id);

    const messages = await queue.receive<{ value: string }>(queueName);
    assertEquals(messages.length, 1);
    assertEquals(messages[0].data.value, "hello");

    await queue.ack(queueName, messages[0].id);
    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - send and receive multiple messages",
  ignore: !RABBITMQ_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queue = await connector.connect();

    await queue.send(queueName, { id: 1 });
    await queue.send(queueName, { id: 2 });
    await queue.send(queueName, { id: 3 });

    const messages = await queue.receive<{ id: number }>(queueName, 10);
    assertEquals(messages.length, 3);

    await queue.ack(queueName, ...messages.map((m) => m.id));
    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - ack removes message from queue",
  ignore: !RABBITMQ_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queue = await connector.connect();

    await queue.send(queueName, { data: "test" });

    const messages = await queue.receive<{ data: string }>(queueName);
    assertEquals(messages.length, 1);

    await queue.ack(queueName, messages[0].id);

    const afterAck = await queue.receive<{ data: string }>(queueName);
    assertEquals(afterAck.length, 0);

    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - nack with requeue redelivers message",
  ignore: !RABBITMQ_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queue = await connector.connect();

    await queue.send(queueName, { data: "original" });

    const first = await queue.receive<{ data: string }>(queueName);
    assertEquals(first.length, 1);
    assertEquals(first[0].attempt, 1);

    await queue.nack(queueName, first[0].id, { requeue: true });

    const second = await queue.receive<{ data: string }>(queueName);
    assertEquals(second.length, 1);
    assertEquals(second[0].attempt, 2);

    await queue.ack(queueName, second[0].id);
    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - nack with requeue=false routes to DLQ",
  ignore: !RABBITMQ_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queue = await connector.connect();

    await queue.send(queueName, { data: "failing" });

    const messages = await queue.receive<{ data: string }>(queueName);
    assertEquals(messages.length, 1);

    await queue.nack(queueName, messages[0].id, { requeue: false });

    // RabbitMQ routes dead-lettered messages asynchronously on the broker side
    await new Promise((r) => setTimeout(r, 50));

    const dlqName = `${queueName}.failed`;
    const dlq = await queue.receive(dlqName);
    assertEquals(dlq.length, 1);

    await queue.ack(dlqName, dlq[0].id);
    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - nack with deadLetter=true routes to DLQ",
  ignore: !RABBITMQ_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;
    const dlqName = `${queueName}-custom-dlq`;
    const connector = createRabbitMQ({
      connection: RABBITMQ_URL!,
      queues: {
        [queueName]: {
          deadLetterQueue: dlqName,
        },
      },
    });
    const queue = await connector.connect();

    await queue.send(queueName, { data: "failing" });

    const messages = await queue.receive<{ data: string }>(queueName);
    assertEquals(messages.length, 1);

    await queue.nack(queueName, messages[0].id, { deadLetter: true });

    // RabbitMQ routes dead-lettered messages asynchronously on the broker side
    await new Promise((r) => setTimeout(r, 50));

    const dlq = await queue.receive(dlqName);
    assertEquals(dlq.length, 1);

    await queue.ack(dlqName, dlq[0].id);
    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - headers propagation",
  ignore: !RABBITMQ_URL,
  async fn() {
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queue = await connector.connect();

    await queue.send(queueName, { data: "test" }, {
      headers: {
        "x-correlation-id": "abc-123",
        "x-source": "test-service",
      },
    });

    const messages = await queue.receive<{ data: string }>(queueName);
    assertEquals(messages.length, 1);
    assertEquals(
      messages[0].metadata?.headers?.["x-correlation-id"],
      "abc-123",
    );
    assertEquals(
      messages[0].metadata?.headers?.["x-source"],
      "test-service",
    );

    await queue.ack(queueName, messages[0].id);
    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - connector reuses connection across connect() calls",
  ignore: !RABBITMQ_URL,
  async fn() {
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;

    const queue1 = await connector.connect();
    const id1 = await queue1.send(queueName, { n: 1 });
    assertExists(id1);
    await queue1.close();

    const queue2 = await connector.connect();
    const messages = await queue2.receive<{ n: number }>(queueName);
    assertEquals(messages.length, 1);
    assertEquals(messages[0].data.n, 1);
    await queue2.ack(queueName, messages[0].id);
    await queue2.close();

    await connector.end();
  },
});

Deno.test({
  name: "RabbitMQQueue - close() closes channel but not connection",
  ignore: !RABBITMQ_URL,
  async fn() {
    const connector = createRabbitMQ(RABBITMQ_URL!);
    const queueName = `test-${crypto.randomUUID().slice(0, 8)}`;

    const queue1 = await connector.connect();
    await queue1.send(queueName, { data: "test" });
    await queue1.close();

    const queue2 = await connector.connect();
    const messages = await queue2.receive<{ data: string }>(queueName);
    assertEquals(messages.length, 1);
    await queue2.ack(queueName, messages[0].id);
    await queue2.close();

    await connector.end();
  },
});
