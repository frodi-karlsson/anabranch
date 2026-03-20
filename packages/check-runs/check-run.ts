import type { Annotation } from './annotation.ts'

/** Possible status values for a check run. */
export type CheckRunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting'

/** Possible conclusion values for a completed check run. */
export type CheckRunConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'

/** Represents a GitHub check run with its state and metadata. */
export interface CheckRun {
  /** Unique identifier for the check run. */
  id: number
  /** Name of the check run displayed in the UI. */
  name: string
  /** SHA of the commit being checked. */
  headSha: string
  /** Current status of the check run. */
  status: CheckRunStatus
  /** Final result, set only when status is 'completed'. */
  conclusion?: CheckRunConclusion
  /** Title displayed in the check run output. */
  title?: string
  /** Summary text shown in the check run output. */
  summary?: string
  /** Detailed markdown content. */
  text?: string
  /** Timestamp when the check run started. */
  startedAt?: Date
  /** Timestamp when the check run finished. */
  completedAt?: Date
}

/** A started check run with annotation streaming capabilities. */
export interface StartedCheckRun extends CheckRun {
  /** Write an annotation with backpressure. Waits for buffer capacity before writing. */
  writeAnnotation: (annotation: Annotation) => Promise<void>
}
