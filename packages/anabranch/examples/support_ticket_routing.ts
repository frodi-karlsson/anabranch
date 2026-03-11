/**
 * Example: Support Ticket Routing with splitBy
 *
 * This example demonstrates how to use `splitBy` to route a stream of incoming
 * support tickets into distinct processing pipelines based on their priority.
 * * Key features:
 * - Route a single stream into multiple independent consumers based on a key.
 * - Handle drastically different processing speeds (Fast AI vs Slow Human).
 * - Demonstrate backpressure (Human team gets overwhelmed, pausing ingestion).
 * - Show how unmatched keys (routing failures) are broadcasted as errors.
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/support_ticket_routing.ts
 * ```
 */
import { MissingKeyError, Source } from '../index.ts'

interface Ticket {
  id: string
  priority: string
  issue: string
}

async function main() {
  console.log('Simulating Ticket Dispatch Pipeline:')
  console.log('(Routing to Fast Auto-Responder and Slow Human Escalation)\n')

  const incomingTickets: Ticket[] = [
    { id: 'TCK-01', priority: 'normal', issue: 'Password reset' },
    { id: 'TCK-02', priority: 'critical', issue: 'Server down' },
    { id: 'TCK-03', priority: 'normal', issue: 'Billing question' },
    { id: 'TCK-04', priority: 'critical', issue: 'Data breach' },
    { id: 'TCK-05', priority: 'critical', issue: 'Payment gateway offline' },
    { id: 'TCK-06', priority: 'spam', issue: 'Buy cheap rolex' }, // Unmatched key!
    { id: 'TCK-07', priority: 'normal', issue: 'How to export' },
  ]

  const { normal, critical } = Source.fromArray(incomingTickets)
    .withConcurrency(1)
    .tap((ticket) =>
      console.log(`[INGEST] Receiving ${ticket.id} (${ticket.priority})...`)
    )
    .map(async (ticket) => {
      // Simulate network delay for receiving tickets
      await new Promise((resolve) => setTimeout(resolve, 50))
      return ticket
    })
    .splitBy(
      ['normal', 'critical'] as const,
      (ticket) => ticket.priority,
      2,
    )

  const fastConsumer = normal
    .tap(async (ticket) => {
      // Fast operation: AI auto-responder takes only 20ms
      await new Promise((resolve) => setTimeout(resolve, 20))
      console.log(`  [BOT] Auto-replied to ${ticket.id}`)
    })
    .tapErr((error) => {
      if (error instanceof MissingKeyError) {
        console.log(
          `  [BOT - ERROR] Saw routing failure for key: '${String(error.key)}'`,
        )
      }
    })

  const slowConsumer = critical
    .tap(async (ticket) => {
      // Slow operation: Human takes 400ms to investigate.
      // Because the buffer size is 2, the 4th ticket that needs to touch
      // the critical channel (whether a critical ticket or a broadcasted error)
      // will halt the ingestion.
      await new Promise((resolve) => setTimeout(resolve, 400))
      console.log(`  [HUMAN] Escalated and resolved ${ticket.id}`)
    })
    .tapErr((error) => {
      if (error instanceof MissingKeyError) {
        console.log(
          `  [HUMAN - ERROR] Saw routing failure for key: '${
            String(error.key)
          }'`,
        )
      }
    })

  // 4. Consume both branches concurrently
  await Promise.all([fastConsumer.toArray(), slowConsumer.toArray()])
  console.log('\nAll tickets processed.')
}

main()
