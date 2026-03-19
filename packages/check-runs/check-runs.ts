import { Stream, Task } from '@anabranch/anabranch'
import type { CheckRun, CheckRunConclusion } from './check-run.ts'
import type { CheckRunUpdate, CreateOptions, WatchOptions } from './types.ts'
import {
  AnnotationsClosedError,
  CheckRunAlreadyCompleted,
  CheckRunAlreadyStarted,
  CheckRunNotFound,
  CheckRunsApiError,
} from './errors.ts'

export type AnyCheckRunsError =
  | CheckRunNotFound
  | CheckRunAlreadyStarted
  | CheckRunAlreadyCompleted
  | AnnotationsClosedError
  | CheckRunsApiError

export { CheckRunsApiError } from './errors.ts'

export interface CheckRunsLike {
  create(
    name: string,
    headSha: string,
    options?: CreateOptions,
  ): Task<CheckRun, CheckRunsApiError>
  start(checkRun: CheckRun): Task<CheckRun, CheckRunsApiError>
  update(
    checkRun: CheckRun,
    options: CheckRunUpdate,
  ): Task<CheckRun, CheckRunsApiError>
  complete(
    checkRun: CheckRun,
    conclusion: CheckRunConclusion,
    options?: CheckRunUpdate,
  ): Task<CheckRun, CheckRunsApiError>
  watch(
    checkRun: CheckRun,
    options?: WatchOptions,
  ): Stream<CheckRun, AnyCheckRunsError>
}

export class CheckRuns {
  private readonly client: CheckRunsLike

  private constructor(client: CheckRunsLike) {
    this.client = client
  }

  static fromLike(client: CheckRunsLike): CheckRuns {
    return new CheckRuns(client)
  }

  create(
    name: string,
    headSha: string,
    options?: CreateOptions,
  ): Task<CheckRun, AnyCheckRunsError> {
    return this.client.create(name, headSha, options).mapErr((e) =>
      this.toAnyCheckRunsError(e)
    )
  }

  start(checkRun: CheckRun): Task<CheckRun, AnyCheckRunsError> {
    return this.client.start(checkRun).mapErr((e) =>
      this.toAnyCheckRunsError(e)
    )
  }

  update(
    checkRun: CheckRun,
    options: CheckRunUpdate,
  ): Task<CheckRun, AnyCheckRunsError> {
    return this.client.update(checkRun, options).mapErr((e) =>
      this.toAnyCheckRunsError(e)
    )
  }

  complete(
    checkRun: CheckRun,
    conclusion: CheckRunConclusion,
    options?: CheckRunUpdate,
  ): Task<CheckRun, AnyCheckRunsError> {
    return this.client.complete(checkRun, conclusion, options).mapErr((e) =>
      this.toAnyCheckRunsError(e)
    )
  }

  watch(
    checkRun: CheckRun,
    options?: WatchOptions,
  ): Stream<CheckRun, AnyCheckRunsError> {
    return this.client.watch(checkRun, options)
  }

  private toAnyCheckRunsError(error: unknown): AnyCheckRunsError {
    if (
      error instanceof CheckRunNotFound ||
      error instanceof CheckRunAlreadyStarted ||
      error instanceof CheckRunAlreadyCompleted ||
      error instanceof AnnotationsClosedError ||
      error instanceof CheckRunsApiError
    ) {
      return error
    }
    return new CheckRunsApiError(
      error instanceof Error ? error.message : 'Unknown error',
      {},
    )
  }
}
