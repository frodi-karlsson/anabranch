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
      const interval = watchOptions?.interval ?? 5000
      const timeout = watchOptions?.timeout ?? 60000
      const signal = watchOptions?.signal
      const startTime = clock()
      const storedCheckRuns = checkRuns

      return Source.from<CheckRun, AnyCheckRunsError>(async function* () {
        while (true) {
          if (signal?.aborted) {
            break
          }

          if (clock() - startTime > timeout) {
            break
          }

          const stored = storedCheckRuns.get(checkRun.id)
          if (!stored) {
            throw new CheckRunNotFound(checkRun.id)
          }

          yield stored

          if (stored.status === 'completed') {
            break
          }

          await new Promise((resolve) => setTimeout(resolve, interval))
        }
      })
    },
  }
}

export function createInMemory(options?: InMemoryOptions): CheckRuns {
  const client = createInMemoryClient(options)
  return CheckRuns.fromLike(client)
}

export { createInMemoryClient }
