import { AnabranchSource } from "../index.ts";

const dir = Deno.args[0] ?? ".";
const filePaths = (async function* () {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile) {
      yield `${dir}/${entry.name}`;
    }
  }
})();

const processed = AnabranchSource.from(filePaths)
  .withConcurrency(4)
  .flatMap(async (path) => {
    const text = await Deno.readTextFile(path);
    const lines = text.split(/\r?\n/).length;
    return [
      { path, metric: "lines", value: lines },
      { path, metric: "bytes", value: text.length },
    ];
  });

for await (const result of processed) {
  if (result.type === "success") {
    const { path, metric, value } = result.value;
    console.log(`${path}: ${metric}=${value}`);
  } else {
    const message = result.error instanceof Error
      ? result.error.message
      : String(result.error);
    console.error(`Failed: ${message}`);
  }
}
