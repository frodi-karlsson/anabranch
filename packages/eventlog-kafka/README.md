# @anabranch/eventlog-kafka

Kafka adapter for `@anabranch/eventlog` using [kafkajs](https://kafka.js.org/).
Provides Task/Stream semantics for event-sourced systems with Apache Kafka,
Confluent Cloud, Redpanda, and other Kafka-compatible services.

## Usage

```ts
import { createKafka, EventLog } from '@anabranch/eventlog-kafka'

const connector = createKafka({ brokers: ['localhost:9092'] })
const log = await EventLog.connect(connector).run()

const eventId = await log.append('users', { action: 'created', userId: 123 })
  .run()
const events = await log.list('users').run()

await log.close().run()
```

## API

### `createKafka(options)`

Creates a Kafka connector for the event log.

```ts
import { createKafka } from '@anabranch/eventlog-kafka'

const connector = createKafka({
  brokers: ['localhost:9092'],
  clientId: 'my-app',
  groupId: 'my-consumer-group',
  sasl: {
    mechanism: 'plain',
    username: 'admin',
    password: 'secret',
  },
  ssl: true,
})
```

#### Options

- `brokers` (required): Array of Kafka broker addresses
- `clientId`: Client ID for the producer/consumer (default:
  `"anabranch-eventlog"`)
- `groupId`: Consumer group ID (default: `"anabranch-eventlog"`)
- `sasl`: SASL authentication configuration
- `ssl`: Enable SSL/TLS (default: `false`)
- `defaultPartition`: Default partition for operations (default: `0`)
- `connectionTimeout`: Connection timeout in ms (default: `10000`)
- `requestTimeout`: Request timeout in ms (default: `30000`)
- `defaultPartitionKey`: Default partition key if not specified (default:
  `"default"`)

### EventLog operations

All EventLog methods return `Task` types for composable error handling:

```ts
const log = await EventLog.connect(connector).run()

// Append events
const eventId = await log.append('topic', data, { partitionKey: 'user-123' })
  .run()

// List events
const events = await log.list('topic', { fromSequenceNumber: 0, limit: 100 })
  .run()

// Consume as a stream
const { successes, errors } = await log
  .consume('topic', 'consumer-group', { batchSize: 50 })
  .withConcurrency(5)
  .map(async (batch) => {
    for (const event of batch.events) {
      await processEvent(event.data)
    }
    await log.commit(batch.topic, batch.consumerGroup, batch.cursor).run()
  })
  .partition()
```

## Error Handling

All operations throw typed errors that can be caught and handled:

```ts
try {
  await log.append('topic', data).run()
} catch (error) {
  if (error instanceof EventLogKafkaAppendFailed) {
    console.error(`Failed to append to ${error.topic}:`, error.message)
  }
  throw error
}
```

## Testing

This package requires a running Kafka instance for integration tests. Unit tests
mock the Kafka client for isolated testing.

```bash
deno test packages/eventlog-kafka/
```
