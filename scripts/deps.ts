#!/usr/bin/env -S deno run -A
/**
 * scripts/deps.ts
 *
 * Derives the inter-package dependency graph by scanning packages/../deno.json.
 * A package is a sibling dependency if its imports object has a key matching
 * "@anabranch/<n>" — the same scope used in the workspace.
 *
 * Usage (as a module):
 *   import { getDownstream, loadGraph } from './deps.ts'
 *
 * Usage (as a script, prints the full graph):
 *   deno run -A scripts/deps.ts
 */

import { getAllPackages } from './utils.ts'

const SCOPE = '@anabranch/'

export interface PackageMeta {
  name: string   // e.g. "db-postgres"
  deps: string[] // sibling package names this package imports, e.g. ["db"]
}

export async function loadGraph(): Promise<PackageMeta[]> {
  const repoRoot = Deno.cwd()
  const pkgNames = await getAllPackages().collect()

  return await Promise.all(
    pkgNames.map(async (pkgName) => {
      const path = `${repoRoot}/packages/${pkgName}/deno.json`
      const data = JSON.parse(await Deno.readTextFile(path))
      const imports = (data.imports ?? {}) as Record<string, string>

      // Keys like "@anabranch/db" -> dep name "db"
      const deps = Object.keys(imports)
        .filter((k) => k.startsWith(SCOPE))
        .map((k) => k.slice(SCOPE.length))

      return { name: pkgName, deps }
    }),
  )
}

/**
 * Returns the names of all packages that directly depend on `upstream`.
 */
export async function getDownstream(upstream: string): Promise<string[]> {
  const graph = await loadGraph()
  return graph
    .filter((pkg) => pkg.deps.includes(upstream))
    .map((pkg) => pkg.name)
}

// --- CLI: print full graph ---
if (import.meta.main) {
  const graph = await loadGraph()
  console.log('Package dependency graph:\n')
  for (const pkg of graph.sort((a, b) => a.name.localeCompare(b.name))) {
    if (pkg.deps.length === 0) continue
    console.log(`  ${pkg.name}`)
    for (const dep of pkg.deps) console.log(`    <- ${dep}`)
  }
}