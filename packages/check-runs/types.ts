/** Configuration options for the CheckRuns client. */
export interface CheckRunsOptions {
  /** GitHub API token with repo permissions. */
  token: string
  /** Repository owner (user or organization). */
  owner: string
  /** Repository name. */
  repo: string
  /** GitHub API base URL. Defaults to 'https://api.github.com'. */
  baseUrl?: string
}

/** Options for creating a new check run. */
export interface CreateOptions {
  /** Initial status of the check run. @default 'queued' */
  status?: 'queued' | 'in_progress'
}

/** Fields that can be updated on an existing check run. */
export interface CheckRunUpdate {
  /** Title displayed in the check run UI. */
  title?: string
  /** Summary of the check run results. */
  summary?: string
  /** Detailed text content with Markdown support. */
  text?: string
  /** Annotations to add to the check run. */
  annotations?: import('./annotation.ts').Annotation[]
}

/** Options for completing a check run with a conclusion. */
export interface CheckRunComplete extends CheckRunUpdate {
  /** Final result status of the check run. */
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'timed_out'
    | 'action_required'
}

/** Options for watching a check run until completion. */
export interface WatchOptions {
  /** Polling interval in milliseconds. @default 5000 */
  interval?: number
  /** Maximum time to wait in milliseconds. @default 60000 */
  timeout?: number
  /** AbortSignal to cancel the watch operation. */
  signal?: AbortSignal
}
