#!/usr/bin/env -S deno run -A

import { Task } from "../packages/anabranch/index.ts";

await main();

async function main(): Promise<void> {
  const packages = parseArgs([...Deno.args]);

  if (packages.length === 0) {
    console.log("Usage: deno run -A build-npm.ts [-p=package] ...");
    console.log("       deno run -A build-npm.ts -p=fs -p=db");
    console.log(
      "Options: -p= (can specify multiple, defaults to all packages with build_npm.ts)",
    );
    Deno.exit(1);
  }

  console.log(`Building ${packages.length} package(s): ${packages.join(", ")}`);

  await Task.all(packages.map((pkg) => Task.of(() => buildPackage(pkg)))).run();

  console.log("\nAll packages built successfully!");
}

async function buildPackage(pkg: string): Promise<void> {
  console.log(`Building ${pkg}...`);
  const proc = await new Deno.Command("deno", {
    args: ["run", "-A", `./packages/${pkg}/build_npm.ts`],
  }).output();

  if (!proc.success) {
    console.error(`Failed to build ${pkg}`);
    console.error(new TextDecoder().decode(proc.stderr));
    Deno.exit(1);
  }
  console.log(`  ${pkg} built successfully`);
}

function parseArgs(args: string[]): string[] {
  const pkgs = args
    .filter((a) => a.startsWith("-p="))
    .map((a) => a.slice(3));

  if (pkgs.length > 0) {
    return pkgs;
  }

  return getAllBuildablePackages();
}

function getAllBuildablePackages(): string[] {
  return [
    "anabranch",
    "queue",
    "queue-redis",
    "queue-rabbitmq",
    "db-mysql",
    "db-sqlite",
    "db-postgres",
    "web-client",
    "broken-link-checker",
    "fs",
    "db",
    "storage",
    "storage-browser",
    "storage-s3",
    "storage-gcs",
  ];
}
