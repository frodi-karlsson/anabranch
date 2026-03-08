#!/usr/bin/env -S deno run -A

import { Task } from "../packages/anabranch/index.ts";
import { parsePackageArgs } from "./utils.ts";

await main();

async function main(): Promise<void> {
  const packages = await parsePackageArgs([...Deno.args]);

  console.log(
    `Generating docs for ${packages.length} package(s): ${packages.join(", ")}`,
  );

  await Task.all(packages.map((pkg) => Task.of(() => buildDocs(pkg)))).run();

  console.log("\nCopying index.html...");
  await copyIndexHtml();

  console.log("\nAll docs generated successfully!");
}

async function buildDocs(pkg: string): Promise<void> {
  console.log(`Generating docs for ${pkg}...`);
  const outDir = `docs/${pkg}`;
  const sourceFile = `./packages/${pkg}/index.ts`;

  await Deno.mkdir(outDir, { recursive: true });

  const proc = await new Deno.Command("deno", {
    args: ["doc", "--html", `--name=${pkg}`, `--output=${outDir}`, sourceFile],
  }).output();

  if (!proc.success) {
    console.error(`Failed to generate docs for ${pkg}`);
    console.error(new TextDecoder().decode(proc.stderr));
    Deno.exit(1);
  }

  console.log(`  ${pkg} docs generated`);
}

async function copyIndexHtml(): Promise<void> {
  const proc = await new Deno.Command("cp", {
    args: ["docs-src/index.html", "docs/index.html"],
  }).output();
  if (!proc.success) {
    console.error("Failed to copy index.html");
  }
}
