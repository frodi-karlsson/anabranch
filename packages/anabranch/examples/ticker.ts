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

  const consumer = tickerChannel.toArray()

  tickerChannel.send({ symbol: 'AAPL', price: 150 })
  tickerChannel.send({ symbol: 'GOOGL', price: 2750 })
  tickerChannel.send({ symbol: 'MSFT', price: 300 })
  tickerChannel.send({ symbol: 'AMZN', price: 3400 })
  tickerChannel.send({ symbol: 'TSLA', price: 900 })
  tickerChannel.send({ symbol: 'META', price: 350 })
  tickerChannel.send({ symbol: 'NVDA', price: 220 })
  tickerChannel.send({ symbol: 'NFLX', price: 600 })
  tickerChannel.send({ symbol: 'AMD', price: 110 })
  tickerChannel.send({ symbol: 'INTC', price: 45 })

  tickerChannel.close()

  const results = await consumer

  console.log('\nReceived results:')
  const successes = results.filter((r) => r.type === 'success')
  const errors = results.filter((r) => r.type === 'error')

  console.log(`  ${successes.length} prices received:`)
  for (const r of successes) {
    console.log(`    ${r.value.symbol}: $${r.value.price}`)
  }

  if (errors.length > 0) {
    console.log(`  ${errors.length} errors:`)
    for (const r of errors) {
      console.log(`    ${r.error}`)
    }
  }

  console.log('\nChannel closed, consumer disconnected.')
}

main()
