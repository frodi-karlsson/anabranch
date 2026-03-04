import { AnabranchSource } from "../index.ts";

const dir = Deno.args[0] ?? ".";

const filePaths = (async function* () {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile) {
      yield `${dir}/${entry.name}`;
    }
  }
})();

const stream = AnabranchSource.from(filePaths)
  .withConcurrency(4)
  .map(async (path) => {
    const text = await Deno.readTextFile(path);
    const lines = text.split(/\r?\n/).length;
    return { path, lines, bytes: text.length };
  })
  .filter((info) => info.lines > 0)
  .map((info) => ({
    ...info,
    density: info.bytes / info.lines,
  }))
  .filter((info) => Number.isFinite(info.density));

const summary = await stream.fold(
  (acc, info) => {
    acc.count += 1;
    acc.totalLines += info.lines;
    acc.totalBytes += info.bytes;
    acc.maxDensity = Math.max(acc.maxDensity, info.density);
    return acc;
  },
  { count: 0, totalLines: 0, totalBytes: 0, maxDensity: 0 },
);

console.log(
  `files=${summary.count} lines=${summary.totalLines} bytes=${summary.totalBytes} maxDensity=${
    summary.maxDensity.toFixed(2)
  }`,
);
