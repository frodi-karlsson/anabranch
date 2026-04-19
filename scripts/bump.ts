#!/usr/bin/env -S deno run -A

import { bumpVersion, log, parseBumpArgs, runGit } from './utils.ts'

await main()

async function main(): Promise<void> {
  const { specs, dryRun } = await parseBumpArgs([...Deno.args])

  if (specs.length === 0) {
    console.log(
      'No packages specified, bumping all packages with patch version.',
    )
  }

  const repoRoot = Deno.cwd()
  const versions: Record<string, { current: string; next: string }> = {}

  for (const spec of specs) {
    const path = `${repoRoot}/packages/${spec.package}/deno.json`
    const data = JSON.parse(await Deno.readTextFile(path))
    const next = bumpVersion(data.version, spec.type)
    versions[spec.package] = { current: data.version, next }
    log(
      dryRun,
      `Bump ${spec.package}: ${data.version} -> ${next} (${spec.type})`,
    )
    if (!dryRun) {
      data.version = next
      await Deno.writeTextFile(path, JSON.stringify(data, null, 2) + '\n')
    }
  }

  const pkgs = specs.map((s) => s.package)
  log(dryRun, `Commit: chore(${pkgs.join(',')}): bump`)

  if (!dryRun) {
    const denoInstall = new Deno.Command('deno', { args: ['install'] })
    await denoInstall.output()
    await runGit(
      'add',
      ...pkgs.map((p) => `packages/${p}/deno.json`),
      'deno.lock',
    )
    await runGit('commit', '-m', `chore(${pkgs.join(',')}): bump`)
    await runGit('push')
  }

  for (const pkg of pkgs) {
    const tag = `${pkg}@${versions[pkg].next}`
    log(dryRun, `Tag: ${tag}`)
    if (!dryRun) {
      await runGit('tag', tag)
      await runGit('push', 'origin', tag)
    }
  }

  if (dryRun) console.log('\n[DRY-RUN] Re-run without --dry-run to apply.')
}
