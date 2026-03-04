import { AnabranchSource } from "../index.ts";

const urls = Deno.args.length ? Deno.args : [
  "https://jsonplaceholder.typicode.com/todos/1",
  "https://jsonplaceholder.typicode.com/todos/2",
  "https://jsonplaceholder.typicode.com/todos/3",
  "https://jsonplaceholder.typicode.com/todos/4",
];

const fetched = AnabranchSource.from(
  async function* () {
    for (const url of urls) {
      yield url;
    }
  }(),
)
  .withConcurrency(4)
  .map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const data = (await response.json()) as { id: number; title: string };
    return { url, id: data.id, title: data.title };
  });

for await (const result of fetched) {
  if (result.type === "success") {
    console.log(`${result.value.id}: ${result.value.title}`);
  } else {
    const message = result.error instanceof Error
      ? result.error.message
      : String(result.error);
    console.error(`Failed: ${message}`);
  }
}
