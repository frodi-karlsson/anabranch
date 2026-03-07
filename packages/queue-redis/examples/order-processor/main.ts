/**
 * Order Processing Worker Demo
 *
 * Demonstrates distributed order processing with Redis:
 * - Send orders to a queue with sendBatch
 * - Process orders concurrently with .withConcurrency()
 * - Handle transient errors with retry (nack with requeue)
 * - Route permanently failed orders to dead letter queue
 *
 * ## Setup
 *
 * Start Redis:
 * ```
 * docker run -d --name anabranch-redis -p 6379:6379 redis:7
 * ```
 *
 * Run:
 * ```
 * deno run -A examples/order-processor/main.ts
 * ```
 *
 * Clean up:
 * ```
 * docker rm -f anabranch-redis
 * ```
 */

import { Queue } from "@anabranch/queue";
import { createRedis } from "../../index.ts";
import process from "node:process";

async function main() {
  const connector = createRedis({
    connection: process.env["REDIS_URL"] ?? "redis://localhost:6379",
    prefix: "orders-demo",
    queues: {
      orders: {
        maxAttempts: 3,
        deadLetterQueue: "orders-dlq",
      },
    },
  });

  console.log("=== Order Processing Worker Demo ===\n");

  try {
    const queue = await Queue.connect(connector).run();

    const orders: Order[] = generateTestOrders(20);
    console.log(`Sending ${orders.length} orders to queue...`);
    const orderIds = await queue.sendBatch("orders", orders).run();
    console.log(`Orders enqueued: ${orderIds.length}\n`);

    console.log("Processing orders with concurrency=5...\n");

    const results: OrderResult[] = [];

    const { errors } = await queue
      .stream<Order>("orders", { count: 10, concurrency: 5 })
      .map(async (msg) => {
        const order = msg.data;
        console.log(
          `  [${msg.attempt}/${
            msg.attempt > 1 ? "retry" : "1st"
          }] Order ${order.orderId} (${order.items.length} items, $${order.total})`,
        );

        const result = await processOrder(order);
        return { msg, result };
      })
      .tap(async ({ msg, result }) => {
        if (result.status === "processed") {
          await queue.ack("orders", msg.id).run();
          results.push(result);
        } else if (result.status === "retrying") {
          await queue.nack("orders", msg.id, { requeue: true, delay: 1000 })
            .run();
          console.log(`    -> Scheduled for retry`);
        } else {
          await queue.nack("orders", msg.id, { deadLetter: true }).run();
          results.push(result);
        }
      })
      .partition();

    console.log("\n--- Processing Complete ---");
    console.log(
      `Processed: ${results.filter((r) => r.status === "processed").length}`,
    );
    console.log(
      `Failed (DLQ): ${results.filter((r) => r.status === "failed").length}`,
    );

    if (errors.length > 0) {
      console.log(`\nTransient errors (will retry): ${errors.length}`);
      errors.forEach((e) => console.log(`  - ${e.message}`));
    }

    const dlqResults = await queue.stream<DlqOrder>("orders-dlq", { count: 10 })
      .toArray();
    const dlqMessages = dlqResults.filter((r) => r.type === "success").map((
      r,
    ) => r.value);
    if (dlqMessages.length > 0) {
      console.log(
        `\nDead Letter Queue contains ${dlqMessages.length} failed orders:`,
      );
      dlqMessages.forEach((msg) => {
        console.log(
          `  - ${msg.data.originalId}: $${msg.data.data.total}`,
        );
      });
    }
  } finally {
    await connector.end();
  }
}

function generateTestOrders(count: number): Order[] {
  return Array.from({ length: count }, (_, i) => ({
    orderId: `ORD-${String(i + 1).padStart(4, "0")}`,
    userId: `user-${(i % 10) + 1}`,
    items: [
      {
        productId: `prod-${(i % 5) + 1}`,
        quantity: Math.floor(Math.random() * 3) + 1,
        price: Math.floor(Math.random() * 100) + 10,
      },
    ],
    total: Math.floor(Math.random() * 200) + 20,
  }));
}

async function processOrder(order: Order): Promise<OrderResult> {
  const orderNum = parseInt(order.orderId.split("-")[1]);

  if (orderNum % 11 === 0) {
    throw new Error("Database connection timeout");
  }

  if (orderNum % 7 === 0) {
    return {
      orderId: order.orderId,
      status: "failed",
      processedAt: new Date(),
    };
  }

  await delay(Math.random() * 50 + 10);
  return {
    orderId: order.orderId,
    status: "processed",
    processedAt: new Date(),
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);

interface Order {
  orderId: string;
  userId: string;
  items: { productId: string; quantity: number; price: number }[];
  total: number;
}

interface OrderResult {
  orderId: string;
  status: "processed" | "failed" | "retrying";
  processedAt: Date;
}

interface DlqOrder {
  originalId: string;
  originalQueue: string;
  data: Order;
  timestamp: number;
}
