# @anabranch/fs

Streaming file-system utilities for the anabranch ecosystem. Multi-value
operations return a `Source` for streaming; single-value operations return a
`Task` for composable error handling.

## Usage

```ts
import { glob, readLines } from '@anabranch/fs'

const { successes, errors } = await glob('./src', '**/*.ts')
  .flatMap(async (entry) => {
    const lines = await readLines(entry.path)
      .filter((line) => line.includes('TODO'))
      .map((line) => ({ path: entry.path, line }))
      .collect()
    return lines
  })
  .partition()

console.log('TODOs found:', successes.length)
for (const error of errors) {
  console.error('Failed:', error)
}
```

## Installation

**Deno (JSR)**

```ts
import { glob } from 'jsr:@anabranch/fs'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/fs
```

## API reference

See [generated documentation](https://frodi-karlsson.github.io/anabranch/fs) for
full API details.
