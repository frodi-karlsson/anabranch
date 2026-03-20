import { Channel, Stream, Task } from '@anabranch/anabranch'
import { AnnotationBatcher } from './batcher.ts'
import type { CheckRun, CheckRunConclusion } from './check-run.ts'
import type { Annotation } from './annotation.ts'
import type {
  AnnotationBatcherConfig,
  CheckRunUpdate,
  CreateOptions,
  WatchOptions,
} from './types.ts'
import {
  AnnotationsClosedError,
  AnnotationsViaChannelError,
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

interface BatcherState {
  channel: Channel<Annotation>
  batcher: AnnotationBatcher
}

export class CheckRuns {
  private readonly client: CheckRunsLike
  private readonly batcherConfig: AnnotationBatcherConfig
  private readonly batchers: Map<number, BatcherState> = new Map()

  private constructor(
    client: CheckRunsLike,
    batcherConfig?: AnnotationBatcherConfig,
  ) {
    this.client = client
    this.batcherConfig = batcherConfig ?? {}
  }

  static fromLike(
    client: CheckRunsLike,
    config?: AnnotationBatcherConfig,
  ): CheckRuns {
    return new CheckRuns(client, config)
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
    return Task.of<CheckRun, AnyCheckRunsError>(async () => {
      let started: CheckRun
      try {
        started = await this.client.start(checkRun).run()
      } catch (error) {
        throw this.toAnyCheckRunsError(error)
      }

      const channel = Channel.create<Annotation>()
      const batcher = new AnnotationBatcher({
        channel,
        batchSize: this.batcherConfig.batchSize ?? 50,
        flushInterval: this.batcherConfig.flushInterval ?? 5000,
        onFlush: async (annotations: Annotation[]) => {
          const result = await this.client
            .update(started, { annotations })
            .result()
          if (result.type === 'error') {
            console.error(
              `[CheckRuns ${checkRun.id}] Failed to flush annotations: ${result.error.message}`,
            )
          }
        },
      })

      batcher.start()
      this.batchers.set(started.id, { channel, batcher })

      return { ...started, annotations: channel }
    })
  }

  update(
    checkRun: CheckRun,
    options: CheckRunUpdate,
  ): Task<CheckRun, AnyCheckRunsError> {
    if (options.annotations !== undefined && options.annotations.length > 0) {
      throw new AnnotationsViaChannelError()
    }

    return this.client.update(checkRun, options).mapErr((e) =>
      this.toAnyCheckRunsError(e)
    )
  }

  complete(
    checkRun: CheckRun,
    conclusion: CheckRunConclusion,
    options?: CheckRunUpdate,
  ): Task<CheckRun, AnyCheckRunsError> {
    return Task.of<CheckRun, AnyCheckRunsError>(async () => {
      const state = this.batchers.get(checkRun.id)

      if (state) {
        await state.batcher.close()
        this.batchers.delete(checkRun.id)
      }

      try {
        return await this.client.complete(checkRun, conclusion, options).run()
      } catch (error) {
        throw this.toAnyCheckRunsError(error)
      }
    })
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
