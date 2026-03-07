/**
 * Notification Worker Demo
 *
 * Demonstrates push-based message streaming with RabbitMQ:
 * - Native subscribe() for broker-pushed messages (no polling)
 * - Continuous stream with graceful shutdown via AbortSignal
 * - Concurrent processing with prefetch control
 * - Automatic dead letter queue for failed messages
 *
 * ## Setup
 *
 * Start RabbitMQ:
 * ```
 * docker run -d --name anabranch-rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
 * ```
 * Wait for RabbitMQ: `docker exec anabranch-rabbitmq rabbitmq-diagnostics ping`
 *
 * Run:
 * ```
 * deno run -A examples/notification-worker/main.ts
 * ```
 *
 * Clean up:
 * ```
 * docker rm -f anabranch-rabbitmq
 * ```
 */

import { Queue } from "@anabranch/queue";
import { createRabbitMQ } from "../../index.ts";
import process from "node:process";

async function main() {
  const connector = createRabbitMQ({
    connection: process.env["RABBITMQ_URL"] ?? "amqp://localhost:5672",
    prefix: "notifications-demo",
    queues: {
      notifications: {
        maxAttempts: 2,
        deadLetterQueue: "notifications-dlq",
      },
    },
    defaultPrefetch: 5,
  });

  console.log("=== Notification Worker Demo ===\n");

  const ac = new AbortController();

  try {
    const queue = await Queue.connect(connector).run();

    console.log("Starting continuous notification stream...\n");

    const sentResults: { msg: unknown; result: NotificationResult }[] = [];
    const errors: Error[] = [];

    queue
      .continuousStream<Notification>("notifications", {
        signal: ac.signal,
        count: 5,
      })
      .withConcurrency(3)
      .map(async (msg) => {
        const notification = msg.data;
        console.log(
          `  [${msg.attempt}] ${notification.type.toUpperCase()} to ${notification.userId}: ${
            notification.subject ?? notification.body.substring(0, 30)
          }`,
        );

        const result = await sendNotification(notification);
        return { msg, result };
      })
      .tap(async ({ msg, result }) => {
        if (result.status === "sent") {
          await queue.ack("notifications", msg.id).run();
          sentResults.push({ msg, result });
        } else if (result.status === "skipped") {
          console.log(`    -> Skipped (user unsubscribed)`);
          await queue.ack("notifications", msg.id).run();
          sentResults.push({ msg, result });
        } else {
          console.log(`    -> Failed, routing to DLQ`);
          await queue.nack("notifications", msg.id, { deadLetter: true }).run();
          sentResults.push({ msg, result });
        }
      })
      .tapErr((err) => {
        errors.push(err);
        console.log(`  [error] ${err.message}`);
      })
      .collect();

    await simulateIncomingNotifications(queue);

    await delay(800);
    console.log("\nShutting down worker...");
    ac.abort();

    await delay(500);

    console.log("\n--- Processing Complete ---");
    console.log(
      `Sent: ${sentResults.filter((s) => s.result.status === "sent").length}`,
    );
    console.log(
      `Skipped: ${
        sentResults.filter((s) => s.result.status === "skipped").length
      }`,
    );
    console.log(
      `DLQ: ${sentResults.filter((s) => s.result.status === "failed").length}`,
    );
    console.log(`Transient errors: ${errors.length}`);

    const dlqResults = await queue.stream<Notification>("notifications-dlq", {
      count: 10,
    }).toArray();
    const dlqMessages = dlqResults.filter((r) => r.type === "success").map((
      r,
    ) => r.value);
    if (dlqMessages.length > 0) {
      console.log(
        `\nDead Letter Queue: ${dlqMessages.length} failed notifications`,
      );
      dlqMessages.forEach((msg) => {
        console.log(
          `  - ${msg.data.notificationId}: ${msg.data.body.substring(0, 30)}`,
        );
      });
    }
  } finally {
    await connector.end();
  }
}

async function simulateIncomingNotifications(queue: Queue): Promise<void> {
  const notifications: Notification[] = [
    {
      notificationId: "notif-001",
      userId: "user-1",
      type: "email",
      subject: "Welcome!",
      body: "Thanks for signing up",
      priority: 1,
    },
    {
      notificationId: "notif-002",
      userId: "user-2",
      type: "push",
      body: "Your order has shipped",
      priority: 2,
    },
    {
      notificationId: "notif-003",
      userId: "user-3",
      type: "sms",
      body: "Your code: 123456",
      priority: 3,
    },
    {
      notificationId: "notif-004",
      userId: "user-4",
      type: "email",
      subject: "Password Reset",
      body: "Click here to reset",
      priority: 1,
    },
    {
      notificationId: "notif-005",
      userId: "user-5",
      type: "push",
      body: "New message from friend",
      priority: 2,
    },
    {
      notificationId: "notif-006",
      userId: "user-6",
      type: "email",
      subject: "Weekly Digest",
      body: "This week's top stories...",
      priority: 4,
    },
    {
      notificationId: "notif-007",
      userId: "user-1",
      type: "push",
      body: "Your daily summary",
      priority: 2,
    },
  ];

  for (const notif of notifications) {
    await queue.send("notifications", notif).run();
    await delay(100);
  }
  console.log(`\nSent ${notifications.length} notifications to queue`);
}

async function sendNotification(
  notification: Notification,
): Promise<NotificationResult> {
  const userNum = parseInt(notification.userId.split("-")[1]);

  if (userNum % 8 === 0) {
    throw new Error("External service timeout");
  }

  if (userNum % 5 === 0) {
    return { notificationId: notification.notificationId, status: "skipped" };
  }

  await delay(Math.random() * 30 + 10);
  return {
    notificationId: notification.notificationId,
    status: "sent",
    sentAt: new Date(),
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);

interface Notification {
  notificationId: string;
  userId: string;
  type: "email" | "push" | "sms";
  subject?: string;
  body: string;
  priority: number;
}

interface NotificationResult {
  notificationId: string;
  status: "sent" | "skipped" | "failed";
  sentAt?: Date;
}
