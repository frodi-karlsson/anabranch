# @anabranch/queue

Queue primitives with Task/Stream semantics for error-tolerant message
processing.

## Description

A queue abstraction that integrates with anabranch's Task and Stream types for
composable error handling, concurrent processing, and automatic resource
management.

## Features

- **Task/Stream Integration**: Leverage Task's retry/timeout and Stream's error
  collection
- **Multiple Adapters**: In-memory implementation included, Redis/RabbitMQ/SQS
  coming soon
- **Delayed Messages**: Support for scheduled/delayed message delivery
- **Dead Letter Queues**: Automatic routing of failed messages after max
  attempts
- **Batch Operations**: Send multiple messages, acknowledge multiple at once

## Installation

```bash
# JSR
jsr add @anabranch/queue

# Deno
deno add @anabranch/queue
```

## Quick Start

```ts
import { createInMemory, Queue } from '@anabranch/queue'

const connector = createInMemory()
const queue = await Queue.connect(connector).run()

// Send a message
const id = await queue
  .send('notifications', { type: 'welcome', userId: 123 })
  .run()

// Process messages with error collection
const { successes, errors } = await queue
  .stream('notifications', { concurrency: 5 })
  .map(async (msg) => await sendNotification(msg.data))
  .tapErr((err) => logError(err))
  .collect()
  .then((results) => {
    const successes: typeof results = []
    const errors: typeof results = []
    for (const r of results) {
      if (r.type === 'success') successes.push(r)
      else errors.push(r)
    }
    return { successes, errors }
  })
```

## API

### Queue.send

Send a message to a queue with optional delay:

```ts
await queue.send('my-queue', { key: 'value' }, { delayMs: 30_000 }).run()
```

### Queue.stream

Stream messages with concurrent processing:

```ts
const { successes, errors } = await queue
  .stream('orders', { count: 10, concurrency: 10 })
  .map(async (msg) => await processOrder(msg.data))
  .partition()
```

### Queue.ack / Queue.nack

Acknowledge successful processing or negative acknowledge with requeue:

```ts
await queue.nack('orders', msg.id, { requeue: true, delay: 5_000 }).run()

// Or route to dead letter queue
await queue.nack('orders', msg.id, { deadLetter: true }).run()
```

### Queue.sendBatch

Send multiple messages efficiently:

```ts
const ids = await queue
  .sendBatch('notifications', [
    { to: 'user1@example.com' },
    { to: 'user2@example.com' },
  ])
  .run()
```

## Configuration

### In-Memory Queue Options

```ts
const connector = createInMemory({
  maxBufferSize: 1000,
  queues: {
    orders: {
      maxAttempts: 3,
      deadLetterQueue: 'orders-failed',
    },
  },
})
```

## Error Handling

All errors are typed for catchable handling:

- `QueueConnectionFailed` - Connection establishment failed
- `QueueSendFailed` - Send operation failed
- `QueueReceiveFailed` - Receive operation failed
- `QueueAckFailed` - Acknowledgment failed

```ts
try {
  await queue.send('my-queue', data).run()
} catch (error) {
  if (error instanceof QueueSendFailed) {
    console.error('Failed to send:', error.message)
  }
}
```

## Related

- [@anabranch/anabranch](https://jsr.io/@anabranch/anabranch) - Core Task/Stream
  primitives
- [@anabranch/db](https://jsr.io/@anabranch/db) - Database adapter pattern
  (inspiration for this package)
