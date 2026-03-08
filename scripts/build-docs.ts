#!/usr/bin/env -S deno run -A

import { Task } from "../packages/anabranch/index.ts";

await main();

async function main(): Promise<void> {
  const packages = parseArgs([...Deno.args]);

  if (packages.length === 0) {
    console.log("Usage: deno run -A build-docs.ts [-p=package] ...");
    console.log("       deno run -A build-docs.ts -p=fs -p=db");
    console.log(
      "Options: -p= (can specify multiple, defaults to all packages)",
    );
    Deno.exit(1);
  }

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

function parseArgs(args: string[]): string[] {
  const pkgs = args
    .filter((a) => a.startsWith("-p="))
    .map((a) => a.slice(3));

  if (pkgs.length > 0) {
    return pkgs;
  }

  return getAllPackages();
}

function getAllPackages(): string[] {
  return [
    "anabranch",
    "web-client",
    "broken-link-checker",
    "fs",
    "db",
    "db-postgres",
    "db-sqlite",
    "db-mysql",
    "queue",
    "queue-redis",
    "queue-rabbitmq",
    "storage",
    "storage-browser",
    "storage-s3",
    "storage-gcs",
  ];
}
