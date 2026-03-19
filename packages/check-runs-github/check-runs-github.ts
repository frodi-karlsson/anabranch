import { CheckRuns } from '@anabranch/check-runs'
import type { CheckRunsOptions } from '@anabranch/check-runs'
import { GithubClient } from './client.ts'

/**
 * Creates a CheckRuns instance backed by theGitHub API.
 *
 * @example
 * ```ts
 * const checkRuns = createGithub({
 *   token: "ghs_xxx",
 *   owner: "my-org",
 *   repo: "my-repo",
 * });
 *
 * const checkRun = await checkRuns.create("my-check", "abc123").run();
 * await checkRuns.complete(checkRun, "success").run();
 * ```
 */
export function createGithub(options: CheckRunsOptions): CheckRuns {
  const client = GithubClient.create(options)
  return CheckRuns.fromLike(client)
}
