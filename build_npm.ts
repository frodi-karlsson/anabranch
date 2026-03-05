import { build, emptyDir } from "@deno/dnt";

const { version } = JSON.parse(await Deno.readTextFile("deno.json"));

await emptyDir("./npm");

await build({
  entryPoints: ["./index.ts"],
  outDir: "./npm",
  shims: { deno: false },
  scriptModule: false,
  test: false,
  package: {
    name: "anabranch",
    version,
    description: "Error-tolerant async streams for TypeScript",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/frodiwe/anabranch.git",
    },
    bugs: {
      url: "https://github.com/frodiwe/anabranch/issues",
    },
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
