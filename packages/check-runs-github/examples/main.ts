/**
 * check-runs-github Example
 *
 * Demonstrates using withCheckRun with the GitHub client.
 *
 * Run:
 * ```
 * GITHUB_TOKEN=xxx deno run -A packages/check-runs-github/examples/main.ts
 * ```
 */

import { createGithub } from '../index.ts'
import { Task } from '../../anabranch/task/task.ts'

function main() {
  const token = Deno.env.get('GITHUB_TOKEN')
  if (!token) {
    console.error('Please set GITHUB_TOKEN environment variable')
    return
  }

  const checkRuns = createGithub({
    token,
    owner: 'my-org',
    repo: 'my-repo',
  })

  return checkRuns.withCheckRun(
    'CI Build',
    'abc123def456',
    (started) => {
      console.log(`Started: ${started.name}`)
      return Task.of<void, never>(() => undefined)
    },
  ).map(() => {
    console.log('Check run completed!')
  })
}

main()?.run().catch(console.error)
