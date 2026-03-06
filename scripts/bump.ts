#!/usr/bin/env -S deno run -A

main();

async function main(): Promise<void> {
  const { specs, dryRun } = parseArgs([...Deno.args]);

  if (specs.length === 0) {
    console.log("Usage: deno run -A bump.ts [--dry-run] -p=package:type ...");
    console.log("       deno run -A bump.ts -p=fs:patch -p=anabranch:minor");
    console.log("Options: -p= (defaults to patch), :m/:minor, :M/:major");
    Deno.exit(1);
  }

  const repoRoot = Deno.cwd();
  const versions: Record<string, { current: string; next: string }> = {};

  for (const spec of specs) {
    const path = `${repoRoot}/packages/${spec.package}/deno.json`;
    const data = JSON.parse(await Deno.readTextFile(path));
    const next = bumpVersion(data.version, spec.type);
    versions[spec.package] = { current: data.version, next };
    log(
      dryRun,
      `Bump ${spec.package}: ${data.version} -> ${next} (${spec.type})`,
    );
    if (!dryRun) {
      data.version = next;
      await Deno.writeTextFile(path, JSON.stringify(data, null, 2) + "\n");
    }
  }

  const pkgs = specs.map((s) => s.package);
  log(dryRun, `Commit: chore(${pkgs.join(",")}): bump`);

  if (!dryRun) {
    await runGit("add", ...pkgs.map((p) => `packages/${p}/deno.json`));
    await runGit("commit", "-m", `chore(${pkgs.join(",")}): bump`);
    await runGit("push");
  }

  for (const pkg of pkgs) {
    const tag = `${pkg}@${versions[pkg].next}`;
    log(dryRun, `Tag: ${tag}`);
    if (!dryRun) {
      await runGit("tag", tag);
      await runGit("push", "origin", tag);
    }
  }

  if (dryRun) console.log("\n[DRY-RUN] Re-run without --dry-run to apply.");
}

function parseArgs(args: string[]): { specs: BumpSpec[]; dryRun: boolean } {
  const dryRun = args.includes("--dry-run");
  const remaining = dryRun ? args.filter((a) => a !== "--dry-run") : args;
  const specs: BumpSpec[] = [];

  for (const arg of remaining) {
    if (!arg.startsWith("-p=")) continue;
    const val = arg.slice(3);
    const colonIdx = val.lastIndexOf(":");

    let type: BumpSpec["type"] = "patch";
    if (colonIdx !== -1) {
      const typeChar = val.slice(colonIdx + 1);
      if (typeChar === "M" || typeChar === "major") type = "major";
      else if (typeChar === "m" || typeChar === "minor") type = "minor";
    }

    specs.push({
      package: colonIdx === -1 ? val : val.slice(0, colonIdx),
      type,
    });
  }

  return { specs, dryRun };
}

function bumpVersion(current: string, type: BumpSpec["type"]): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function runGit(...args: string[]): Promise<void> {
  const proc = new Deno.Command("git", { args });
  await proc.output();
}

function log(dryRun: boolean, ...msg: unknown[]): void {
  console.log(dryRun ? "[DRY-RUN] " : "", ...msg);
}

interface BumpSpec {
  package: string;
  type: "major" | "minor" | "patch";
}
