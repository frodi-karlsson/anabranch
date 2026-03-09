# @anabranch/queue-rabbitmq

RabbitMQ adapter for @anabranch/queue using amqplib.

## Usage

```ts
import { Queue } from '@anabranch/queue'
import { createRabbitMQ } from '@anabranch/queue-rabbitmq'

const connector = createRabbitMQ('amqp://localhost:5672')
const queue = await Queue.connect(connector).run()

await queue.send('notifications', { userId: 123, type: 'welcome' })

const { successes, errors } = await queue
  .stream('notifications')
  .withConcurrency(5)
  .map(async (msg) => await sendNotification(msg.data))
  .partition()

await queue.close().run()
```

## API

### createRabbitMQ(options)

Creates a RabbitMQ queue connector.

```ts
import { createRabbitMQ } from '@anabranch/queue-rabbitmq'

const connector = createRabbitMQ({
  connection: 'amqp://localhost:5672',
  prefix: 'myapp',
  queues: {
    orders: {
      maxAttempts: 5,
      deadLetterQueue: 'orders-dlq',
    },
  },
  defaultPrefetch: 10,
})
```

**Options:**

- `connection` - RabbitMQ URL or amqplib connection options
- `prefix` - Key prefix for queue names (default: "abq")
- `queues` - Per-queue configuration
- `defaultPrefetch` - Default prefetch count (default: 10)

### Message Headers

Headers can be attached to messages for routing and correlation:

```ts
await queue.send('orders', order, {
  headers: {
    'x-correlation-id': 'abc-123',
    'x-source': 'checkout-service',
  },
}).run()
```

Headers are surfaced in `metadata.headers` on received messages.

### Delayed Messages

**Note:** Delayed messages require the
[rabbitmq-delayed-message-exchange plugin](https://github.com/rabbitmq/rabbitmq-delayed-message-exchange).
Without it, specifying `delayMs` will throw an error.

```ts
await queue.send('notifications', reminder, { delayMs: 30_000 }).run()
```

### Dead Letter Queue

```ts
const connector = createRabbitMQ({
  connection: 'amqp://localhost:5672',
  queues: {
    orders: {
      maxAttempts: 3,
      deadLetterQueue: 'orders-dlq',
    },
  },
})
```

When a message exceeds max delivery attempts, it is routed to the dead letter
queue with metadata about the original message.

### Attempt Counting

Attempt counts are tracked in the message envelope and incremented when a
message is nacked with `requeue: true`. This works with all RabbitMQ versions
and queue types (classic or quorum).

## Requirements

- RabbitMQ 3.8+ (for x-delivery-count support)
- For delayed messages: rabbitmq-delayed-message-exchange plugin

## Environment Variables

- `RABBITMQ_URL` - Default connection URL when no options provided (default:
  amqp://localhost:5672)
