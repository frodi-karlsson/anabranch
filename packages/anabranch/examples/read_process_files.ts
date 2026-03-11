/**
 * Example: Read and Process Files
 *
 * This example demonstrates how to use `Source` to read a stream of file paths from a directory, process each file to extract information (like line count and byte size), and handle errors gracefully. It also shows how to use `withConcurrency` to process multiple files in parallel
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/read_process_files.ts <directory>a
 * ```
 */
import { Source } from '../index.ts'

const dir = Deno.args[0] ?? '.'
// Note: this would be easier with @anabranch/fs!
const filePaths = (async function* () {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile) {
      yield `${dir}/${entry.name}`
    }
  }
})()

await Source.from(filePaths)
  .withConcurrency(4)
  .flatMap(async (path) => {
    const text = await Deno.readTextFile(path)
    const lines = text.split(/\r?\n/).length
    return [
      { path, metric: 'lines', value: lines },
      { path, metric: 'bytes', value: text.length },
    ]
  })
  .tap(({ path, metric, value }) => {
    console.log(`Processed ${path}: ${metric}=${value}`)
  })
  .tapErr((error) => {
    console.error(
      `Failed to process file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  })
  .toArray()
