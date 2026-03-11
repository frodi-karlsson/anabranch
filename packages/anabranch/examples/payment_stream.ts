/**
 * Example of using `Source` to create a stream of payment events and calculate a running total of completed payments.
 *
 * Run:
 * ```
deno run -A packages/anabranch/examples/payment_stream.ts
 * ```
 */
import { Source } from '../index.ts'

interface Payment {
  id: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
}

const payments = Source.fromArray<Payment>([
  { id: '1', amount: 100, status: 'completed' },
  { id: '2', amount: 50, status: 'completed' },
  { id: '3', amount: 200, status: 'failed' },
  { id: '4', amount: 75, status: 'completed' },
  { id: '5', amount: 150, status: 'completed' },
])

const runningTotal = payments
  .tap((p) =>
    console.log(
      ' [PAYMENT]',
      `ID: ${p.id}, Amount: $${p.amount}, Status: ${p.status}`,
    )
  )
  .filter((p) => p.status === 'completed')
  .scan((total, payment) => total + payment.amount, 0)
  .tap((total) =>
    console.log(' [TOTAL]', `Running total of completed payments: $${total}`)
  )

console.log('Running balance after each completed payment:')
await runningTotal.toArray()
