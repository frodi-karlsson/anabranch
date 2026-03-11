/**
 * Example of using Anabranch to process a stream of file paths, extract information about each file, and produce a summary report. This example demonstrates how to handle errors gracefully while processing files, and how to use various operators to transform and aggregate data.
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/process_and_report.ts <directory>
 * ```
 */
import { Source } from '../index.ts'

const dir = Deno.args[0] ?? '.'

// Note: this would be easier with @anabranch/fs!
// `const filePaths = readDir(dir)`
const filePaths = (async function* () {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile) {
      yield `${dir}/${entry.name}`
    }
  }
})()

const summary = await Source.from(filePaths)
  .withConcurrency(4)
  .map(async (path) => {
    const text = await Deno.readTextFile(path)
    const lines = text.split(/\r?\n/).length
    return { path, lines, bytes: text.length }
  })
  .tapErr((error) => {
    console.error(
      `Failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  })
  .filterErr(() => false)
  .filter((info) => info.lines > 0)
  .map((info) => ({ ...info, density: info.bytes / info.lines }))
  .filter((info) => Number.isFinite(info.density))
  .fold(
    (acc, info) => ({
      count: acc.count + 1,
      totalLines: acc.totalLines + info.lines,
      totalBytes: acc.totalBytes + info.bytes,
      maxDensity: Math.max(acc.maxDensity, info.density),
    }),
    { count: 0, totalLines: 0, totalBytes: 0, maxDensity: 0 },
  )

console.log(
  `files=${summary.count} lines=${summary.totalLines} bytes=${summary.totalBytes} maxDensity=${
    summary.maxDensity.toFixed(2)
  }`,
)
