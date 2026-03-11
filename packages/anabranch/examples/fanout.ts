/**
 * Example: Order Fan-out with splitN
 *
 * This example demonstrates how to use `splitN` to duplicate a stream of incoming
 * orders into multiple independent processing pipelines. We simulate a fast "database"
 * consumer and a slow "email" consumer.
 * The split streams use a small buffer size (2) to demonstrate backpressure:
 * the fast consumer will quickly process its buffer, but the source stream will
 * gracefully pause pulling new orders until the slow consumer frees up capacity.
 *
 * Key features:
 * - Broadcast a single stream to multiple independent consumers
 * - Handle drastically different processing speeds concurrently
 * - Demonstrate built-in backpressure preventing memory leaks
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/fanout.ts
 * ```
 */
import { Source } from '../index.ts'

interface Order {
  id: string
  total: number
}

async function main() {
  console.log('Simulating Order Processing Pipeline:')
  console.log('(Duplicating stream to Fast DB and Slow Email pipelines)\n')
  const orders = [
    'ORD-001',
    'ORD-002',
    'ORD-003',
    'ORD-004',
    'ORD-005',
    'ORD-006',
  ]
  // We set a small bufferSize of 2 to easily visualize backpressure kicking in.
  const [dbStream, emailStream] = Source.fromArray(orders)
    .tap((id) => console.log(`[SOURCE] Receiving ${id}...`))
    .map(async (id) => {
      // Simulate network delay for receiving orders
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { id, total: Math.floor(Math.random() * 100) + 10 }
    })
    .splitN(2, 2)

  const dbStart = Date.now()
  const dbPromise = dbStream
    .tap(async (order) => {
      // Fast operation: takes only 20ms
      await new Promise((resolve) => setTimeout(resolve, 20))
      console.log(`[DB - FAST] Saved ${order.id}`)
    })
    .scan((acc, _, index) => {
      const timeSinceStart = Date.now() - dbStart
      // Expected time = (50ms per item) + (20ms for the final pipeline step to flush)
      const expectedTime = ((index + 1) * 50) + 20
      const timeBlocked = timeSinceStart - expectedTime
      const averageBlockedPercent = ((timeBlocked / timeSinceStart) * 100)
        .toFixed(2)
      console.log(
        `[DB] Processed ${
          index + 1
        } orders, blocked ${averageBlockedPercent}% of the time due to backpressure`,
      )
      return acc + 1
    }, 0)
    .collect()

  const emailPromise = emailStream
    .tap(async (order) => {
      // This will cause the email buffer to fill up, eventually pausing
      // the [SOURCE] loop from pulling more items until this catches up!
      await new Promise((resolve) => setTimeout(resolve, 400))
      console.log(`[EMAIL - SLOW] Sent receipt for ${order.id}`)
    })
    .collect()

  // 5. We MUST consume both branches concurrently so they can drain their buffers!
  await Promise.all([dbPromise, emailPromise])
  console.log('\nAll orders processed successfully across all pipelines.')
  // You'll see DB finishing first, with the last bufferSize + 1 logs coming from the email consumer as it catches up.
}

main()
