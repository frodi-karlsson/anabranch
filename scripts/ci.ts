/**
 * CI Orchestrator
 *
 * Runs all CI checks in parallel with GitHub Check Runs for visibility.
 * Uses Source.withConcurrency for parallel execution control.
 *
 * Environment variables:
 *   GITHUB_TOKEN - GitHub token with checks:write permission
 *   GITHUB_SHA - SHA of the commit being checked
 *   GITHUB_REPOSITORY - Owner/repo (e.g., "owner/repo")
 *   GITHUB_REF - Ref being checked (e.g., "refs/heads/main" or "refs/tags/pkg@1.0.0")
 *   GITHUB_REF_NAME - Short ref name (e.g., "main" or "pkg@1.0.0")
 *   GITHUB_EVENT_NAME - Event that triggered this run (e.g., "push", "pull_request")
 */

import { Source, Task } from '@anabranch/anabranch'
import { createGithub } from '@anabranch/check-runs-github'
import type { CheckRuns } from '@anabranch/check-runs'

/** Maximum parallel jobs to run concurrently */
const MAX_CONCURRENCY = 8

// deno-lint-ignore no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

function stripAnsi(str: string): string {
  return str.replace(ANSI_ESCAPE, '')
}

function getEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<{ success: boolean; output: string }> {
  const process = new Deno.Command(command, {
    args,
    stdout: 'piped',
    stderr: 'piped',
    cwd: options?.cwd,
  }).spawn()

  const decoder = new TextDecoder()
  const chunks: string[] = []

  async function drain(
    stream: ReadableStream<Uint8Array>,
    writer: (chunk: Uint8Array) => Promise<void>,
  ): Promise<void> {
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true })
      chunks.push(text)
      await writer(chunk)
    }
  }

  const stdoutWriter = async (chunk: Uint8Array) => {
    await Deno.stdout.write(chunk)
  }

  const stderrWriter = async (chunk: Uint8Array) => {
    await Deno.stderr.write(chunk)
  }

  await Promise.all([
    drain(process.stdout, stdoutWriter),
    drain(process.stderr, stderrWriter),
  ])

  const { success } = await process.status

  return {
    success,
    output: stripAnsi(chunks.join('')),
  }
}

interface Job {
  name: string
  fn: () => Promise<{ success: boolean; output?: string }>
}

const checkJobs: Job[] = [
  {
    name: 'Format',
    fn: async () => {
      const { success, output } = await runCommand('deno', ['fmt', '--check'])
      return { success, output }
    },
  },
  {
    name: 'Lint',
    fn: async () => {
      const { success, output } = await runCommand('deno', ['lint'])
      return { success, output }
    },
  },
  {
    name: 'Type Check',
    fn: async () => {
      const { success, output } = await runCommand('deno', ['check', '.'])
      return { success, output }
    },
  },
  {
    name: 'Tests',
    fn: async () => {
      const { success, output } = await runCommand('deno', [
        'test',
        '--allow-read',
        '--allow-write',
        '--allow-env',
        '--allow-net',
        '--allow-sys',
      ])
      return { success, output }
    },
  },
]

const integrationTestJob: Job = {
  name: 'Integration Tests',
  fn: async () => {
    const { success, output } = await runCommand('deno', [
      'task',
      'test:integration',
    ])
    return { success, output }
  },
}

function runWithCheckRunTask<T>(
  checkRuns: CheckRuns,
  name: string,
  headSha: string,
  fn: () => Promise<T>,
  getSuccess: (result: T) => boolean,
  getOutput: (result: T) => string | undefined,
): Task<T, Error> {
  return Task.of(async () => {
    const created = await checkRuns.create(name, headSha).result()

    if (created.type === 'error') {
      console.error(`[${name}] Failed to create: ${created.error.message}`)
      throw created.error
    }

    const checkRun = created.value
    console.log(`[${name}] Created`)

    const started = await checkRuns.start(checkRun).result()
    if (started.type === 'error') {
      console.error(`[${name}] Failed to start: ${started.error.message}`)
      await checkRuns.complete(checkRun, 'failure', {
        title: name,
        summary: 'Failed to start',
        text: started.error.message,
      }).result()
      throw started.error
    }

    try {
      console.log(`[${name}] Running...`)
      const result = await fn()
      const success = getSuccess(result)
      const output = getOutput(result)
      const conclusion = success ? 'success' : 'failure'

      const completed = await checkRuns.complete(checkRun, conclusion, {
        title: name,
        summary: success ? 'Passed' : 'Failed',
        text: output?.slice(0, 65000),
      }).result()

      if (completed.type === 'error') {
        console.error(
          `[${name}] Failed to complete: ${completed.error.message}`,
        )
        throw completed.error
      }

      console.log(`[${name}] ${success ? '✓' : '✗'} ${conclusion}`)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await checkRuns.complete(checkRun, 'failure', {
        title: name,
        summary: 'Failed with error',
        text: message.slice(0, 65000),
      }).result()
      console.error(`[${name}] ✗ ${message}`)
      throw error
    }
  })
}

interface JobResult {
  success: boolean
}

async function runJobsParallel(
  checkRuns: CheckRuns,
  jobs: Job[],
  headSha: string,
): Promise<boolean> {
  const { successes, errors } = await Source.fromArray(jobs)
    .withConcurrency(MAX_CONCURRENCY)
    .map<JobResult, Error>((job) => {
      const task = runWithCheckRunTask(
        checkRuns,
        job.name,
        headSha,
        job.fn,
        (result) => result.success,
        (result) => result.output,
      )
      return task.run()
    })
    .partition()

  if (errors.length > 0) {
    console.error('\n=== Errors ===')
    for (const error of errors) {
      console.error(`  - ${error.message}`)
    }
  }

  return errors.length === 0 && successes.every((r: JobResult) => r.success)
}

async function runJob(
  checkRuns: CheckRuns,
  job: Job,
  headSha: string,
): Promise<boolean> {
  const result = await runWithCheckRunTask(
    checkRuns,
    job.name,
    headSha,
    job.fn,
    (r) => r.success,
    (r) => r.output,
  ).result()

  if (result.type === 'error') {
    return false
  }
  return result.value.success
}

async function deployDocs(): Promise<{ success: boolean; output: string }> {
  console.log('Generating docs...')
  const { success, output } = await runCommand('deno', ['task', 'doc'])
  if (!success) {
    console.error('Failed to generate docs')
  } else {
    console.log('Docs generated')
  }
  return { success, output }
}

async function publishPackage(
  packageName: string,
): Promise<{ success: boolean; output: string }> {
  console.log(`Publishing ${packageName}...`)

  const { success: jsrSuccess, output: jsrOutput } = await runCommand(
    'deno',
    ['publish'],
    { cwd: `packages/${packageName}` },
  )
  if (!jsrSuccess) {
    console.error(`Failed to publish ${packageName} to JSR`)
    return { success: false, output: jsrOutput }
  }

  const { success: buildSuccess, output: buildOutput } = await runCommand(
    'deno',
    ['run', '-A', './scripts/build-npm.ts', `-p=${packageName}`],
  )
  if (!buildSuccess) {
    console.error(`Failed to build ${packageName} for npm`)
    return { success: false, output: buildOutput }
  }

  const { success: npmSuccess, output: npmOutput } = await runCommand(
    'npm',
    ['publish', '--access', 'public'],
    { cwd: `packages/${packageName}/npm` },
  )
  if (!npmSuccess) {
    console.error(`Failed to publish ${packageName} to npm`)
    return { success: false, output: npmOutput }
  }

  console.log(`Published ${packageName}`)
  return { success: true, output: npmOutput }
}

async function releaseDownstream(
  tags: string,
): Promise<{ success: boolean; output: string }> {
  console.log(`Bumping downstream: ${tags}`)
  const { success, output } = await runCommand('deno', [
    'run',
    '-A',
    'scripts/bump-downstream.ts',
    ...tags.split(' '),
  ])
  if (!success) {
    console.error('Failed to bump downstream')
  } else {
    console.log('Downstream bumped')
  }
  return { success, output }
}

async function main() {
  const token = getEnv('GITHUB_TOKEN')
  const sha = getEnv('GITHUB_SHA')
  const repository = getEnv('GITHUB_REPOSITORY')
  const ref = getEnv('GITHUB_REF')
  const refName = getEnv('GITHUB_REF_NAME')
  const eventName = getEnv('GITHUB_EVENT_NAME')

  const [owner, repo] = repository.split('/')
  const isTag = ref.startsWith('refs/tags/')
  const isMain = ref === 'refs/heads/main'
  const isPR = eventName === 'pull_request'

  console.log('=== CI Orchestrator ===')
  console.log(`Repository: ${owner}/${repo}`)
  console.log(`SHA: ${sha}`)
  console.log(`Ref: ${ref}`)
  console.log(`Event: ${eventName}`)
  console.log(`Is Tag: ${isTag}`)
  console.log(`Is Main: ${isMain}`)
  console.log(`Is PR: ${isPR}\n`)

  const checkRuns = createGithub({ token, owner, repo })

  // Run fast checks in parallel
  console.log('=== Running Checks ===\n')
  const checksPassed = await runJobsParallel(checkRuns, checkJobs, sha)

  if (!checksPassed) {
    console.error('\n❌ Checks failed')
    Deno.exit(1)
  }

  console.log('\n✅ All checks passed')

  // Run integration tests after fast checks pass
  console.log('\n=== Running Integration Tests ===\n')
  const integrationPassed = await runJob(checkRuns, integrationTestJob, sha)

  if (!integrationPassed) {
    console.error('\n❌ Integration tests failed')
    Deno.exit(1)
  }

  console.log('\n✅ Integration tests passed')

  // Deploy docs on main
  if (isMain) {
    console.log('\n=== Deploying Docs ===\n')
    const docsResult = await runWithCheckRunTask(
      checkRuns,
      'Deploy Docs',
      sha,
      deployDocs,
      (r) => r.success,
      (r) => r.output,
    ).result()

    if (docsResult.type === 'error' || !docsResult.value.success) {
      console.error('\n❌ Docs deployment failed')
    }
  }

  // Publish on tags
  if (isTag) {
    const packageName = refName.split('@')[0]

    console.log('\n=== Publishing ===\n')
    const publishResult = await runWithCheckRunTask(
      checkRuns,
      `Publish ${packageName}`,
      sha,
      () => publishPackage(packageName),
      (r) => r.success,
      (r) => r.output,
    ).result()

    if (publishResult.type === 'error' || !publishResult.value.success) {
      console.error('\n❌ Publishing failed')
      Deno.exit(1)
    }

    console.log('\n=== Releasing Downstream ===\n')
    const downstreamResult = await runWithCheckRunTask(
      checkRuns,
      'Release Downstream',
      sha,
      () => releaseDownstream(refName),
      (r) => r.success,
      (r) => r.output,
    ).result()

    if (downstreamResult.type === 'error' || !downstreamResult.value.success) {
      console.error('\n❌ Downstream release failed')
      Deno.exit(1)
    }
  }

  console.log('\n=== ✅ CI Complete ===')
}

main().catch((error) => {
  console.error('CI failed:', error)
  Deno.exit(1)
})
