# @anabranch/check-runs

GitHub Check Runs API client with Task/Stream semantics. Provides a type-safe
interface for creating, updating, and completing GitHub check runs with
automatic annotation batching.

## Usage

```ts
import { CheckRuns, createInMemory } from '@anabranch/check-runs'

// Create a client for testing
const checkRuns = createInMemory()

// Or create a real GitHub client
const checkRuns = CheckRuns.create({
  token: process.env.GITHUB_TOKEN,
  owner: 'my-org',
  repo: 'my-repo',
})

// Create a check run
const run = await checkRuns.create('CI Build', 'abc123def456')
  .run()
  .unwrap()

// Start the check run
await checkRuns.start(run).run()

// Update with output
await checkRuns.update(run, {
  title: 'Build Results',
  summary: 'All tests passed',
  annotations: [
    {
      path: 'src/index.ts',
      startLine: 10,
      endLine: 12,
      level: 'warning',
      message: 'Unused variable',
    },
  ],
}).run()

// Complete with conclusion
await checkRuns.complete(run, 'success', {
  title: 'Build Complete',
  summary: 'All checks passed',
}).run()
```

## API

### `CheckRuns.create(options)`

Creates a GitHub Check Runs client. Requires `token`, `owner`, and `repo`.

### `checkRuns.create(name, headSha, options?)`

Creates a new check run and returns a `Task<CheckRun, CheckRunsApiError>`.

### `checkRuns.start(checkRun)`

Marks a check run as in progress. Returns a `Task<CheckRun, CheckRunsError>`.

### `checkRuns.update(checkRun, options)`

Updates a check run's output. Returns a `Task<CheckRun, CheckRunsError>`.

### `checkRuns.complete(checkRun, conclusion, options?)`

Completes a check run with a conclusion. Returns a
`Task<CheckRun, CheckRunsError>`.

### `checkRuns.watch(checkRun, options?)`

Watches a check run until completion. Returns a
`Stream<CheckRun, CheckRunsError>`.

### `createInMemory(options?)`

Creates an in-memory CheckRuns client for testing. Accepts an optional `clock`
function for time control.

## Annotations

Annotations are automatically batched at either 50 items or 5-second intervals
to comply with GitHub API limits. Use `checkRun.annotations` channel to stream
annotations.

## Errors

- `CheckRunsError` - Base error class for all check runs errors
- `CheckRunNotFound` - Check run does not exist
- `CheckRunAlreadyCompleted` - Cannot modify a completed check run
- `CheckRunAlreadyStarted` - Check run is already in progress
- `AnnotationsClosedError` - Cannot push to a closed annotations channel
- `CheckRunsApiError` - GitHub API error
