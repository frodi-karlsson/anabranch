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
import type {
  Annotation,
  CheckRuns,
  StartedCheckRun,
} from '@anabranch/check-runs'

const FLUSH_INTERVAL_MS = 5000
const MAX_CHECK_RUN_TEXT = 65000

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

interface ParsedOutput {
  success: boolean
  output: string
  annotations: Annotation[]
}

function parseLintJson(output: string): Annotation[] {
  const annotations: Annotation[] = []
  try {
    const result = JSON.parse(output)
    for (const diag of result.diagnostics ?? []) {
      const filePath = diag.filename?.replace(/^file:\/\//, '') ?? ''
      annotations.push({
        path: filePath,
        startLine: diag.range?.start?.line ?? 1,
        endLine: diag.range?.end?.line ?? diag.range?.start?.line ?? 1,
        level: 'warning',
        message: diag.message,
        title: diag.code,
      })
    }
  } catch {
    // If JSON parsing fails, return empty array
  }
  return annotations
}

function parseCheckErrors(output: string): Annotation[] {
  const annotations: Annotation[] = []
  const lines = output.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const errorMatch = line.match(/\[ERROR\]:\s*(.+)/)
    if (errorMatch) {
      const message = errorMatch[1]
      let filepath = ''
      let lineNum = 1

      for (let j = i + 1; j < lines.length; j++) {
        const atMatch = lines[j].match(/at\s+(file:\/\/.+):(\d+):(\d+)/)
        if (atMatch) {
          filepath = atMatch[1].replace(/^file:\/\//, '')
          lineNum = parseInt(atMatch[2], 10)
          break
        }
      }

      if (filepath && message) {
        annotations.push({
          path: filepath,
          startLine: lineNum,
          endLine: lineNum,
          level: 'failure',
          message,
        })
      }
    }
  }
  return annotations
}

function parseTestFailures(output: string): Annotation[] {
  const annotations: Annotation[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    const match = line.match(/^(.+?)\s*=>\s*(.+?):(\d+):(\d+)/)
    if (match) {
      const testName = match[1].trim()
      const filepath = match[2].replace(/^file:\/\//, '')
      const lineNum = parseInt(match[3], 10)

      annotations.push({
        path: filepath,
        startLine: lineNum,
        endLine: lineNum,
        level: 'failure',
        message: `Test failed: ${testName}`,
      })
    }
  }
  return annotations
}

async function runCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string
    signal?: AbortSignal
    onChunk?: (chunk: string) => void
  },
): Promise<{ success: boolean; output: string }> {
  const process = new Deno.Command(command, {
    args,
    stdout: 'piped',
    stderr: 'piped',
    cwd: options?.cwd,
    signal: options?.signal,
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
      options?.onChunk?.(text)
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
  fn: (
    onChunk: (chunk: string) => void,
    signal: AbortSignal,
  ) => Promise<{ success: boolean; output?: string }>
  parseAnnotations?: (output: string) => Annotation[]
}

const checkJobs: Job[] = [
  {
    name: 'Format',
    fn: async (onChunk, signal) => {
      const { success, output } = await runCommand('deno', ['fmt', '--check'], {
        onChunk,
        signal,
      })
      return { success, output }
    },
  },
  {
    name: 'Lint',
    fn: async (onChunk, signal) => {
      const { success, output } = await runCommand('deno', ['lint', '--json'], {
        onChunk,
        signal,
      })
      return { success, output }
    },
    parseAnnotations: parseLintJson,
  },
  {
    name: 'Type Check',
    fn: async (onChunk, signal) => {
      const { success, output } = await runCommand('deno', ['check', '.'], {
        onChunk,
        signal,
      })
      return { success, output }
    },
    parseAnnotations: parseCheckErrors,
  },
  {
    name: 'Tests',
    fn: async (onChunk, signal) => {
      const { success, output } = await runCommand(
        'deno',
        [
          'test',
          '--allow-read',
          '--allow-write',
          '--allow-env',
          '--allow-net',
          '--allow-sys',
        ],
        { onChunk, signal },
      )
      return { success, output }
    },
    parseAnnotations: parseTestFailures,
  },
  {
    name: 'Integration Tests',
    fn: async (onChunk, signal) => {
      const { success, output } = await runCommand(
        'deno',
        ['task', 'test:integration'],
        { onChunk, signal },
      )
      return { success, output }
    },
  },
]

function runWithCheckRunTask<T>(
  checkRuns: CheckRuns,
  name: string,
  headSha: string,
  fn: (onChunk: (chunk: string) => void, signal: AbortSignal) => Promise<T>,
  getSuccess: (result: T) => boolean,
  getOutput: (result: T) => string | undefined,
  signal: AbortSignal,
  parseAnnotations?: (output: string) => Annotation[],
): Task<T, Error> {
  return Task.of(async () => {
    if (signal.aborted) {
      throw new Error('Aborted')
    }

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

    const startedRun: StartedCheckRun = started.value

    // Live output streaming
    let liveOutput = ''
    let lastFlushed = ''

    const flushInterval = setInterval(async () => {
      if (liveOutput === lastFlushed || signal.aborted) return
      lastFlushed = liveOutput
      const updateResult = await checkRuns
        .update(checkRun, {
          title: name,
          summary: 'Running...',
          text: liveOutput.slice(-MAX_CHECK_RUN_TEXT),
        })
        .result()
      if (updateResult.type === 'error') {
        console.error(
          `[${name}] Failed to update: ${updateResult.error.message}`,
        )
      }
    }, FLUSH_INTERVAL_MS)

    const onChunk = (chunk: string) => {
      liveOutput += stripAnsi(chunk)
    }

    try {
      console.log(`[${name}] Running...`)
      const result = await fn(onChunk, signal)
      clearInterval(flushInterval)

      const success = getSuccess(result)
      const output = getOutput(result) ?? liveOutput

      // Stream annotations if parser provided
      if (parseAnnotations && !success) {
        const annotations = parseAnnotations(output)
        for (const annotation of annotations) {
          await startedRun.writeAnnotation(annotation)
        }
      }

      const conclusion = success ? 'success' : 'failure'

      const completed = await checkRuns.complete(checkRun, conclusion, {
        title: name,
        summary: success ? 'Passed' : 'Failed',
        text: output.slice(-MAX_CHECK_RUN_TEXT),
      }).result()

      if (completed.type === 'error') {
        console.error(
          `[${name}] Failed to complete: ${completed.error.message}`,
        )
        throw completed.error
      }

      console.log(`[${name}] ${success ? '✓' : '✗'} ${conclusion}`)

      if (!success) {
        throw new Error(`${name} failed`)
      }

      return result
    } catch (error) {
      clearInterval(flushInterval)

      if (signal.aborted) {
        console.log(`[${name}] ⊘ Aborted`)
        await checkRuns.complete(checkRun, 'failure', {
          title: name,
          summary: 'Aborted',
          text: liveOutput.slice(-MAX_CHECK_RUN_TEXT),
        }).result()
        throw new Error('Aborted')
      }

      const message = error instanceof Error ? error.message : String(error)
      await checkRuns.complete(checkRun, 'failure', {
        title: name,
        summary: 'Failed with error',
        text: message.slice(0, MAX_CHECK_RUN_TEXT),
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
  const abortController = new AbortController()

  const { successes, errors } = await Source.fromArray(jobs)
    .withConcurrency(jobs.length)
    .map<JobResult, Error>((job) => {
      const task = runWithCheckRunTask(
        checkRuns,
        job.name,
        headSha,
        job.fn,
        (result) => result.success,
        (result) => result.output,
        abortController.signal,
        job.parseAnnotations,
      )
      return task.run()
    })
    .partition()

  const failures = errors.filter((e) => e.message !== 'Aborted')

  if (failures.length > 0) {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
    console.error('\n=== Errors ===')
    for (const error of failures) {
      console.error(`  - ${error.message}`)
    }
  }

  return failures.length === 0 && successes.every((r: JobResult) => r.success)
}

async function deployDocs(
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<{ success: boolean; output: string }> {
  console.log('Generating docs...')
  const { success, output } = await runCommand('deno', ['task', 'doc'], {
    onChunk,
    signal,
  })
  if (!success) {
    console.error('Failed to generate docs')
  } else {
    console.log('Docs generated')
  }
  return { success, output }
}

async function publishPackage(
  packageName: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<{ success: boolean; output: string }> {
  console.log(`Publishing ${packageName}...`)

  const { success: jsrSuccess, output: jsrOutput } = await runCommand(
    'deno',
    ['publish'],
    { cwd: `packages/${packageName}`, onChunk, signal },
  )
  if (!jsrSuccess) {
    console.error(`Failed to publish ${packageName} to JSR`)
    return { success: false, output: jsrOutput }
  }

  const { success: buildSuccess, output: buildOutput } = await runCommand(
    'deno',
    ['run', '-A', './scripts/build-npm.ts', `-p=${packageName}`],
    { onChunk, signal },
  )
  if (!buildSuccess) {
    console.error(`Failed to build ${packageName} for npm`)
    return { success: false, output: buildOutput }
  }

  const { success: npmSuccess, output: npmOutput } = await runCommand(
    'npm',
    ['publish', '--access', 'public'],
    { cwd: `packages/${packageName}/npm`, onChunk, signal },
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
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<{ success: boolean; output: string }> {
  console.log(`Bumping downstream: ${tags}`)
  const { success, output } = await runCommand(
    'deno',
    ['run', '-A', 'scripts/bump-downstream.ts', ...tags.split(' ')],
    { onChunk, signal },
  )
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

  // Run all checks in parallel (including integration tests)
  console.log('=== Running Checks ===\n')
  const checksPassed = await runJobsParallel(checkRuns, checkJobs, sha)

  if (!checksPassed) {
    console.error('\n❌ Checks failed')
    Deno.exit(1)
  }

  console.log('\n✅ All checks passed')

  // Deploy docs on main
  if (isMain) {
    console.log('\n=== Deploying Docs ===\n')
    const abortController = new AbortController()
    const docsResult = await runWithCheckRunTask(
      checkRuns,
      'Deploy Docs',
      sha,
      deployDocs,
      (r) => r.success,
      (r) => r.output,
      abortController.signal,
    ).result()

    if (docsResult.type === 'error' || !docsResult.value.success) {
      console.error('\n❌ Docs deployment failed')
    }
  }

  // Publish on tags
  if (isTag) {
    const packageName = refName.split('@')[0]
    const abortController = new AbortController()

    console.log('\n=== Publishing ===\n')
    const publishResult = await runWithCheckRunTask(
      checkRuns,
      `Publish ${packageName}`,
      sha,
      (onChunk, signal) => publishPackage(packageName, onChunk, signal),
      (r) => r.success,
      (r) => r.output,
      abortController.signal,
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
      (onChunk, signal) => releaseDownstream(refName, onChunk, signal),
      (r) => r.success,
      (r) => r.output,
      abortController.signal,
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
