import { build, emptyDir } from "@deno/dnt";
import { resolve } from "node:path";

const dir = import.meta.dirname!;
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`));

await emptyDir(`${dir}/npm`);

const anabranchPath = resolve(dir, "../anabranch/index.ts");
const queuePath = resolve(dir, "../queue/index.ts");

await build({
  entryPoints: [`${dir}/index.ts`],
  outDir: `${dir}/npm`,
  shims: { deno: false },
  compilerOptions: {
    lib: ["ESNext", "DOM"],
  },
  scriptModule: false,
  test: false,
  package: {
    name: "@anabranch/queue-redis",
    version,
    description: "Redis adapter for @anabranch/queue",
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
      "@anabranch/queue": "^0",
      ioredis: "^5",
    },
  },
  mappings: {
    [new URL(`file://${anabranchPath}`).href]: {
      name: "anabranch",
      version: "^0",
    },
    [new URL(`file://${queuePath}`).href]: {
      name: "@anabranch/queue",
      version: "^0",
    },
  },
  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`);
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`);
  },
});
