# @anabranch/eventlog

Event log with **Task/Stream** semantics for event-sourced systems. Built for
reliable, cursor-based consumption and functional error handling.

## Description

A high-level event log abstraction that integrates with `@anabranch/task`. By
representing log operations as **Tasks**, you get first-class support for
retries, timeouts, and `AbortSignal` propagation out of the box.

This library provides a unified interface for appending and consuming events
across different storage backends while maintaining strict type safety and lazy
execution patterns.

## Features

- **Lazy Execution**: Operations return a `Task`. Nothing happens until you
  `.run()`.
- **First-Class Cancellation**: Built-in `AbortSignal` merging across all
  operations.
- **Cursor-Based**: Resume processing from any position with consumer groups.
- **At-Least-Once Delivery**: Manual acknowledgement gives you full control.
- **Pluggable Architecture**: Standardized adapter interface for any storage
  backend.

## Installation

```bash
# JSR
jsr add @anabranch/eventlog

# Deno
deno add @anabranch/eventlog
```

## Quick Start

```ts
import { createInMemory, EventLog } from "@anabranch/eventlog";

const connector = createInMemory();

// Compose your logic as a Task chain
const program = EventLog.connect(connector).flatMap((log) => {
  return log
    .append("users", { type: "signup", email: "alice@example.com" })
    .tap(() => console.log("Event appended!"))
    .flatMap(() => log.get("users", 0));
});

// Execute the task at the edge of your application
const result = await program.result();

if (result.type === "success") {
  console.log("User at sequence 0:", result.value);
}
```

## Reliable Consumption

The `.consume()` method returns a Stream of batches. To guarantee at-least-once
delivery, you manually commit the cursor after successful processing.

```ts
const log = await EventLog.connect(connector).run();

const consumer = log
  .consume("users", "email-service", { batchSize: 10 })
  .map(async (batch) => {
    // 1. Process your events
    for (const event of batch.events) {
      await sendWelcomeEmail(event.data);
    }
    // 2. Commit the cursor only after success
    await log.commit(batch.topic, batch.consumerGroup, batch.cursor).run();
  });

// Run the consumer
await consumer.run();
```

## API

### `EventLog.connect(adapter)`

Initializes the connection. Returns a
`Task<EventLog, EventLogConnectionFailed>`.

### `log.append(topic, data, options?)`

Appends an event. Options include `partitionKey` and `metadata`.\
Returns `Task<string, EventLogAppendFailed>`.

### `log.consume(topic, consumerGroup, options?)`

Returns a Stream of event batches. If a cursor is found for the group, it
resumes automatically.

### `log.commit(topic, consumerGroup, cursor)`

Persists the progress for a specific consumer group.

---

## Error Handling

Because operations are Tasks, you can handle failures declaratively:

```ts
const task = log.append("orders", data)
  .retry({
    attempts: 3,
    delay: (n) => Math.pow(2, n) * 1000, // Exponential backoff
    when: (err) => err instanceof EventLogAppendFailed,
  })
  .timeout(5000)
  .recover((err) => {
    console.error("Critical failure:", err);
    return "FALLBACK_ID";
  });

const eventId = await task.run();
```

## Related

- [@anabranch/task](https://jsr.io/@anabranch/task) - Core Task primitives
- [@anabranch/stream](https://jsr.io/@anabranch/stream) - Reactive stream
  processing
