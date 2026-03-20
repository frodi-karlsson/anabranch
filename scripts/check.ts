import { createInMemory } from '@anabranch/check-runs'

// deno-lint-ignore no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

function stripAnsi(str: string): string {
  return str.replace(ANSI_ESCAPE, '')
}

async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; signal?: AbortSignal },
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
  fn: (signal: AbortSignal) => Promise<{ success: boolean; output?: string }>
}

const checkJobs: Job[] = [
  {
    name: 'Format',
    fn: async (signal) => {
      const { success, output } = await runCommand('deno', ['fmt', '--check'], {
        signal,
      })
      return { success, output }
    },
  },
  {
    name: 'Lint',
    fn: async (signal) => {
      const { success, output } = await runCommand('deno', ['lint'], { signal })
      return { success, output }
    },
  },
  {
    name: 'Tests',
    fn: async (signal) => {
      const { success, output } = await runCommand('deno', [
        'test',
        '--allow-read',
        '--allow-write',
        '--allow-sys',
        '--allow-env',
        '--allow-net',
      ], { signal })
      return { success, output }
    },
  },
]

async function runWithCheckRunTask<T>(
  checkRuns: ReturnType<typeof createInMemory>,
  name: string,
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  getSuccess: (result: T) => boolean,
  getOutput: (result: T) => string | undefined,
): Promise<T> {
  if (signal.aborted) {
    throw new Error('Aborted')
  }

  const created = await checkRuns.create(name, 'local').result()

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
    const result = await fn(signal)
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

    if (!success) {
      throw new Error(`${name} failed`)
    }

    return result
  } catch (error) {
    if (signal.aborted) {
      console.log(`[${name}] ⊘ Aborted`)
      throw new Error('Aborted')
    }
    const message = error instanceof Error ? error.message : String(error)
    await checkRuns.complete(checkRun, 'failure', {
      title: name,
      summary: 'Failed with error',
      text: message.slice(0, 65000),
    }).result()
    console.error(`[${name}] ✗ ${message}`)
    throw error
  }
}

async function runJobsParallel(
  checkRuns: ReturnType<typeof createInMemory>,
  jobs: Job[],
): Promise<boolean> {
  const abortController = new AbortController()

  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        await runWithCheckRunTask(
          checkRuns,
          job.name,
          job.fn,
          abortController.signal,
          (result) => result.success,
          (result) => result.output,
        )
        return { success: true, name: job.name }
      } catch (error) {
        if (!abortController.signal.aborted) {
          abortController.abort()
        }
        return {
          success: false,
          name: job.name,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )

  const failures = results.filter((r) => !r.success && r.error !== 'Aborted')
  if (failures.length > 0) {
    console.error('\n=== Failures ===')
    for (const f of failures) {
      console.error(`  - ${f.name}: ${f.error}`)
    }
    return false
  }
  return true
}

async function main() {
  const checkRuns = createInMemory()

  console.log('=== Running Checks ===\n')
  const checksPassed = await runJobsParallel(checkRuns, checkJobs)

  if (!checksPassed) {
    console.error('\n❌ Checks failed')
    Deno.exit(1)
  }

  console.log('\n✅ All checks passed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  Deno.exit(1)
})
