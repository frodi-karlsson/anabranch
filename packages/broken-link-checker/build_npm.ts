import { build, emptyDir } from "@deno/dnt";
import { resolve } from "node:path";

const dir = import.meta.dirname!;
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`));

await emptyDir(`${dir}/npm`);

const anabranchPath = resolve(dir, "../anabranch/index.ts");
const webClientPath = resolve(dir, "../web-client/index.ts");

await build({
  entryPoints: [`${dir}/index.ts`],
  outDir: `${dir}/npm`,
  shims: { deno: false },
  compilerOptions: {
    lib: ["ESNext", "WebWorker"],
  },
  scriptModule: false,
  test: false,
  package: {
    name: "@anabranch/broken-link-checker",
    version,
    description: "Crawl websites and find broken links",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/frodi-karlsson/anabranch.git",
    },
    bugs: {
      url: "https://github.com/frodi-karlsson/anabranch/issues",
    },
    dependencies: {
      anabranch: "^0",
      "@anabranch/web-client": "^0",
      linkedom: "^0",
    },
  },
  mappings: {
    [new URL(`file://${anabranchPath}`).href]: {
      name: "anabranch",
      version: "^0",
    },
    [new URL(`file://${webClientPath}`).href]: {
      name: "@anabranch/web-client",
      version: "^0",
    },
  },
  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`);
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`);
  },
});
