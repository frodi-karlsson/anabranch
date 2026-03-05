import { Source } from "../index.ts";

const dir = Deno.args[0] ?? ".";
const filePaths = (async function* () {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile) {
      yield `${dir}/${entry.name}`;
    }
  }
})();

const { successes, errors } = await Source.from(filePaths)
  .withConcurrency(4)
  .flatMap(async (path) => {
    const text = await Deno.readTextFile(path);
    const lines = text.split(/\r?\n/).length;
    return [
      { path, metric: "lines", value: lines },
      { path, metric: "bytes", value: text.length },
    ];
  })
  .partition();

for (const { path, metric, value } of successes) {
  console.log(`${path}: ${metric}=${value}`);
}

for (const error of errors) {
  console.error(
    `Failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}
