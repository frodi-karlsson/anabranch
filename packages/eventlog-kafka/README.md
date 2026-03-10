# @anabranch/eventlog-kafka

Kafka adapter for `@anabranch/eventlog` using [kafkajs](https://kafka.js.org/).
Provides Task/Stream semantics for event-sourced systems with Apache Kafka,
Confluent Cloud, Redpanda, and other Kafka-compatible services.

## Usage

```ts
import { EventLog } from '@anabranch/eventlog'
import { createKafka } from '@anabranch/eventlog-kafka'

const connector = createKafka({
  brokers: ['localhost:9092'],
  clientId: 'my-app',
  consumer: {
    maxWaitTimeInMs: 100,
    sessionTimeout: 6000,
  },
})

const log = await EventLog.connect(connector).run()

// Append events with partition keys
const eventId = await log.append('users', {
  type: 'UserCreated',
  userId: 'user-123',
  email: 'alice@example.com',
}, { partitionKey: 'user-123' }).run()

// Consume events as a stream
await log
  .consume<UserEvent>('users', 'my-processor', {
    batchSize: 50,
  })
  .tap((batch) => {
    for (const event of batch.events) {
      console.log(event.data)
    }
  })
  .map(async (batch) => {
    await batch.commit()
  })
  .partition()
```

## API

### createKafka(options)

Creates a Kafka connector.

```ts
import { createKafka } from '@anabranch/eventlog-kafka'

const connector = createKafka({
  brokers: ['localhost:9092'],
  clientId: 'my-app',
  sasl: {
    mechanism: 'plain',
    username: 'admin',
    password: 'secret',
  },
  ssl: true,
  consumer: {
    maxWaitTimeInMs: 100,
    sessionTimeout: 6000,
  },
})
```

#### Options

- `brokers` (required): Array of Kafka broker addresses
- `clientId`: Client ID for the producer
- `sasl`: SASL authentication configuration
- `ssl`: Enable SSL/TLS (default: `false`)
- `consumer`: Kafka consumer configuration (passed to kafkajs)
- `producer`: Kafka producer configuration (passed to kafkajs)
- `admin`: Kafka admin configuration (passed to kafkajs)
- `onMalformedMessage`: Callback for unparseable messages

### Environment Variables

- `KAFKA_URL`: Comma-separated list of broker addresses (alternative to
  `brokers`)

## Requirements

- Node.js 24+ or Deno
- Kafka server (local or remote)

## Installation

**Deno:**

```ts
import { createKafka } from '@anabranch/eventlog-kafka'
```

**Node.js:**

```bash
npm install @anabranch/eventlog-kafka @anabranch/eventlog kafkajs
```

See [@anabranch/eventlog](https://jsr.io/@anabranch/eventlog) for the core event
log abstraction.

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/eventlog-kafka)
for full API details.
