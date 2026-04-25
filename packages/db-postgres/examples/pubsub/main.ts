/**
 * Pub/Sub Demo (PostgreSQL)
 *
 * Demonstrates LISTEN/NOTIFY with a live PostgreSQL database:
 * - Subscribe to a channel and receive real-time notifications
 * - Fan-out: multiple listeners on the same channel
 * - Proper cleanup: UNLISTEN and disconnect on channel close
 *
 * ## Setup
 *
 * Start PostgreSQL:
 * ```
 * docker run -d --name anabranch-postgres \
 *   -e POSTGRES_USER=postgres \
 *   -e POSTGRES_PASSWORD=postgres \
 *   -e POSTGRES_DB=postgres \
 *   -p 5432:5432 postgres:18
 * ```
 *
 * Run:
 * ```
 * POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *   deno run -A packages/db-postgres/examples/pubsub/main.ts
 * ```
 *
 * Clean up:
 * ```
 * docker rm -f anabranch-postgres
 * ```
 */

import { createPostgres } from '../../index.ts'

const POSTGRES_URL = Deno.env.get('POSTGRES_URL')
if (!POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is required')
}

const connector = createPostgres({ connectionString: POSTGRES_URL })

main().catch(console.error).finally(() => connector.end())

async function main() {
  console.log('=== Pub/Sub Demo (PostgreSQL) ===\n')

  await singleListener()
  await fanOut()
  await closedChannelCleanup()

  console.log('\nDone.')
}

async function singleListener() {
  console.log('--- Single listener ---\n')

  const channel = `orders_${crypto.randomUUID().replace(/-/g, '_')}`
  const ch = await connector.listen(channel).run()

  await connector.notify(channel, JSON.stringify({ id: 1, item: 'Widget' }))
    .run()
  await connector.notify(channel, JSON.stringify({ id: 2, item: 'Gadget' }))
    .run()
  await connector.notify(channel, JSON.stringify({ id: 3, item: 'Doohickey' }))
    .run()

  const notifications = await ch.take(3).collect()
  for (const n of notifications) {
    const order = JSON.parse(n.payload) as { id: number; item: string }
    console.log(`  Received order #${order.id}: ${order.item}`)
  }

  console.log()
}

async function fanOut() {
  console.log('--- Fan-out: two listeners on the same channel ---\n')

  const channel = `shipments_${crypto.randomUUID().replace(/-/g, '_')}`
  const warehouse = await connector.listen(channel).run()
  const analytics = await connector.listen(channel).run()

  const shipment = JSON.stringify({ id: 42, destination: 'Reykjavik' })
  await connector.notify(channel, shipment).run()

  const [w] = await warehouse.take(1).collect()
  const [a] = await analytics.take(1).collect()

  const parsed = JSON.parse(w.payload) as { id: number; destination: string }
  console.log(
    `  Warehouse received: shipment #${parsed.id} → ${parsed.destination}`,
  )
  console.log(
    `  Analytics received: ${
      a.payload === w.payload ? 'same payload ✓' : 'mismatch ✗'
    }`,
  )
  console.log()
}

async function closedChannelCleanup() {
  console.log('--- Closed channel unlistens and disconnects ---\n')

  const channel = `events_${crypto.randomUUID().replace(/-/g, '_')}`
  const ch = await connector.listen(channel).run()

  // Receive one notification then let take(1) close the channel
  await connector.notify(channel, 'first').run()
  const [n] = await ch.take(1).collect()
  console.log(`  Received: "${n.payload}"`)

  // Allow onClose (UNLISTEN + disconnect) to complete
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Open a fresh subscription — should work cleanly after the old one closed
  const fresh = await connector.listen(channel).run()
  await connector.notify(channel, 'after-close').run()
  const [n2] = await fresh.take(1).collect()
  console.log(`  Fresh listener received: "${n2.payload}" ✓`)
  console.log()
}
