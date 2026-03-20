/**
 * Example: API Processor
 *
 * This example demonstrates how to use `Source` to process a list of API endpoints with error handling and concurrency control. It also shows how to use `Task` to manage a resource (like an API connection) with proper acquisition and release.
 * Key features:
 * - Create a stream of API endpoints and process them concurrently
 * - Handle errors gracefully without stopping the entire stream
 * - Use `Task` to manage resource acquisition and release with retry and timeout logic
 *
 * Run with:
 * ```
deno run -A packages/anabranch/examples/api_processor.ts
 * ```
 */
import { Source, Task } from '../index.ts'

interface ApiResponse {
  userId: number
  id: number
  title: string
  completed: boolean
}

const urls = [
  'https://jsonplaceholder.typicode.com/todos/1',
  'https://jsonplaceholder.typicode.com/todos/2',
  'https://jsonplaceholder.typicode.com/todos/invalid',
  'https://jsonplaceholder.typicode.com/todos/4',
  'https://jsonplaceholder.typicode.com/todos/5',
]

const stream = Source.fromArray(urls)
  .withConcurrency(3)
  .map<ApiResponse, Error>(
    async (url) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return (await response.json()) as ApiResponse
    },
  )
  .take(4)

console.log('API results with error handling:')
for await (const result of stream) {
  if (result.type === 'success') {
    console.log(`  [${result.value.id}] ${result.value.title}`)
  } else {
    console.error(`  Error: ${result.error.message}`)
  }
}

const task = Task.acquireRelease({
  acquire: () =>
    new Promise<string>((resolve) => {
      console.log('Connecting to API...')
      setTimeout(() => resolve('connection-123'), 50)
    }),
  release: (conn) => {
    console.log(`Disconnecting ${conn}...`)
    return Promise.resolve()
  },
  use: (conn) =>
    Task.of(() =>
      new Promise<string>((resolve) => {
        console.log(`Using connection ${conn}...`)
        setTimeout(() => resolve('result'), 100)
      })
    )
      .retry({ attempts: 3, delay: (i) => 50 * i })
      .timeout(5000, new Error('Task timed out')),
})

const result = await task.result()
if (result.type === 'success') {
  console.log(`\nTask result: ${result.value}`)
} else {
  console.error(`\nTask error: ${result.error}`)
}
