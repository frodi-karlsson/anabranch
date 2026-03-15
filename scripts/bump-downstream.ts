#!/usr/bin/env -S deno run -A
/**
 * scripts/bump-downstream.ts
 *
 * Accepts one or more tags (e.g. "anabranch@1.0.0 web-client@0.5.0"),
 * discovers all downstream dependents across all of them, deduplicates,
 * and bumps each affected package exactly once.
 *
 * Usage:
 *   deno run -A scripts/bump-downstream.ts <pkg@ver> [<pkg@ver> ...] [--dry-run]
 *
 * Examples:
 *   deno run -A scripts/bump-downstream.ts anabranch@1.0.0
 *   deno run -A scripts/bump-downstream.ts anabranch@1.0.0 web-client@0.5.0 --dry-run
 */

import { bumpVersion, log, runGit } from './utils.ts'
import { getDownstream } from './deps.ts'

async function getLatestTagVersion(pkgName: string): Promise<string | null> {
  const { stdout } = await new Deno.Command('git', {
    args: ['tag', '-l', `${pkgName}@*`],
  }).output()

  const tags = new TextDecoder().decode(stdout).trim().split('\n').filter(
    Boolean,
  )
  if (tags.length === 0) return null

  tags.sort((a, b) => {
    const va = a.split('@')[1]
    const vb = b.split('@')[1]
    return va.localeCompare(vb, undefined, { numeric: true })
  })

  const latest = tags[tags.length - 1]
  let version = latest.split('@')[1]
  if (version.startsWith('v')) version = version.slice(1)
  return version
}

await main()

async function main(): Promise<void> {
  const args = [...Deno.args]
  const dryRun = args.includes('--dry-run')
  const tags = args.filter((a) => !a.startsWith('--') && a.includes('@'))

  if (tags.length === 0) {
    console.error(
      'Usage: bump-downstream.ts <package@version> [<package@version> ...] [--dry-run]',
    )
    Deno.exit(1)
  }

  // Parse each tag into { upstream, version }
  const releases = tags.map((tag) => {
    const atIdx = tag.lastIndexOf('@')
    if (atIdx <= 0) {
      console.error(`Invalid tag format "${tag}", expected "package@version"`)
      Deno.exit(1)
    }
    return { upstream: tag.slice(0, atIdx), version: tag.slice(atIdx + 1) }
  })

  console.log(
    `Processing ${releases.length} release(s): ${
      releases.map((r) => `${r.upstream}@${r.version}`).join(', ')
    }`,
  )

  // Collect dependents for all upstreams, deduplicate.
  // A package may depend on multiple of the released upstreams — bump it once.
  const dependentSet = new Map<string, string[]>() // pkg -> upstreams that triggered it

  for (const { upstream } of releases) {
    const dependents = await getDownstream(upstream)
    for (const dep of dependents) {
      const triggers = dependentSet.get(dep) ?? []
      triggers.push(upstream)
      dependentSet.set(dep, triggers)
    }
  }

  if (dependentSet.size === 0) {
    console.log('No downstream packages found. Done.')
    Deno.exit(0)
  }

  console.log(
    `\nDownstream packages to bump: ${[...dependentSet.keys()].join(', ')}`,
  )

  const repoRoot = Deno.cwd()
  const bumped: { package: string; next: string; triggers: string[] }[] = []

  for (const [pkgName, triggers] of dependentSet) {
    const currentVersion = await getLatestTagVersion(pkgName) ?? '0.0.0'
    const next = bumpVersion(currentVersion, 'patch')

    log(
      dryRun,
      `  ${pkgName}: ${currentVersion} -> ${next} (triggered by: ${
        triggers.join(', ')
      })`,
    )

    if (!dryRun) {
      const path = `${repoRoot}/packages/${pkgName}/deno.json`
      const data = JSON.parse(await Deno.readTextFile(path))
      data.version = next
      await Deno.writeTextFile(path, JSON.stringify(data, null, 2) + '\n')
    }

    bumped.push({ package: pkgName, next, triggers })
  }

  const pkgNames = bumped.map((b) => b.package)
  const upstreamSummary = releases.map((r) => `${r.upstream}@${r.version}`)
    .join(', ')
  const commitMsg = `chore(${pkgNames.join(',')}): bump for ${upstreamSummary}`

  log(dryRun, `\nCommit: ${commitMsg}`)

  if (!dryRun) {
    await runGit('add', ...pkgNames.map((p) => `packages/${p}/deno.json`))
    await runGit('commit', '-m', commitMsg)
    await runGit('push')
  }

  for (const b of bumped) {
    const tag = `${b.package}@${b.next}`
    log(dryRun, `Tag: ${tag}`)
    if (!dryRun) {
      await runGit('tag', tag)
      await runGit('push', 'origin', tag)
    }
  }

  if (dryRun) console.log('\n[DRY-RUN] Re-run without --dry-run to apply.')
}
