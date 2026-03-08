import { build, emptyDir } from "@deno/dnt";
import { resolve } from "node:path";

const dir = import.meta.dirname!;
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`));

await emptyDir(`${dir}/npm`);

const storagePath = resolve(dir, "../storage/index.ts");

await build({
  entryPoints: [`${dir}/index.ts`],
  outDir: `${dir}/npm`,
  shims: { deno: false },
  compilerOptions: {
    lib: ["ESNext"],
  },
  scriptModule: false,
  test: false,
  package: {
    name: "@anabranch/storage-gcs",
    version,
    description: "Google Cloud Storage adapter for the anabranch ecosystem",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/frodi-karlsson/anabranch.git",
    },
    bugs: {
      url: "https://github.com/frodi-karlsson/anabranch.git",
    },
    dependencies: {
      anabranch: "^0",
      "@anabranch/storage": "^0",
      "@google-cloud/storage": "^7",
    },
  },
  mappings: {
    [new URL(`file://${storagePath}`).href]: {
      name: "@anabranch/storage",
      version: "^0",
    },
  },

  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`);
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`);
  },
});
