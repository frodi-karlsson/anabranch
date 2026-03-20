import { Source, Task } from '@anabranch/anabranch'
import { CheckRunsApiError } from '@anabranch/check-runs'
import type {
  Annotation,
  CheckRun,
  CheckRunConclusion,
  CheckRunsErrorDetails,
  CheckRunStatus,
} from '@anabranch/check-runs'
import type {
  CheckRunComplete,
  CheckRunsOptions,
  CheckRunUpdate,
  CreateOptions,
  WatchOptions,
} from '@anabranch/check-runs'

interface GithubCheckRunResponse {
  id: number
  name: string
  head_sha: string
  status: string
  conclusion: string | null
  output: {
    title: string | null
    summary: string | null
    text: string | null
  }
  started_at: string | null
  completed_at: string | null
}

interface GithubAnnotation {
  path: string
  start_line: number
  end_line: number
  annotation_level: 'notice' | 'warning' | 'failure'
  message: string
  title?: string
  raw_details?: string
}

interface ResolvedConfig {
  token: string
  owner: string
  repo: string
  baseUrl: string
  fetch: typeof globalThis.fetch
}

/**
 * GitHub API client for managing check runs.
 *
 * @example
 * ```ts
 * const client = GithubClient.create({
 *   token: "ghs_xxx",
 *   owner: "my-org",
 *   repo: "my-repo",
 * });
 *
 * const checkRun = await client.create("my-check", "abc123").run();
 * await client.complete(checkRun.id, { conclusion: "success" }).run();
 * ```
 */
export class GithubClient {
  private readonly config: ResolvedConfig

  private constructor(config: ResolvedConfig) {
    this.config = config
  }

  /** Creates a new GithubClient with the given options. */
  static create(options: CheckRunsOptions): GithubClient {
    return new GithubClient({
      token: options.token,
      owner: options.owner,
      repo: options.repo,
      baseUrl: options.baseUrl ?? 'https://api.github.com',
      fetch: globalThis.fetch,
    })
  }

  /** Returns a new GithubClient with the given fetch function. */
  withFetch(fetch: typeof globalThis.fetch): GithubClient {
    return new GithubClient({
      ...this.config,
      fetch,
    })
  }

  /**
   * Creates a new check run.
   *
   * @param name - The name of the check run.
   * @param headSha - The SHA of the commit being checked.
   * @param options - Optional creation options.
   * @returns A Task that resolves with the created CheckRun.
   */
  create(
    name: string,
    headSha: string,
    options?: CreateOptions,
  ): Task<CheckRun, CheckRunsApiError> {
    const status = options?.status ?? 'queued'
    return Task.of<CheckRun, CheckRunsApiError>((signal) =>
      this.request(
        'POST',
        `/repos/${this.config.owner}/${this.config.repo}/check-runs`,
        signal,
        {
          name,
          head_sha: headSha,
          status,
        },
      )
    )
  }

  /**
   * Starts a check run by setting status to "in_progress".
   *
   * @param checkRun - The check run to start.
   * @returns A Task that resolves with the updated CheckRun.
   */
  start(checkRun: CheckRun): Task<CheckRun, CheckRunsApiError> {
    return Task.of<CheckRun, CheckRunsApiError>((signal) =>
      this.request(
        'PATCH',
        `/repos/${this.config.owner}/${this.config.repo}/check-runs/${checkRun.id}`,
        signal,
        { status: 'in_progress' },
      )
    )
  }

  /**
   * Updates a check run with output details.
   *
   * @param checkRun - The check run to update.
   * @param options - The fields to update, including optional annotations.
   * @returns A Task that resolves with the updated CheckRun.
   */
  update(
    checkRun: CheckRun,
    options: CheckRunUpdate & { annotations?: Annotation[] },
  ): Task<CheckRun, CheckRunsApiError> {
    const output: Record<string, unknown> = {}
    if (options.title !== undefined) output.title = options.title
    if (options.summary !== undefined) output.summary = options.summary
    if (options.text !== undefined) output.text = options.text
    if (options.annotations !== undefined) {
      output.annotations = options.annotations.map((a) =>
        this.toGithubAnnotation(a)
      )
    }

    const body: Record<string, unknown> = {}
    if (Object.keys(output).length > 0) body.output = output

    return Task.of<CheckRun, CheckRunsApiError>((signal) =>
      this.request(
        'PATCH',
        `/repos/${this.config.owner}/${this.config.repo}/check-runs/${checkRun.id}`,
        signal,
        body,
      )
    )
  }

  /**
   * Completes a check run with a conclusion.
   *
   * @param checkRun - The check run to complete.
   * @param conclusion - The conclusion status.
   * @param options - Optional completion details including annotations.
   * @returns A Task that resolves with the completed CheckRun.
   */
  complete(
    checkRun: CheckRun,
    conclusion: CheckRunConclusion,
    options?: Omit<CheckRunComplete, 'conclusion'> & {
      annotations?: Annotation[]
    },
  ): Task<CheckRun, CheckRunsApiError> {
    const body: Record<string, unknown> = {
      status: 'completed',
      conclusion,
    }
    const output: Record<string, unknown> = {}
    if (options?.title !== undefined) output.title = options.title
    if (options?.summary !== undefined) output.summary = options.summary
    if (options?.text !== undefined) output.text = options.text
    if (options?.annotations !== undefined) {
      output.annotations = options.annotations.map((a) =>
        this.toGithubAnnotation(a)
      )
    }
    if (Object.keys(output).length > 0) body.output = output

    return Task.of<CheckRun, CheckRunsApiError>((signal) =>
      this.request(
        'PATCH',
        `/repos/${this.config.owner}/${this.config.repo}/check-runs/${checkRun.id}`,
        signal,
        body,
      )
    )
  }

  /**
   * Gets a check run by ID.
   *
   * @param checkRun - The check run to retrieve.
   * @returns A Task that resolves with the CheckRun.
   */
  get(checkRun: CheckRun): Task<CheckRun, CheckRunsApiError> {
    return Task.of<CheckRun, CheckRunsApiError>((signal) =>
      this.request(
        'GET',
        `/repos/${this.config.owner}/${this.config.repo}/check-runs/${checkRun.id}`,
        signal,
      )
    )
  }

  /**
   * Watches a check run for status changes.
   *
   * Yields the initial state immediately, then polls for updates until:
   * - The check run reaches 'completed' status (normal completion)
   * - The timeout is exceeded (yields a timeout error)
   * - The signal is aborted (stream ends without error)
   *
   * @param checkRun - The check run to watch.
   * @param options - Watch options including interval and timeout.
   * @returns A Source that emits CheckRun updates.
   */
  watch(
    checkRun: CheckRun,
    options?: WatchOptions,
  ): Source<CheckRun, CheckRunsApiError> {
    // deno-lint-ignore no-this-alias
    const client = this
    const interval = options?.interval ?? 5000
    const timeout = options?.timeout ?? 60000
    const signal = options?.signal
    const startTime = Date.now()

    return Source.fromResults<CheckRun, CheckRunsApiError>(async function* () {
      // Fetch initial state - yield before completion check so caller sees final state
      const initial = await client.get({ ...checkRun }).result()
      if (initial.type === 'error') {
        yield initial
        return
      }
      let current = initial.value

      while (true) {
        if (signal?.aborted) {
          return
        }

        if (Date.now() - startTime > timeout) {
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

        await new Promise((resolve) => setTimeout(resolve, interval))

        if (signal?.aborted) {
          return
        }

        const result = await client.get({ ...current }).result()
        if (result.type === 'error') {
          yield result
          return
        }
        current = result.value
      }
    })
  }

  private apiUrl(path: string): string {
    const base = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl
      : this.config.baseUrl + '/'
    return base + path.replace(/^\/+/, '')
  }

  private headers(): Record<string, string> {
    return {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${this.config.token}`,
      'Content-Type': 'application/json',
    }
  }

  private async request(
    method: string,
    path: string,
    signal: AbortSignal | undefined,
    body?: Record<string, unknown>,
  ): Promise<CheckRun> {
    const url = this.apiUrl(path)
    const response = await this.config.fetch(url, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })

    if (!response.ok) {
      throw await this.handleResponse(response)
    }

    const data = (await response.json()) as GithubCheckRunResponse
    return this.toCheckRun(data)
  }

  private async handleResponse(response: Response): Promise<CheckRunsApiError> {
    const remaining = response.headers.get('x-ratelimit-remaining')
    const reset = response.headers.get('x-ratelimit-reset')
    const details: CheckRunsErrorDetails = {
      status: response.status,
    }
    if (remaining !== null) {
      details.rateLimitRemaining = parseInt(remaining, 10)
    }
    if (reset !== null) {
      details.rateLimitReset = new Date(parseInt(reset, 10) * 1000)
    }
    let errorMessage = `GitHub API error: ${response.status}${
      response.statusText ? ` ${response.statusText}` : ''
    }`
    try {
      const body = await response.json() as {
        message?: string
        documentation_url?: string
      }
      if (body.message) {
        errorMessage = `GitHub API error: ${body.message}`
      }
      if (body.documentation_url) {
        details.documentationUrl = body.documentation_url
      }
    } catch {
      // Ignore JSON parse errors
    }
    return new CheckRunsApiError(errorMessage, details)
  }

  private toCheckRun(data: GithubCheckRunResponse): CheckRun {
    const validStatuses: CheckRunStatus[] = [
      'queued',
      'in_progress',
      'completed',
      'waiting',
    ]
    const validConclusions: CheckRunConclusion[] = [
      'success',
      'failure',
      'neutral',
      'cancelled',
      'timed_out',
      'action_required',
    ]

    const status = data.status
    if (!validStatuses.includes(status as CheckRunStatus)) {
      throw new CheckRunsApiError(
        `Invalid check run status: ${status}`,
        {},
      )
    }

    const conclusion = data.conclusion
    if (
      conclusion !== null &&
      !validConclusions.includes(conclusion as CheckRunConclusion)
    ) {
      throw new CheckRunsApiError(
        `Invalid check run conclusion: ${conclusion}`,
        {},
      )
    }

    return {
      id: data.id,
      name: data.name,
      headSha: data.head_sha,
      status: status as CheckRunStatus,
      conclusion: conclusion as CheckRunConclusion | undefined,
      title: data.output.title ?? undefined,
      summary: data.output.summary ?? undefined,
      text: data.output.text ?? undefined,
      startedAt: data.started_at ? new Date(data.started_at) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
    }
  }

  private toGithubAnnotation(annotation: Annotation): GithubAnnotation {
    return {
      path: annotation.path,
      start_line: annotation.startLine,
      end_line: annotation.endLine,
      annotation_level: annotation.level,
      message: annotation.message,
      title: annotation.title,
      raw_details: annotation.rawDetails,
    }
  }
}
