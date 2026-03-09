import { createInMemory, Queue } from '../index.ts'

const connector = createInMemory()
const queue = await Queue.connect(connector).run()

interface Order {
  id: string
  items: string[]
  total: number
}

async function processOrder(order: Order | null): Promise<void> {
  if (!order) return
  await new Promise((r) => setTimeout(r, 100))
  console.log(`Processed order ${order.id}: $${order.total}`)
}

async function main() {
  console.log('Order processor started\n')

  for (let i = 0; i < 5; i++) {
    const orderId = `ORD-${i}`
    await queue
      .send('orders', {
        id: orderId,
        items: ['widget', 'gadget'],
        total: 99.99 + i * 10,
      })
      .run()
    console.log(`Sent: ${orderId}`)
  }

  console.log('\nProcessing with error handling...\n')

  const { successes, errors } = await queue
    .stream<Order>('orders', { count: 5, concurrency: 2 })
    .map(async (msg) => {
      if (msg.data?.id === 'ORD-3') throw new Error('Simulated failure')
      await processOrder(msg.data)
      return msg
    })
    .partition()

  console.log(`\nSuccesses: ${successes.length}`)
  console.log(`Errors: ${errors.length}`)

  for (const err of errors) {
    console.log(`  Failed: ${err.message}`)
  }

  await queue.close().run()
  await connector.end()
}

main()
