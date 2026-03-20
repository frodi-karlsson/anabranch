/**
 * check-runs Example
 *
 * Demonstrates using withCheckRun for automatic lifecycle management.
 *
 * Run:
 * ```
 * deno run -A packages/check-runs/examples/main.ts
 * ```
 */

import { createInMemory, type StartedCheckRun } from '../index.ts'
import { Task } from '../../anabranch/task/task.ts'

function main() {
  console.log('Starting check-runs example...\n')

  const checkRuns = createInMemory()

  const result = checkRuns.withCheckRun(
    'CI Build',
    'abc123def456',
    (started) => Task.of(() => buildAndTest(started)),
  )

  return result.map(() => {
    console.log('Example complete!')
  })
}

async function buildAndTest(started: StartedCheckRun): Promise<void> {
  console.log(`   Check run: ${started.name} (id: ${started.id})\n`)

  console.log('1. Writing annotations...')
  await Promise.all([
    started.writeAnnotation!({
      path: 'src/index.ts',
      startLine: 10,
      endLine: 10,
      level: 'warning',
      message: 'Unused variable "x"',
    }),
    started.writeAnnotation!({
      path: 'src/utils.ts',
      startLine: 25,
      endLine: 30,
      level: 'failure',
      message: 'Potential null reference',
    }),
  ])
  console.log('   Wrote 2 annotations\n')

  console.log('2. Running tests...')
  console.log('   All tests passed!\n')
}

main().run().catch(console.error)
