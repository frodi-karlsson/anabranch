import { glob, readTextFile } from '../index.ts'

const root = Deno.args[0] ?? '.'

const { successes, errors } = await glob(root, '**/*.{ts,js,json,md}')
  .withConcurrency(8)
  .filter((entry) =>
    entry.isFile &&
    ['/node_modules/', 'package-lock.json'].every((exclude) =>
      !entry.path.includes(exclude)
    )
  )
  .map(async (entry) => {
    const content = await readTextFile(entry.path).run()
    return {
      path: entry.path,
      bytes: content.length,
      lines: content.split(/\r?\n/).length,
    }
  })
  .partition()

successes.sort((a, b) => b.bytes - a.bytes)

console.log('Largest files:')
for (const { path, bytes, lines } of successes.slice(0, 10)) {
  console.log(`  ${bytes.toLocaleString()} bytes / ${lines} lines — ${path}`)
}

if (errors.length > 0) {
  console.error(`\n${errors.length} files could not be read:`)
  for (const error of errors) {
    console.error(`  ${error}`)
  }
}
