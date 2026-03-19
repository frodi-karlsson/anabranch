/**
 * check-runs-github Example
 *
 * Run:
 * ```
 * deno run -A packages/check-runs-github/examples/main.ts
 * ```
 */

import { createGithub } from '../index.ts'

async function main() {
  console.log('Starting check-runs-github example...')

  // In real usage, you would provide actual GitHub credentials
  const checkRuns = createGithub({
    token: Deno.env.get('GITHUB_TOKEN') ?? '',
    owner: 'my-org',
    repo: 'my-repo',
  })
  const checkRun = await checkRuns.create('my-check', 'abc123').run()
  console.log('Created check run:', checkRun)
}

main().catch(console.error)
