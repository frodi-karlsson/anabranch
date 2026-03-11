/**
 * Example: Ticker Channel
 *
 * This example demonstrates how to use `Channel` to create a simple ticker that simulates real-time price updates for various stocks. The channel is configured with a buffer size of 5, and we send 10 price updates to it. The example shows how the channel handles backpressure by dropping updates when the buffer is full, and how consumers can receive the updates until the channel is closed.
 * Key features:
 * - Create a `Channel` with a buffer and an `onDrop` callback
 * - Send multiple price updates to the channel, exceeding the buffer size
 * - Wait for capacity before sending more updates
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/ticker.ts
 * ```
 */
import { Channel } from '../index.ts'

interface PriceUpdate {
  symbol: string
  price: number
}

const tickerChannel = new Channel<PriceUpdate, string>({
  bufferSize: 5,
  onDrop: (update) => {
    console.log(`  [DROPPED] ${update.symbol} @ $${update.price}`)
  },
})

async function main() {
  console.log('Simulating real-time price updates:')
  console.log('(Buffer size: 5, sending 10 updates, then closing)\n')

  const tickerPromise = tickerChannel
    .tap((update) => {
      console.log(`  [RECEIVED] ${update.symbol} @ $${update.price}`)
    })
    .tapErr((error) => {
      console.error(`  [ERROR] ${error}`)
    })
    .partition()

  tickerChannel.send({ symbol: 'AAPL', price: 150 })
  tickerChannel.send({ symbol: 'GOOGL', price: 2750 })
  tickerChannel.send({ symbol: 'MSFT', price: 300 })
  tickerChannel.send({ symbol: 'AMZN', price: 3400 })
  tickerChannel.send({ symbol: 'TSLA', price: 900 })
  tickerChannel.send({ symbol: 'META', price: 350 })
  tickerChannel.send({ symbol: 'NVDA', price: 220 })
  tickerChannel.send({ symbol: 'NFLX', price: 600 })
  // If we wanted to receive every event, we'd always wait for capacity
  await tickerChannel.waitForCapacity()
  tickerChannel.send({ symbol: 'AMD', price: 110 })
  // However, this use case just wants "best effort" updates, so we can send without waiting and let the channel drop if it's full
  tickerChannel.send({ symbol: 'INTC', price: 45 })

  tickerChannel.close()

  const { successes, errors } = await tickerPromise
  console.log('\nChannel closed, consumer disconnected.')

  console.log('\nReceived results:')
  console.log(`  ${successes.length} prices received:`)
  console.log(`  ${errors.length} errors:`)
}

main()
