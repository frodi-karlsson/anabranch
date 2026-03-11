/**
 * Example: Event Stream Processor
 *
 * This example demonstrates how to use `Source` to process a stream of events with filtering, mapping, and error handling. It also shows how to use `fold` to aggregate results and generate a summary.
 * Key features:
 * - Create a stream of events and filter out non-essential ones
 * - Map events to a new structure while handling potential errors
 * - Use `throwOn` to stop processing on critical errors
 * - Use `fold` to aggregate error statistics at the end
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/event_processor.ts
 * ```
 */
import { Source } from '../index.ts'

interface Event {
  type: 'info' | 'warn' | 'error' | 'metric'
  message: string
  value?: number
}

class FatalError extends Error {}

function createEventStream() {
  return Source.fromArray<Event>([
    { type: 'info', message: 'System started' },
    { type: 'info', message: 'Cache initialized' },
    { type: 'metric', message: 'cpu_usage', value: 45 },
    { type: 'warn', message: 'High memory usage' },
    { type: 'metric', message: 'cpu_usage', value: 78 },
    { type: 'error', message: 'Database connection failed' },
    { type: 'metric', message: 'cpu_usage', value: 92 },
    { type: 'error', message: 'Timeout waiting for response' },
    { type: 'info', message: 'Cleanup complete' },
  ])
}

const events = createEventStream()
const processed = events
  .filter((e) => e.type !== 'info')
  .map<Event, FatalError>((e) => {
    if (e.type === 'error' && e.message.includes('Database')) {
      throw new FatalError(e.message)
    }
    return e
  })
  .throwOn((e): e is FatalError => e instanceof FatalError)

console.log('Processing events (will throw on fatal error):')
try {
  for await (const result of processed.successes()) {
    const e = result
    console.log(
      `  [${e.type.toUpperCase()}] ${e.message}${
        e.value ? ` (${e.value})` : ''
      }`,
    )
  }
} catch (error) {
  console.error(`\n  Fatal error: ${(error as Error).message}`)
  console.log('  Stopping processing...')
}

console.log('\nError summary (fresh stream):')
const errorStats = await createEventStream()
  .filter((e) => e.type === 'error')
  .fold<{ count: number; messages: string[] }>(
    (acc, errEvent) => ({
      count: acc.count + 1,
      messages: [...acc.messages, errEvent.message],
    }),
    { count: 0, messages: [] },
  )

console.log(`  ${errorStats.count} errors:`)
for (const msg of errorStats.messages) {
  console.log(`    - ${msg}`)
}
