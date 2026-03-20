/**
 * Scheduled Pipeline — Multi-schedule data pipeline with error collection.
 *
 * Demonstrates Source.fromSchedule driving a realistic ETL-style pipeline:
 * - Two schedules merged into one stream (frequent health checks + periodic cleanup)
 * - Each tick triggers a different job based on which schedule fired
 * - Errors are collected, not thrown — the pipeline keeps running
 * - AbortSignal for graceful shutdown
 *
 * Run:
 * ```
 * deno run -A packages/anabranch/examples/scheduled_pipeline.ts
 * ```
 */

import { Source } from '../index.ts'

type HealthResult = {
  tick: number
  service: string
  healthy: boolean
  latencyMs: number
  type: 'health'
}

type CleanupResult = {
  tick: number
  removed: number
  durationMs: number
  type: 'cleanup'
}

type PipelineResult = HealthResult | CleanupResult

// Simulated services
const metrics = {
  healthy: true,
  toggleAt: Date.now() + 3000,
  check(): { service: string; healthy: boolean; latencyMs: number } {
    if (Date.now() > this.toggleAt) {
      this.healthy = !this.healthy
      this.toggleAt = Date.now() + 4000
    }
    return {
      service: 'api-gateway',
      healthy: this.healthy,
      latencyMs: Math.floor(Math.random() * 200) + 10,
    }
  },
}

let expiredCount = 0
function cleanExpiredSessions(): { removed: number; durationMs: number } {
  const start = Date.now()
  const batch = Math.floor(Math.random() * 50) + 1
  expiredCount += batch
  if (Math.random() < 0.2) throw new Error('Redis connection timeout')
  return { removed: batch, durationMs: Date.now() - start }
}

async function main() {
  const ac = new AbortController()

  // Stop after 12 seconds
  setTimeout(() => {
    console.log('\n--- Shutting down gracefully ---')
    ac.abort()
  }, 12_000)

  console.log('Scheduled Pipeline')
  console.log('  Health check: every second')
  console.log('  Session cleanup: every 3 seconds')
  console.log('  Running for 12 seconds...\n')

  // Health check every second
  const healthChecks = Source.fromSchedule('* * * * * *', {
    signal: ac.signal,
  })
    .map<PipelineResult, Error>((tick) => {
      const result = metrics.check()
      const icon = result.healthy ? 'OK' : 'DEGRADED'
      console.log(
        `  [${tick.scheduledAt.toISOString()}] HEALTH: ${icon} (${result.latencyMs}ms)`,
      )
      return { type: 'health' as const, ...result, tick: tick.index }
    })

  // Session cleanup every 3 seconds
  const cleanups = Source.fromSchedule('*/3 * * * * *', {
    signal: ac.signal,
  })
    .map<PipelineResult, Error>((tick) => {
      const result = cleanExpiredSessions()
      console.log(
        `  [${tick.scheduledAt.toISOString()}] CLEANUP: removed ${result.removed} sessions`,
      )
      return {
        type: 'cleanup' as const,
        ...result,
        tick: tick.index,
      }
    })

  // Merge both schedules and process as one stream
  const { successes, errors } = await healthChecks
    .merge(cleanups)
    .partition()

  // Summary
  const healthResults = successes.filter((r) => r.type === 'health')
  const cleanupResults = successes.filter((r) => r.type === 'cleanup')
  const degraded = healthResults.filter((r) =>
    r.type === 'health' && !r.healthy
  )

  console.log('\n=== Summary ===')
  console.log(`  Health checks: ${healthResults.length}`)
  console.log(
    `  Degraded:      ${degraded.length} (${
      Math.round(degraded.length / healthResults.length * 100)
    }%)`,
  )
  console.log(`  Cleanups:      ${cleanupResults.length}`)
  console.log(`  Sessions removed: ${expiredCount}`)
  console.log(`  Errors:        ${errors.length}`)

  if (errors.length > 0) {
    console.log(`  Error sample:  ${(errors[0] as Error).message}`)
  }
}

main().catch(console.error)
