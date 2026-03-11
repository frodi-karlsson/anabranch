import type { Promisable, Result } from '../util/util.ts'

/**
 * A single async task with error-aware utilities like retries and timeouts.
 */
export class Task<T, E> {
  private runTask: (signal?: AbortSignal) => Promise<T>

  private constructor(task: (signal?: AbortSignal) => Promise<T>) {
    this.runTask = task
  }

  /**
   * Creates a {@link Task} from a sync or async function.
   * The function receives an optional AbortSignal that is active when
   * the task is run with a signal via {@link withSignal} or {@link run}.
   *
   * Note: the error type `E` is unchecked and represents the expected error
   * shape rather than a runtime guarantee.
   */
  static of<R, E>(task: (signal?: AbortSignal) => Promisable<R>): Task<R, E> {
    return new Task((signal) => {
      const result = task(signal)
      return result instanceof Promise ? result : Promise.resolve(result)
    })
  }

  /**
   * Wraps the task with an external abort signal.
   */
  withSignal(signal: AbortSignal): Task<T, E> {
    return new Task((innerSignal) => {
      const { signal: merged, cleanup } = this.mergeSignals(
        signal,
        innerSignal,
      )
      return this.runWithSignal(merged).finally(cleanup)
    })
  }

  /**
   * Executes the task and returns a tagged result instead of throwing.
   */
  async result(): Promise<Result<T, E>> {
    try {
      const value = await this.run()
      return { type: 'success', value } as Result<T, E>
    } catch (error) {
      return { type: 'error', error: error as E } as Result<T, E>
    }
  }

  /**
   * Executes the task and resolves the value or throws the error.
   */
  run(): Promise<T> {
    return this.runWithSignal()
  }

  /**
   * Maps the successful value. Errors are passed through unchanged.
   */
  map<U, E2 = E>(fn: (value: T) => Promisable<U>): Task<U, E | E2> {
    return new Task(async (signal) => {
      const value = await this.runWithSignal(signal)
      return await fn(value)
    })
  }

  /**
   * Chains another task based on the successful value.
   */
  flatMap<U>(fn: (value: T) => Task<U, E>): Task<U, E> {
    return new Task(async (signal) => {
      const value = await this.runWithSignal(signal)
      const next = fn(value)
      return await next.runWithSignal(signal)
    })
  }

  /**
   * Maps the error value. Successful values are passed through unchanged.
   */
  mapErr<F>(fn: (error: E) => Promisable<F>): Task<T, F> {
    return new Task(async (signal) => {
      try {
        return await this.runWithSignal(signal)
      } catch (error) {
        throw await fn(error as E)
      }
    })
  }

  /**
   * Runs a side effect on the successful value.
   */
  tap(fn: (value: T) => Promisable<void>): Task<T, E> {
    return new Task(async (signal) => {
      const value = await this.runWithSignal(signal)
      await fn(value)
      return value
    })
  }

  /**
   * Runs a side effect on the error value.
   */
  tapErr(fn: (error: E) => Promisable<void>): Task<T, E> {
    return new Task(async (signal) => {
      try {
        return await this.runWithSignal(signal)
      } catch (error) {
        await fn(error as E)
        throw error
      }
    })
  }

  /**
   * Recovers from errors by mapping them to a successful value.
   */
  recover<U>(fn: (error: E) => Promisable<U>): Task<T | U, never> {
    return new Task(async (signal) => {
      try {
        return await this.runWithSignal(signal)
      } catch (error) {
        return await fn(error as E)
      }
    })
  }

  /**
   * Recovers from specific error types by mapping them to a successful value.
   */
  recoverWhen<E2 extends E, U>(
    guard: (error: E) => error is E2,
    fn: (error: E2) => Promisable<U>,
  ): Task<T | U, Exclude<E, E2>> {
    return new Task(async (signal) => {
      try {
        return await this.runWithSignal(signal)
      } catch (error) {
        if (guard(error as E)) {
          return await fn(error as E2)
        }
        throw error
      }
    })
  }

  /**
   * Chains another task based on the error value.
   */
  flatMapErr<F>(fn: (error: E) => Task<T, F>): Task<T, F> {
    return new Task(async (signal) => {
      try {
        return await this.runWithSignal(signal)
      } catch (error) {
        const next = fn(error as E)
        return await next.runWithSignal(signal)
      }
    })
  }

  /**
   * Retries the task when the predicate returns true.
   */
  retry(options: {
    attempts: number
    delay?: number | ((attempt: number, error: E) => number)
    when?: (error: E) => boolean
  }): Task<T, E> {
    const { attempts, delay, when } = options
    return new Task(async (signal) => {
      let lastError: E | undefined
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await this.runWithSignal(signal)
        } catch (error) {
          lastError = error as E
          if (when && !when(lastError)) {
            throw lastError
          }
          if (attempt + 1 < attempts) {
            const delayMs = typeof delay === 'function'
              ? delay(attempt, lastError)
              : (delay ?? 0)
            if (delayMs > 0) {
              await this.delayWithSignal(delayMs, signal)
            }
          }
        }
      }
      throw lastError as E
    })
  }

  /**
   * Fails if the task does not complete within the specified time.
   */
  timeout(ms: number, error?: E): Task<T, E> {
    return new Task(async (signal) => {
      const controller = new AbortController()
      const onOuterAbort = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', onOuterAbort, { once: true })

      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutErr = error ?? (new Error(`Timeout after ${ms}ms`) as E)
          controller.abort(timeoutErr)
          reject(timeoutErr)
        }, ms)
      })

      try {
        return await Promise.race([
          this.runWithSignal(controller.signal),
          timeoutPromise,
        ])
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
        if (signal) {
          signal.removeEventListener('abort', onOuterAbort)
        }
      }
    })
  }

  /**
   * Runs multiple tasks and collects results. Rejects on the first failure.
   */
  static all<T, E>(tasks: Task<T, E>[]): Task<T[], E> {
    return new Task(async (signal) => {
      const runTask = signal
        ? (task: Task<T, E>) => task.withSignal(signal).run()
        : (task: Task<T, E>) => task.run()
      const results = await Promise.all(tasks.map(runTask))
      return results
    })
  }

  /**
   * Runs multiple tasks and collects all results without throwing.
   */
  static allSettled<T, E>(
    tasks: Task<T, E>[],
  ): Task<Result<T, E>[], never> {
    return new Task(async (signal) => {
      const getResult = signal
        ? (task: Task<T, E>) => task.withSignal(signal).result()
        : (task: Task<T, E>) => task.result()
      const results = await Promise.all(tasks.map(getResult))
      return results
    })
  }

  /**
   * Runs tasks concurrently and resolves with the first settled result.
   *
   * Note: If all tasks fail, the errors array is in completion order (the order
   * tasks finished), not task order. This is nondeterministic due to
   * concurrent execution.
   */
  static race<T, E>(tasks: Task<T, E>[]): Task<Result<T, E[]>, never> {
    return new Task(async (signal) => {
      if (tasks.length === 0) {
        throw new Error('Task.race requires at least one task')
      }

      const errors: E[] = []
      const controllers = tasks.map(() => new AbortController())
      const cleanup = new Map<number, () => void>()
      const merged = tasks.map((task, index) => {
        if (!signal) {
          return task.withSignal(controllers[index].signal)
        }
        const mergedSignals = Task.mergeExternalSignals(
          signal,
          controllers[index].signal,
        )
        cleanup.set(index, mergedSignals.cleanup)
        return task.withSignal(mergedSignals.signal)
      })

      return await new Promise<Result<T, E[]>>((resolve, reject) => {
        let remaining = merged.length
        let resolved = false
        const abortListener = signal
          ? () => reject(signal.reason ?? new Error('Task aborted'))
          : undefined

        if (abortListener && signal) {
          signal.addEventListener('abort', abortListener, { once: true })
        }
        merged.forEach((task, index) => {
          task.result().then((value) => {
            if (resolved) {
              return
            }
            if (value.type === 'success') {
              resolved = true
              controllers.forEach((controller, controllerIndex) => {
                if (controllerIndex !== index) {
                  controller.abort()
                }
              })
              cleanup.forEach((cleanupFn) => cleanupFn())
              if (abortListener && signal) {
                signal.removeEventListener('abort', abortListener)
              }
              resolve(
                { type: 'success', value: value.value } as unknown as Result<
                  T,
                  E[]
                >,
              )
              return
            }

            errors.push(value.error)
            remaining -= 1
            if (remaining === 0) {
              resolved = true
              cleanup.forEach((cleanupFn) => cleanupFn())
              if (abortListener && signal) {
                signal.removeEventListener('abort', abortListener)
              }
              resolve({ type: 'error', error: errors } as Result<T, E[]>)
              controllers.forEach((controller) => controller.abort())
            }
          }).catch((error) => {
            if (resolved) {
              return
            }
            resolved = true
            cleanup.forEach((cleanupFn) => cleanupFn())
            if (abortListener && signal) {
              signal.removeEventListener('abort', abortListener)
            }
            controllers.forEach((controller) => controller.abort())
            reject(error)
          })
        })
      })
    })
  }

  /**
   * Runs tasks sequentially, passing the successful value from one to the next.
   * If any task fails, the chain is short-circuited and the error is returned.
   *
   * Return types -> parameter type inference is supported up to an arbitrary 7 tasks.
   * If you need more, you can just chain two chains.
   *
   * Example usage:
   * ```ts
   * Task.chain([
   *   () => Task.of(() => 1),
   *   (prev) => Task.of(() => prev + 1),
   *   (prev) => Task.of(() => `Result: ${prev}`),
   * ]).tap((result) => {
   *   console.log(result) // "Result: 2"
   * }).run()
   * ```
   */
  static chain(arr: []): Task<void, never>
  static chain<R, E1>(tasks: [() => Task<R, E1>]): Task<R, E1>
  static chain<A, R, E1, E2>(tasks: [
    () => Task<A, E1>,
    (prev: A) => Task<R, E2>,
  ]): Task<R, E1 | E2>
  static chain<A, B, R, E1, E2, E3>(tasks: [
    () => Task<A, E1>,
    (prev: A) => Task<B, E2>,
    (prev: B) => Task<R, E3>,
  ]): Task<R, E1 | E2 | E3>
  static chain<A, B, C, R, E1, E2, E3, E4>(tasks: [
    () => Task<A, E1>,
    (prev: A) => Task<B, E2>,
    (prev: B) => Task<C, E3>,
    (prev: C) => Task<R, E4>,
  ]): Task<R, E1 | E2 | E3 | E4>
  static chain<A, B, C, D, R, E1, E2, E3, E4, E5>(tasks: [
    () => Task<A, E1>,
    (prev: A) => Task<B, E2>,
    (prev: B) => Task<C, E3>,
    (prev: C) => Task<D, E4>,
    (prev: D) => Task<R, E5>,
  ]): Task<R, E1 | E2 | E3 | E4 | E5>
  static chain<A, B, C, D, E, R, E1, E2, E3, E4, E5, E6>(tasks: [
    () => Task<A, E1>,
    (prev: A) => Task<B, E2>,
    (prev: B) => Task<C, E3>,
    (prev: C) => Task<D, E4>,
    (prev: D) => Task<E, E5>,
    (prev: E) => Task<R, E6>,
  ]): Task<R, E1 | E2 | E3 | E4 | E5 | E6>
  static chain<A, B, C, D, E, F, R, E1, E2, E3, E4, E5, E6, E7>(tasks: [
    () => Task<A, E1>,
    (prev: A) => Task<B, E2>,
    (prev: B) => Task<C, E3>,
    (prev: C) => Task<D, E4>,
    (prev: D) => Task<E, E5>,
    (prev: E) => Task<F, E6>,
    (prev: F) => Task<R, E7>,
  ]): Task<R, E1 | E2 | E3 | E4 | E5 | E6 | E7>
  static chain<R, E>(
    tasks: [
      // deno-lint-ignore no-explicit-any
      ...Array<(prevResult: unknown) => Task<unknown, any>>,
      (prevResult: unknown) => Task<R, E>,
    ] | [],
  ): Task<R, unknown> {
    if (tasks.length === 0) return Task.of(() => undefined) as Task<R, E>
    return new Task(async (signal) => {
      let result: unknown = undefined
      for (const taskFn of tasks) {
        result = await taskFn(result).runWithSignal(signal)
      }
      return result as R
    })
  }

  /**
   * Acquires a resource, runs a task that uses it, and releases it regardless
   * of success or failure. Useful for resource lifecycle management when the
   * use computation is a composed Task chain.
   *
   * The `acquire` function receives an optional AbortSignal that is active when
   * the task is run with a signal. The `release` function always runs and does
   * not receive a signal — cleanup should not be cancellable.
   *
   * @example
   * ```ts
   * const task = Task.acquireRelease({
   *   acquire: (signal) => db.connect(signal),
   *   release: (conn) => conn.close(),
   *   use: (conn) => Task.of(() => query(conn))
   *     .retry({ attempts: 3 })
   *     .timeout(5_000),
   * });
   *
   * const result = await task.result();
   * ```
   */
  static acquireRelease<R, T, E>({
    acquire,
    release,
    use,
  }: {
    acquire: (signal?: AbortSignal) => Promise<R>
    release: (resource: R) => Promise<void>
    use: (resource: R) => Task<T, E>
  }): Task<T, E> {
    return new Task(async (signal) => {
      const resource = await acquire(signal)
      try {
        const innerTask = use(resource)
        return signal
          ? await innerTask.withSignal(signal).run()
          : await innerTask.run()
      } finally {
        await release(resource)
      }
    })
  }

  protected async runWithSignal(signal?: AbortSignal): Promise<T> {
    if (!signal) {
      return this.runTask()
    }
    if (signal.aborted) {
      return Promise.reject(
        signal.reason ?? (new Error('Task aborted') as E),
      )
    }

    let onAbort: (() => void) | undefined
    const abortPromise = new Promise<T>((_, reject) => {
      onAbort = () => {
        signal.removeEventListener('abort', onAbort!)
        reject(signal.reason ?? (new Error('Task aborted') as E))
      }
      signal.addEventListener('abort', onAbort, {
        once: true,
      })
    })

    try {
      return await Promise.race([this.runTask(signal), abortPromise])
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
    }
  }

  private async delayWithSignal(
    ms: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!signal) {
      return new Promise<void>((resolve) => setTimeout(resolve, ms))
    }
    if (signal.aborted) {
      return Promise.reject(
        signal.reason ?? (new Error('Task aborted') as E),
      )
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const sleepPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, ms)
    })
    const abortPromise = new Promise<void>((_, reject) => {
      onAbort = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
        signal.removeEventListener('abort', onAbort!)
        reject(signal.reason ?? (new Error('Task aborted') as E))
      }
      signal.addEventListener('abort', onAbort, {
        once: true,
      })
    })

    try {
      return await Promise.race([sleepPromise, abortPromise])
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }
  }

  private mergeSignals(
    outer: AbortSignal,
    inner?: AbortSignal,
  ): { signal: AbortSignal; cleanup: () => void } {
    if (!inner) {
      return { signal: outer, cleanup: () => {} }
    }
    if (outer.aborted) {
      return { signal: outer, cleanup: () => {} }
    }
    if (inner.aborted) {
      return { signal: inner, cleanup: () => {} }
    }
    return Task.mergeExternalSignals(outer, inner)
  }

  private static mergeExternalSignals(
    outer: AbortSignal,
    inner: AbortSignal,
  ): { signal: AbortSignal; cleanup: () => void } {
    if (outer.aborted) {
      return { signal: outer, cleanup: () => {} }
    }
    if (inner.aborted) {
      return { signal: inner, cleanup: () => {} }
    }
    const controller = new AbortController()
    const onOuterAbort = () => controller.abort(outer.reason)
    const onInnerAbort = () => controller.abort(inner.reason)
    outer.addEventListener('abort', onOuterAbort, { once: true })
    inner.addEventListener('abort', onInnerAbort, { once: true })
    return {
      signal: controller.signal,
      cleanup: () => {
        outer.removeEventListener('abort', onOuterAbort)
        inner.removeEventListener('abort', onInnerAbort)
      },
    }
  }
}
