/**
 * check-runs Example
 *
 * Demonstrates creating, starting, updating, and completing check runs
 * using the in-memory client for testing.
 *
 * Run:
 * ```
 * deno run -A packages/check-runs/examples/main.ts
 * ```
 */

import { createInMemory } from '../index.ts'

async function main() {
  console.log('Starting check-runs example...\n')

  const checkRuns = createInMemory()

  console.log('1. Creating check run...')
  const run = await checkRuns
    .create('CI Build', 'abc123def456', { status: 'queued' })
    .run()
  console.log(
    `   Created check run: ${run.name} (id: ${run.id}, status: ${run.status})\n`,
  )

  console.log('2. Starting check run...')
  const started = await checkRuns.start(run).run()
  console.log(`   Status: ${started.status}\n`)

  console.log('3. Pushing annotations...')
  await checkRuns
    .update(started, {
      title: 'Build Results',
      summary: 'Running tests...',
      annotations: [
        {
          path: 'src/index.ts',
          startLine: 10,
          endLine: 10,
          level: 'warning',
          message: 'Unused variable "x"',
        },
        {
          path: 'src/utils.ts',
          startLine: 25,
          endLine: 30,
          level: 'failure',
          message: 'Potential null reference',
        },
      ],
    })
    .run()
  console.log('   Pushed 2 annotations\n')

  console.log('4. Updating output...')
  const updated = await checkRuns
    .update(started, {
      title: 'Build Complete',
      summary: 'All tests passed!',
      text:
        '## Test Results\n\n- 42 tests passed\n- 0 tests failed\n- 2 warnings',
    })
    .run()
  console.log(`   Updated: ${updated.title}\n`)

  console.log('5. Completing check run...')
  const completed = await checkRuns
    .complete(updated, 'success', {
      summary: 'Build succeeded with 2 warnings',
    })
    .run()
  console.log(`   Conclusion: ${completed.conclusion}`)
  console.log(`   Status: ${completed.status}\n`)

  console.log('Example complete!')
}

main().catch(console.error)
