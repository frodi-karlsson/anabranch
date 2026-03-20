import { Source, Stream, Task } from '@anabranch/anabranch'
import { CheckRuns } from './check-runs.ts'
import type {
  CheckRun,
  CheckRunConclusion,
  CheckRunStatus,
} from './check-run.ts'
import type { Annotation } from './annotation.ts'
import type { CheckRunUpdate, CreateOptions, WatchOptions } from './types.ts'
import {
  CheckRunAlreadyCompleted,
  CheckRunAlreadyStarted,
  CheckRunNotFound,
  CheckRunsApiError,
} from './errors.ts'
import type { AnyCheckRunsError } from './check-runs.ts'

interface StoredCheckRun extends CheckRun {
  annotationsList: Annotation[]
}

export interface InMemoryOptions {
  clock?: () => number
}

interface InMemoryClient {
  create: (
    name: string,
    headSha: string,
    options?: CreateOptions,
  ) => Task<CheckRun, CheckRunsApiError>
  start: (checkRun: CheckRun) => Task<CheckRun, CheckRunsApiError>
  update: (
    checkRun: CheckRun,
    options: CheckRunUpdate,
  ) => Task<CheckRun, CheckRunsApiError>
  complete: (
    checkRun: CheckRun,
    conclusion: CheckRunConclusion,
    options?: CheckRunUpdate,
  ) => Task<CheckRun, CheckRunsApiError>
  watch: (
    checkRun: CheckRun,
    options?: WatchOptions,
  ) => Stream<CheckRun, AnyCheckRunsError>
}

function createInMemoryClient(options?: InMemoryOptions): InMemoryClient {
  const checkRuns: Map<number, StoredCheckRun> = new Map()
  const watchers: Set<(checkRun: CheckRun) => void> = new Set()
  let nextId = 1
  const clock = options?.clock ?? Date.now

  function notifyWatchers(checkRun: CheckRun): void {
    for (const watcher of watchers) {
      watcher(checkRun)
    }
  }

  return {
    create(
      name: string,
      headSha: string,
      options?: CreateOptions,
    ): Task<CheckRun, CheckRunsApiError> {
      return Task.of<CheckRun, CheckRunsApiError>(() => {
        const id = nextId++
        const status: CheckRunStatus = options?.status ?? 'queued'
        const stored: StoredCheckRun = {
          id,
          name,
          headSha,
          status,
          conclusion: undefined,
          title: undefined,
          summary: undefined,
          text: undefined,
          startedAt: status === 'in_progress' ? new Date(clock()) : undefined,
          completedAt: undefined,
          annotationsList: [],
        }
        checkRuns.set(id, stored)
        notifyWatchers(stored)
        return stored
      })
    },

    start(checkRun: CheckRun): Task<CheckRun, CheckRunsApiError> {
      return Task.of<CheckRun, CheckRunsApiError>(() => {
        const stored = checkRuns.get(checkRun.id)
        if (!stored) {
          throw new CheckRunNotFound(checkRun.id)
        }
        if (stored.status === 'in_progress') {
          throw new CheckRunAlreadyStarted(checkRun.id)
        }
        if (stored.status === 'completed') {
          throw new CheckRunAlreadyCompleted(checkRun.id)
        }
        const updated: StoredCheckRun = {
          ...stored,
          status: 'in_progress',
          startedAt: new Date(clock()),
        }
        checkRuns.set(checkRun.id, updated)
        notifyWatchers(updated)
        return updated
      })
    },

    update(
      checkRun: CheckRun,
      options: CheckRunUpdate,
    ): Task<CheckRun, CheckRunsApiError> {
      return Task.of<CheckRun, CheckRunsApiError>(() => {
        const stored = checkRuns.get(checkRun.id)
        if (!stored) {
          throw new CheckRunNotFound(checkRun.id)
        }
        const updated: StoredCheckRun = {
          ...stored,
          ...(options.title !== undefined && { title: options.title }),
          ...(options.summary !== undefined && { summary: options.summary }),
          ...(options.text !== undefined && { text: options.text }),
        }
        if (options.annotations) {
          updated.annotationsList = [
            ...updated.annotationsList,
            ...options.annotations,
          ]
        }
        checkRuns.set(checkRun.id, updated)
        notifyWatchers(updated)
        return updated
      })
    },

    complete(
      checkRun: CheckRun,
      conclusion: CheckRunConclusion,
      options?: CheckRunUpdate,
    ): Task<CheckRun, CheckRunsApiError> {
      return Task.of<CheckRun, CheckRunsApiError>(() => {
        const stored = checkRuns.get(checkRun.id)
        if (!stored) {
          throw new CheckRunNotFound(checkRun.id)
        }
        if (stored.status === 'completed') {
          throw new CheckRunAlreadyCompleted(checkRun.id)
        }
        const updated: StoredCheckRun = {
          ...stored,
          status: 'completed',
          conclusion,
          ...(options?.title !== undefined && { title: options.title }),
          ...(options?.summary !== undefined && { summary: options.summary }),
          ...(options?.text !== undefined && { text: options.text }),
          completedAt: new Date(clock()),
        }
        checkRuns.set(checkRun.id, updated)
        notifyWatchers(updated)
        return updated
      })
    },

    watch(
      checkRun: CheckRun,
      watchOptions?: WatchOptions,
    ): Stream<CheckRun, AnyCheckRunsError> {
      const timeout = watchOptions?.timeout ?? 60000
      const signal = watchOptions?.signal
      const startTime = clock()
      const storedCheckRuns = checkRuns
      const watchersSet = watchers

      return Source.fromResults<CheckRun, AnyCheckRunsError>(
        async function* () {
          const stored = storedCheckRuns.get(checkRun.id)
          if (!stored) {
            yield { type: 'error', error: new CheckRunNotFound(checkRun.id) }
            return
          }

          let current = stored
          let resolveNext: (() => void) | undefined

          const watcher = (updated: CheckRun) => {
            if (updated.id === checkRun.id) {
              current = updated as StoredCheckRun
              resolveNext?.()
            }
          }
          watchersSet.add(watcher)

          try {
            while (true) {
              if (signal?.aborted) {
                return
              }

              if (clock() - startTime > timeout) {
                yield {
                  type: 'error',
                  error: new CheckRunsApiError(
                    `Watch timeout after ${timeout}ms`,
                    {},
                  ),
                }
                return
              }

              yield { type: 'success', value: current }

              if (current.status === 'completed') {
                return
              }

              await new Promise<void>((resolve) => {
                resolveNext = resolve
              })
            }
          } finally {
            watchersSet.delete(watcher)
          }
        },
      )
    },
  }
}

export function createInMemory(options?: InMemoryOptions): CheckRuns {
  const client = createInMemoryClient(options)
  return CheckRuns.fromLike(client)
}

export { createInMemoryClient }
