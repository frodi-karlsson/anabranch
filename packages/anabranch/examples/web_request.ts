import { Source } from '../index.ts'

const urls = Deno.args.length ? Deno.args : [
  'https://jsonplaceholder.typicode.com/todos/1',
  'https://jsonplaceholder.typicode.com/todos/2',
  'https://jsonplaceholder.typicode.com/todos/3',
  'https://jsonplaceholder.typicode.com/todos/4',
]

const { successes, errors } = await Source.from<string, Error>(
  async function* () {
    yield* urls
  },
)
  .withConcurrency(4)
  .map(async (url) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`)
    }
    const data = (await response.json()) as { id: number; title: string }
    return { url, id: data.id, title: data.title }
  })
  .partition()

for (const item of successes) {
  console.log(`${item.id}: ${item.title}`)
}

for (const error of errors) {
  console.error(`Failed: ${error.message}`)
}
