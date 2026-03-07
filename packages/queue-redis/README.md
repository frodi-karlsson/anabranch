# @anabranch/queue-redis

Redis adapter for @anabranch/queue using ioredis.

## Usage

```ts
import { Queue } from "@anabranch/queue";
import { createRedis } from "@anabranch/queue-redis";

const connector = createRedis("redis://localhost:6379");
const queue = await Queue.connect(connector).run();

await queue.send("notifications", { userId: 123, type: "welcome" }).run();

const { successes, errors } = await queue
  .stream("notifications")
  .withConcurrency(5)
  .map(async (msg) => await sendNotification(msg.data))
  .partition();

await queue.close().run();
```

## API

### createRedis(options)

Creates a Redis queue connector.

```ts
import { createRedis } from "@anabranch/queue-redis";

const connector = createRedis({
  connection: "redis://localhost:6379",
  prefix: "myapp",
  queues: {
    orders: {
      maxAttempts: 5,
      visibilityTimeout: 60_000,
      deadLetterQueue: "orders-dlq",
    },
  },
  defaultVisibilityTimeout: 30_000,
  defaultMaxAttempts: 3,
});
```

**Options:**

- `connection` - Redis URL or ioredis connection options
- `prefix` - Key prefix for all Redis keys (default: "abq")
- `queues` - Per-queue configuration
- `defaultVisibilityTimeout` - Default visibility timeout in ms (default: 30000)
- `defaultMaxAttempts` - Default max delivery attempts (default: 3)

### Message Headers

Headers can be attached to messages for routing and correlation:

```ts
await queue.send("orders", order, {
  headers: {
    "x-correlation-id": "abc-123",
    "x-source": "checkout-service",
  },
}).run();
```

Headers are surfaced in `metadata.headers` on received messages.

### Delayed Messages

```ts
await queue.send("notifications", reminder, { delayMs: 30_000 }).run();
```

### Dead Letter Queue

```ts
const connector = createRedis({
  connection: "redis://localhost:6379",
  queues: {
    orders: {
      maxAttempts: 3,
      deadLetterQueue: "orders-dlq",
    },
  },
});
```

When a message exceeds max delivery attempts, it is routed to the dead letter
queue with metadata about the original message.

## Redis Data Model

| Key                         | Type       | Purpose            |
| --------------------------- | ---------- | ------------------ |
| `{prefix}:{queue}:pending`  | Sorted Set | Available messages |
| `{prefix}:{queue}:delayed`  | Sorted Set | Scheduled messages |
| `{prefix}:{queue}:inflight` | Hash       | Unacked messages   |
| `{prefix}:{queue}:data`     | Hash       | Message envelopes  |
