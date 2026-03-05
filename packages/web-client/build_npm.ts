import { build, emptyDir } from "@deno/dnt";

const dir = import.meta.dirname!;
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`));

await emptyDir(`${dir}/npm`);

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
    name: "@anabranch/web-client",
    version,
    description: "Modern HTTP client with retries and error handling",
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
    },
  },
  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`);
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`);
  },
});
