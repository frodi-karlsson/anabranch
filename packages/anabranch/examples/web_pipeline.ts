/**
 * Example: Web Pipeline
 *
 * This example demonstrates how to use `Source` to create a pipeline that fetches data from multiple URLs, processes the responses, and handles errors gracefully. It shows how to use various operators to transform the data, filter results, and recover from errors without stopping the entire pipeline.
 *
 * Key features:
 * - Create a stream of URLs and fetch data from them concurrently
 * - Process the fetched data with mapping and filtering
 * - Use `recover` to handle errors and provide fallback values
 * - Use `tap` to log intermediate results for debugging
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/web_pipeline.ts
 * ```
 */
import { Source } from '../index.ts'

const urls = [
  'https://jsonplaceholder.typicode.com/todos/1',
  'https://jsonplaceholder.typicode.com/todos/2',
  'https://jsonplaceholder.typicode.com/todos/3',
  'https://jsonplaceholder.typicode.com/todos/4',
]

await Source.fromArray(urls)
  .withConcurrency(4)
  .map<{ url: string; id: number; title: string }, Error>(
    async (url) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`)
      }
      const data = (await response.json()) as { id: number; title: string }
      return { url, id: data.id, title: data.title }
    },
  )
  .filter((item) => item.id % 2 === 0)
  .flatMap((item) => [item, { ...item, title: item.title.toUpperCase() }])
  .map((item) => ({
    ...item,
    slug: item.title.toLowerCase().replace(/\s+/g, '-'),
  }))
  .recover((error) => ({
    url: 'error',
    id: -1,
    title: error.message,
    slug: 'error',
  }))
  .tap((item) =>
    console.log('[ITEM]', `${item.id}: ${item.title} at ${item.url}`)
  )
  .toArray()
