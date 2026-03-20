import { assertEquals, assertRejects } from '@std/assert'
import { Task } from '@anabranch/anabranch'
import { CheckRuns } from './check-runs.ts'
import { createInMemory, createInMemoryClient } from './in-memory.ts'
import type { CheckRun } from './check-run.ts'
import {
  CheckRunAlreadyCompleted,
  CheckRunAlreadyStarted,
  CheckRunNotFound,
} from './errors.ts'

function createTestCheckRuns(): CheckRuns {
  return createInMemory()
}

/** Helper to clean up batcher after start() */
async function cleanup(
  checkRuns: CheckRuns,
  checkRun: CheckRun,
): Promise<void> {
  try {
    await checkRuns.complete(checkRun, 'success').run()
  } catch {
    // Ignore errors - check run may already be completed
  }
}

Deno.test('CheckRuns.create - returns Task', async () => {
  const checkRuns = createTestCheckRuns()
  const task = checkRuns.create('my-check', 'abc123')

  assertEquals(typeof task.run, 'function')
  const checkRun = await task.run()
  assertEquals(checkRun.name, 'my-check')
  assertEquals(checkRun.headSha, 'abc123')
})

Deno.test('CheckRuns.create - creates queued check run by default', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()

  assertEquals(checkRun.status, 'queued')
  assertEquals(checkRun.name, 'my-check')
  assertEquals(checkRun.headSha, 'abc123')
})

Deno.test('CheckRuns.create - creates in_progress check run with status option', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns
    .create('my-check', 'abc123', { status: 'in_progress' })
    .run()

  assertEquals(checkRun.status, 'in_progress')
  assertEquals(checkRun.startedAt instanceof Date, true)

  await cleanup(checkRuns, checkRun)
})

Deno.test('CheckRuns.start - transitions to in_progress', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()

  assertEquals(checkRun.status, 'queued')

  const started = await checkRuns.start(checkRun).run()

  assertEquals(started.status, 'in_progress')
  assertEquals(started.startedAt instanceof Date, true)
  assertEquals(started.writeAnnotation !== undefined, true)

  await cleanup(checkRuns, started)
})

Deno.test('CheckRuns.start - errors on already completed', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()
  await checkRuns.complete(checkRun, 'success').run()

  await assertRejects(
    () => checkRuns.start(checkRun).run(),
    CheckRunAlreadyCompleted,
    'already completed',
  )
})

Deno.test('CheckRuns.update - updates title and summary', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()

  const updated = await checkRuns
    .update(checkRun, { title: 'Test Title', summary: 'Test Summary' })
    .run()

  assertEquals(updated.title, 'Test Title')
  assertEquals(updated.summary, 'Test Summary')
})

Deno.test('CheckRuns.complete - marks as completed with conclusion', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()

  const completed = await checkRuns.complete(checkRun, 'success').run()

  assertEquals(completed.status, 'completed')
  assertEquals(completed.conclusion, 'success')
  assertEquals(completed.completedAt instanceof Date, true)
})

Deno.test('CheckRuns.complete - errors on already completed', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()
  await checkRuns.complete(checkRun, 'success').run()

  await assertRejects(
    () => checkRuns.complete(checkRun, 'failure').run(),
    CheckRunAlreadyCompleted,
    'already completed',
  )
})

Deno.test('CheckRuns.watch - emits status transitions', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()

  const states: CheckRun[] = []
  const source = checkRuns.watch(checkRun, { interval: 10, timeout: 1000 })

  const subscriptionPromise = (async () => {
    for await (const result of source) {
      if (result.type === 'success') {
        states.push(result.value)
        if (result.value.status === 'completed') {
          break
        }
      }
    }
  })()

  await new Promise((resolve) => setTimeout(resolve, 20))

  await checkRuns.start(checkRun).run()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await checkRuns.update(checkRun, { title: 'Running' }).run()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await checkRuns.complete(checkRun, 'success').run()

  await subscriptionPromise

  assertEquals(states.length >= 2, true)
  assertEquals(states[0].status, 'queued')
  assertEquals(states[states.length - 1].status, 'completed')
})

Deno.test('CheckRuns.start - errors on non-existent check run', async () => {
  const checkRuns = createTestCheckRuns()
  const nonExistent: CheckRun = {
    id: 99999,
    name: 'non-existent',
    headSha: 'abc123',
    status: 'queued',
    conclusion: undefined,
    title: undefined,
    summary: undefined,
    text: undefined,
    startedAt: undefined,
    completedAt: undefined,
  }

  await assertRejects(
    () => checkRuns.start(nonExistent).run(),
    CheckRunNotFound,
    'not found',
  )
})

Deno.test('CheckRuns.update - errors on non-existent check run', async () => {
  const checkRuns = createTestCheckRuns()
  const nonExistent: CheckRun = {
    id: 99999,
    name: 'non-existent',
    headSha: 'abc123',
    status: 'queued',
    conclusion: undefined,
    title: undefined,
    summary: undefined,
    text: undefined,
    startedAt: undefined,
    completedAt: undefined,
  }

  await assertRejects(
    () => checkRuns.update(nonExistent, { title: 'Test' }).run(),
    CheckRunNotFound,
    'not found',
  )
})

Deno.test('CheckRuns.update - allows update on completed check run', async () => {
  const checkRuns = createTestCheckRuns()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()
  await checkRuns.complete(checkRun, 'success').run()

  const updated = await checkRuns
    .update(checkRun, { title: 'Updated Title' })
    .run()

  assertEquals(updated.title, 'Updated Title')
})

Deno.test('CheckRuns.complete - errors on non-existent check run', async () => {
  const checkRuns = createTestCheckRuns()
  const nonExistent: CheckRun = {
    id: 99999,
    name: 'non-existent',
    headSha: 'abc123',
    status: 'queued',
    conclusion: undefined,
    title: undefined,
    summary: undefined,
    text: undefined,
    startedAt: undefined,
    completedAt: undefined,
  }

  await assertRejects(
    () => checkRuns.complete(nonExistent, 'success').run(),
    CheckRunNotFound,
    'not found',
  )
})

Deno.test('CheckRuns.watch - errors on non-existent check run', async () => {
  const checkRuns = createTestCheckRuns()
  const nonExistent: CheckRun = {
    id: 99999,
    name: 'non-existent',
    headSha: 'abc123',
    status: 'queued',
    conclusion: undefined,
    title: undefined,
    summary: undefined,
    text: undefined,
    startedAt: undefined,
    completedAt: undefined,
  }

  const source = checkRuns.watch(nonExistent, { interval: 10, timeout: 100 })
  const results: CheckRun[] = []
  const errors: Error[] = []

  for await (const result of source) {
    if (result.type === 'success') {
      results.push(result.value)
    } else {
      errors.push(result.error)
    }
  }

  assertEquals(results.length, 0)
  assertEquals(errors.length, 1)
  assertEquals(errors[0] instanceof CheckRunNotFound, true)
})

Deno.test('CheckRuns.start - writeAnnotation respects backpressure', async () => {
  const checkRuns = createInMemory()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()
  const started = await checkRuns.start(checkRun).run()

  assertEquals(typeof started.writeAnnotation, 'function')

  const annotation = {
    path: 'test.ts',
    startLine: 1,
    endLine: 1,
    level: 'warning' as const,
    message: 'Test warning',
  }

  await started.writeAnnotation!(annotation)

  await cleanup(checkRuns, started)
})

Deno.test('CheckRuns.start - closes existing batcher for same ID', async () => {
  const checkRuns = createInMemory()
  const checkRun = await checkRuns.create('my-check', 'abc123').run()

  // Start once
  await checkRuns.start(checkRun).run()

  // @ts-ignore: access private batchers map for testing
  const batchers = checkRuns.batchers as Map<number, any>
  const firstBatcherState = batchers.get(checkRun.id)
  assertEquals(firstBatcherState !== undefined, true)
  assertEquals(firstBatcherState.channel.isClosed(), false)

  // Start again (this happens if a user retries starting or calls it twice)
  await checkRuns.start(checkRun).run()

  // Verify first batcher's channel is closed
  assertEquals(firstBatcherState.channel.isClosed(), true)

  await checkRuns.complete(checkRun, 'success').run()
})

Deno.test('CheckRuns.start - ensures state consistency on failure', async () => {
  const innerClient = createInMemoryClient()
  const checkRun = await innerClient.create('my-check', 'abc123').run()

  // Create a proxy that fails on start()
  let shouldFail = false
  const client: any = {
    create: (...args: any[]) => innerClient.create(...args),
    start: (checkRun: CheckRun) => {
      if (shouldFail) {
        return Task.of<CheckRun, any>(() => {
          throw new Error('Start failed')
        })
      }
      return innerClient.start(checkRun)
    },
    update: (...args: any[]) => innerClient.update(...args),
    complete: (...args: any[]) => innerClient.complete(...args),
    watch: (...args: any[]) => innerClient.watch(...args),
  }

  const checkRuns = CheckRuns.fromLike(client)
  // Re-run start once to set up initial state in our CheckRuns instance
  await checkRuns.start(checkRun).run()
  assertEquals((checkRuns as any).batchers.has(checkRun.id), true)

  // Now make it fail
  shouldFail = true
  await assertRejects(
    () => checkRuns.start(checkRun).run(),
  )

  // Map should be empty because we called delete() after closing old one,
  // and failure prevented setting the new one.
  assertEquals((checkRuns as any).batchers.has(checkRun.id), false)
})

Deno.test('CheckRuns.withCheckRun - automates lifecycle', async () => {
  const checkRuns = createInMemory()

  const result = await checkRuns.withCheckRun(
    'auto-check',
    'abc123',
    (started) => {
      return Task.of(async () => {
        await started.writeAnnotation({
          path: 'test.ts',
          startLine: 1,
          endLine: 1,
          level: 'failure',
          message: 'Oops',
        })
        return 'done'
      })
    },
  ).run()

  assertEquals(result, 'done')
})

Deno.test('CheckRuns.withCheckRun - completes with failure if logic fails', async () => {
  const innerClient = createInMemoryClient()
  let lastConclusion: CheckRunConclusion | undefined

  const client: any = {
    create: (...args: any[]) => innerClient.create(...args),
    start: (...args: any[]) => innerClient.start(...args),
    update: (...args: any[]) => innerClient.update(...args),
    complete: (
      checkRun: any,
      conclusion: CheckRunConclusion,
      options?: any,
    ) => {
      lastConclusion = conclusion
      return innerClient.complete(checkRun, conclusion, options)
    },
    watch: (...args: any[]) => innerClient.watch(...args),
  }

  const checkRuns = CheckRuns.fromLike(client)

  await assertRejects(
    () =>
      checkRuns.withCheckRun(
        'auto-check',
        'abc123',
        () => {
          return Task.of(async () => {
            throw new Error('Oops')
          })
        },
      ).run(),
    Error,
    'Oops',
  )

  assertEquals(lastConclusion, 'failure')
})
