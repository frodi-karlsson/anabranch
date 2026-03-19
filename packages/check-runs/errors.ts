/** Additional details included with CheckRuns errors. */
export interface CheckRunsErrorDetails {
  /** ID of the affected check run. */
  checkRunId?: number
  /** HTTP status code from the API response. */
  status?: number
  /** Remaining rate limit quota. */
  rateLimitRemaining?: number
  /** Time when rate limit resets. */
  rateLimitReset?: Date
  /** Additional error-specific properties. */
  [key: string]: unknown
}

/** Base error class for CheckRuns operations. */
export class CheckRunsError extends Error {
  constructor(
    message: string,
    public readonly details: CheckRunsErrorDetails = {},
  ) {
    super(message)
    this.name = 'CheckRunsError'
  }
}

/** Error thrown when a check run is not found. */
export class CheckRunNotFound extends CheckRunsError {
  constructor(checkRunId: number) {
    super(`Check run not found: ${checkRunId}`, { checkRunId })
    this.name = 'CheckRunNotFound'
  }
}

/** Error thrown when attempting to modify a completed check run. */
export class CheckRunAlreadyCompleted extends CheckRunsError {
  constructor(checkRunId: number) {
    super(`Check run already completed: ${checkRunId}`, { checkRunId })
    this.name = 'CheckRunAlreadyCompleted'
  }
}

/** Error thrown when attempting to start an already in-progress check run. */
export class CheckRunAlreadyStarted extends CheckRunsError {
  constructor(checkRunId: number) {
    super(`Check run already started: ${checkRunId}`, { checkRunId })
    this.name = 'CheckRunAlreadyStarted'
  }
}

/** Error thrown when attempting to push annotations to a closed check run. */
export class AnnotationsClosedError extends CheckRunsError {
  constructor(checkRunId: number) {
    super(`Cannot push to annotations: check run ${checkRunId} is closed`, {
      checkRunId,
    })
    this.name = 'AnnotationsClosedError'
  }
}

/** Error thrown when the GitHub API returns an error response. */
export class CheckRunsApiError extends CheckRunsError {
  constructor(
    message: string,
    details: CheckRunsErrorDetails,
  ) {
    super(message, details)
    this.name = 'CheckRunsApiError'
  }
}
