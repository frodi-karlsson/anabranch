# @anabranch/eventlog

Event log with Task/Stream semantics for event-sourced systems with cursor-based
consumption.

A high-level event log abstraction that integrates with anabranch's Task and
Stream types for composable error handling, concurrent processing, and reliable
consumer resumption.

## Usage

```ts
import { createInMemory, EventLog } from '@anabranch/eventlog'

const connector = createInMemory()
const log = await EventLog.connect(connector).run()

// Append an event
await log.append('users', { type: 'created', userId: 123 }).run()

// Consume events with cursor-based resumption
const { successes, errors } = await log
  .consume('users', 'my-processor', { batchSize: 10 })
  .withConcurrency(5)
  .map(async (batch) => {
    for (const event of batch.events) {
      await handleEvent(event.data)
    }
    // Manual commit for at-least-once delivery
    await log.commit(batch.topic, batch.consumerGroup, batch.cursor).run()
  })
  .partition()
```

## Installation

```bash
# JSR
jsr add @anabranch/eventlog

# Deno
deno add @anabranch/eventlog
```

## Features

- **Cursor-Based Consumption**: Resume processing from any position without data
  loss
- **At-Least-Once Delivery**: Manual commit gives you control over processing
  guarantees
- **Task/Stream Integration**: Leverage Task's retry/timeout and Stream's error
  collection
- **Multiple Adapters**: In-memory implementation included

## API Reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/eventlog)
for full API details.

## Related

- [@anabranch/anabranch](https://jsr.io/@anabranch/anabranch) - Core Task/Stream
  primitives
