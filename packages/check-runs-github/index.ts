/**
 * @anabranch/check-runs-github
 *
 * GitHub API implementation for @anabranch/check-runs.
 *
 * Provides a `createGithub()` factory function that returns a `CheckRuns`
 * instance backed by the GitHub Checks API. Supports creating, updating,
 * and completing check runs with real-time status updates.
 *
 * @example Creating a check run in GitHub Actions
 * ```ts
 * import { createGithub } from "@anabranch/check-runs-github";
 *
 * const checkRuns = createGithub({
 *   token: process.env.GITHUB_TOKEN!,
 *   owner: "my-org",
 *   repo: "my-repo",
 * });
 *
 * const checkRun = await checkRuns
 *   .create("CI", process.env.GITHUB_SHA!)
 *   .run();
 *
 * await checkRuns.start(checkRun).run();
 *
 * // Do work...
 *
 * await checkRuns.complete(checkRun, "success", {
 *   title: "All checks passed",
 *   summary: "Build and tests completed successfully",
 * }).run();
 * ```
 *
 * @module
 */
export { createGithub } from './check-runs-github.ts'
