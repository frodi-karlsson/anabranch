/**
 * Kafka Event Processor Demo
 *
 * Demonstrates event sourcing with Kafka:
 * - Emit events with .append() and partition keys
 * - Consume events from multiple consumer groups
 * - Track state with materialized views
 * - Use AbortSignal for graceful shutdown
 *
 * ## Setup
 *
 * Start Kafka:
 * ```
 * docker run -d --name anabranch-kafka -p 9092:9092 confluentinc/cp-kafka:7.5.0 \
 *   -e KAFKA_NODE_ID=1 \
 *   -e KAFKA_PROCESS_ROLES=broker,controller \
 *   -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 \
 *   -e KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093 \
 *   -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
 *   -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT \
 *   -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
 *   -e KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT \
 *   -e CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk
 * ```
 *
 * Run:
 * ```
 * deno run -A examples/main.ts
 * ```
 *
 * Clean up:
 * ```
 * docker rm -f anabranch-kafka
 * ```
 */

import { Task } from '@anabranch/anabranch'
import { type Event, EventLog } from '@anabranch/eventlog'
import { createKafka } from '../index.ts'

const TOPIC = 'user-events'

if (import.meta.main) {
  await main()
}

async function main() {
  console.log('🏃 Starting Kafka Event Processor...\n')

  const connector = createKafka({
    brokers: ['localhost:9092'],
    clientId: 'user-processor',
    consumer: {
      maxWaitTimeInMs: 100,
      sessionTimeout: 6000,
    },
  })

  const log = await EventLog.connect(connector).run()
  const ac = new AbortController()

  console.log('📝 Creating topic by sending initial event...')
  await log.append(TOPIC, { type: 'TopicCreated' }, { partitionKey: 'init' })
    .run()

  const [userCursor, activityCursor] = await Task.all([
    log.getCommittedCursor(TOPIC, 'user-service'),
    log.getCommittedCursor(TOPIC, 'activity-tracker'),
  ]).run()

  const userState = new Map<string, User>()

  const userStream = log
    .consume<UserEvent>(TOPIC, 'user-service', {
      cursor: userCursor,
      signal: ac.signal,
    })
    .tap((batch) => {
      for (const { data } of batch.events) {
        if (data.type === 'UserCreated') {
          userState.set(data.userId, {
            id: data.userId,
            name: data.name,
            email: data.email,
            lastActive: data.createdAt,
          })
        } else if (data.type === 'UserUpdated') {
          const existing = userState.get(data.userId)
          if (existing) {
            existing.name = data.name ?? existing.name
            existing.email = data.email ?? existing.email
          }
        }
      }
    })
    .map(async (batch) => {
      await log.commit(TOPIC, 'user-service', batch.cursor).run()
    })
    .tapErr((err) => console.error('❌ User service failed:', err))
    .partition()

  const activityStream = log
    .consume<UserEvent>(TOPIC, 'activity-tracker', {
      cursor: activityCursor,
      signal: ac.signal,
    })
    .map((batch) => ({
      batch,
      logins: batch.events.filter(
        (e): e is Event<UserLoggedInEvent> => e.data.type === 'UserLoggedIn',
      ),
    }))
    .tap(({ logins }) => {
      for (const { data, timestamp } of logins) {
        const time = new Date(timestamp).toLocaleTimeString()
        console.log(
          `🔐 ${data.userId} logged in at ${time}`,
        )
      }
    })
    .map(async ({ batch }) => {
      await log.commit(TOPIC, 'activity-tracker', batch.cursor).run()
    })
    .tapErr((err) => console.error('❌ Activity tracker failed:', err))
    .partition()

  console.log('📝 Emitting events...\n')

  await Task.all([
    log.append(TOPIC, {
      type: 'UserCreated',
      userId: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
      createdAt: Date.now(),
    }, { partitionKey: 'user-1' }),
    log.append(TOPIC, {
      type: 'UserCreated',
      userId: 'user-2',
      name: 'Bob',
      email: 'bob@example.com',
      createdAt: Date.now(),
    }, { partitionKey: 'user-2' }),
  ]).run()

  await Task.all([
    log.append(TOPIC, {
      type: 'UserLoggedIn',
      userId: 'user-1',
    }, { partitionKey: 'user-1' }),
    log.append(TOPIC, {
      type: 'UserLoggedIn',
      userId: 'user-2',
    }, { partitionKey: 'user-2' }),
  ]).run()

  await log.append(TOPIC, {
    type: 'UserUpdated',
    userId: 'user-1',
    name: 'Alice Smith',
  }, { partitionKey: 'user-1' }).run()

  await new Promise((resolve) => setTimeout(resolve, 200))

  console.log('\n🛑 Shutting down processors...')
  ac.abort()

  await Promise.all([userStream, activityStream])
  await log.close().run()

  console.log('\n📊 Final User State:')
  for (const [, user] of userState.entries()) {
    console.log(`  - ${user.id}: ${user.name} (${user.email})`)
  }
}

interface User {
  id: string
  name: string
  email: string
  lastActive: number
}

type UserEvent = UserCreatedEvent | UserUpdatedEvent | UserLoggedInEvent

type UserCreatedEvent = {
  type: 'UserCreated'
  userId: string
  name: string
  email: string
  createdAt: number
}

type UserUpdatedEvent = {
  type: 'UserUpdated'
  userId: string
  name?: string
  email?: string
}

type UserLoggedInEvent = {
  type: 'UserLoggedIn'
  userId: string
}
