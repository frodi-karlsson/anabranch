import { Source } from '../index.ts'

const urls = [
  'https://jsonplaceholder.typicode.com/todos/1',
  'https://jsonplaceholder.typicode.com/todos/2',
  'https://jsonplaceholder.typicode.com/todos/3',
  'https://jsonplaceholder.typicode.com/todos/4',
]

const stream = Source.from<string, Error>(async function* () {
  yield* urls
})
  .withConcurrency(4)
  .map(async (url) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`)
    }
    const data = (await response.json()) as { id: number; title: string }
    return { url, id: data.id, title: data.title }
  })
  .filter((item) => item.id % 2 === 0)
  .flatMap((item) => [item, { ...item, title: item.title.toUpperCase() }])
  .map((item) => ({
    ...item,
    slug: item.title.toLowerCase().replace(/\s+/g, '-'),
  }))
  .recover((error) => ({
    url: 'error',
    id: -1,
    title: error instanceof Error ? error.message : String(error),
    slug: 'error',
  }))

for await (const result of stream.successes()) {
  console.log(`${result.id} ${result.slug}`)
}
