/**
 * Scheduled Health Report — Cron ticks fan out via splitN to parallel checkers.
 *
 * Every 2 seconds, a cron tick is enqueued. Workers consume the queue and
 * splitN the stream into 3 branches — each branch runs a different health
 * check (API, database, disk) on the same tick simultaneously. Results
 * merge back into one stream for reporting.
 *
 * Run:
 * ```
 * deno run -A packages/queue/examples/scheduled-jobs.ts
 * ```
 */

import { Source } from '@anabranch/anabranch'
import { createInMemory, Queue } from '../index.ts'

main().catch(console.error)

async function main() {
  const connector = createInMemory()
  const queue = await Queue.connect(connector).run()
  const ac = new AbortController()

  console.log('Scheduled Health Report')
  console.log('  Tick every 2s → splitN(3) → api/db/disk checks → merge')
  console.log('  Running for 10 seconds...\n')

  // Scheduler: cron → queue
  const scheduler = Source.fromSchedule('*/2 * * * * *', { signal: ac.signal })
    .tap(async (t) => {
      await queue.send('health-ticks', {
        tick: t.index,
        scheduledAt: t.scheduledAt.toISOString(),
      }).run()
      console.log(`[TICK ${t.index}] Enqueued`)
    })
    .partition()

  setTimeout(() => ac.abort(), 10_000)

  // Workers: split each tick to 3 parallel health checkers
  const ticks = queue
    .continuousStream<HealthTick>('health-ticks', { signal: ac.signal })
    .tap(async (msg) => {
      await queue.ack('health-ticks', msg.id).run()
    })
    .map((msg) => msg.data)

  const [apiStream, dbStream, diskStream] = ticks.splitN(3, 4)

  const apiResults = apiStream.map((t) => checkApi(t.tick))
  const dbResults = dbStream.map((t) => checkDatabase(t.tick))
  const diskResults = diskStream.map((t) => checkDisk(t.tick))

  // Merge all check results and report
  const { successes } = await apiResults
    .merge(dbResults)
    .merge(diskResults)
    .tap((r) => {
      const icon = r.healthy ? 'ok' : 'FAIL'
      console.log(
        `[TICK ${r.tick}] ${r.check}=${icon} (${r.latencyMs}ms)`,
      )
    })
    .partition()

  await scheduler

  const healthy = successes.filter((r) => r.healthy).length

  console.log(`\n=== Summary ===`)
  console.log(
    `  Checks: ${successes.length} (${healthy} healthy, ${
      successes.length - healthy
    } failed)`,
  )

  await queue.close().run()
  await connector.end()
}

async function checkApi(tick: number): Promise<CheckResult> {
  const latency = Math.floor(Math.random() * 100) + 20
  await new Promise((r) => setTimeout(r, latency))
  return {
    tick,
    check: 'api',
    healthy: Math.random() > 0.1,
    latencyMs: latency,
  }
}

async function checkDatabase(tick: number): Promise<CheckResult> {
  const latency = Math.floor(Math.random() * 150) + 30
  await new Promise((r) => setTimeout(r, latency))
  return {
    tick,
    check: 'db',
    healthy: Math.random() > 0.15,
    latencyMs: latency,
  }
}

async function checkDisk(tick: number): Promise<CheckResult> {
  const latency = Math.floor(Math.random() * 50) + 5
  await new Promise((r) => setTimeout(r, latency))
  return { tick, check: 'disk', healthy: true, latencyMs: latency }
}

interface HealthTick {
  tick: number
  scheduledAt: string
}

interface CheckResult {
  tick: number
  check: string
  healthy: boolean
  latencyMs: number
}
