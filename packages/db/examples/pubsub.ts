/**
 * Pub/Sub Demo
 *
 * Demonstrates in-memory pub/sub with listen() and notify():
 * - Subscribe to a channel and receive notifications
 * - Fan-out: multiple listeners on the same channel
 * - Channel cleanup on close
 *
 * Runs entirely in-memory — no external dependencies required.
 *
 * ## Run
 *
 * ```
 * deno run -A packages/db/examples/pubsub.ts
 * ```
 */

import { createInMemory } from '../index.ts'

main().catch(console.error)

async function main() {
  console.log('=== Pub/Sub Demo ===\n')

  const connector = createInMemory()

  await singleListener(connector)
  await fanOut(connector)
  await closedChannelCleanup(connector)

  console.log('\nDone.')
}

async function singleListener(
  connector: ReturnType<typeof createInMemory>,
) {
  console.log('--- Single listener ---\n')

  const ch = await connector.listen('orders').run()

  await connector.notify('orders', JSON.stringify({ id: 1, item: 'Widget' }))
    .run()
  await connector.notify('orders', JSON.stringify({ id: 2, item: 'Gadget' }))
    .run()
  await connector.notify('orders', JSON.stringify({ id: 3, item: 'Doohickey' }))
    .run()

  const notifications = await ch.take(3).collect()
  for (const n of notifications) {
    const order = JSON.parse(n.payload) as { id: number; item: string }
    console.log(`  Received order #${order.id}: ${order.item}`)
  }

  console.log()
}

async function fanOut(connector: ReturnType<typeof createInMemory>) {
  console.log('--- Fan-out: two listeners on the same channel ---\n')

  const warehouse = await connector.listen('shipments').run()
  const analytics = await connector.listen('shipments').run()

  const shipment = JSON.stringify({ id: 42, destination: 'Reykjavik' })
  await connector.notify('shipments', shipment).run()

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

async function closedChannelCleanup(
  connector: ReturnType<typeof createInMemory>,
) {
  console.log('--- Closed channel receives nothing ---\n')

  const ch = await connector.listen('events').run()
  ch.close()

  // Give onClose a moment to unregister
  await new Promise((resolve) => setTimeout(resolve, 10))

  await connector.notify('events', 'should not arrive').run()

  // Open a fresh listener — it should only see notifications sent after it subscribed
  const fresh = await connector.listen('events').run()
  await connector.notify('events', 'arrives on fresh listener').run()

  const [n] = await fresh.take(1).collect()
  console.log(`  Fresh listener received: "${n.payload}" ✓`)
  console.log()
}
