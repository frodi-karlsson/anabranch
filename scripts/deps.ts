#!/usr/bin/env -S deno run -A
/**
 * scripts/deps.ts
 *
 * Derives the inter-package dependency graph by scanning packages/../deno.json.
 * A package is a sibling dependency if its imports object has a key matching
 * "@anabranch/<n>" — the same scope used in the workspace.
 *
 * Usage (as a module):
 *   import { getDownstream, getTransitiveDownstream, loadGraph } from './deps.ts'
 *
 * Usage (as a script, prints the full graph):
 *   deno run -A scripts/deps.ts
 */

import { getAllPackages } from './utils.ts'

const SCOPE = '@anabranch/'

export interface PackageMeta {
  name: string // e.g. "db-postgres"
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

/**
 * Returns all transitive downstream packages for the given upstreams, in topological order.
 *
 * Packages earlier in the result do not depend on packages later in the result.
 * The upstream packages themselves are excluded from the output.
 */
export async function getTransitiveDownstream(
  upstreams: string[],
): Promise<string[]> {
  const graph = await loadGraph()

  // Build reverse adjacency: upstream -> direct dependents
  const reverseAdj = new Map<string, string[]>()
  for (const pkg of graph) {
    for (const dep of pkg.deps) {
      const list = reverseAdj.get(dep) ?? []
      list.push(pkg.name)
      reverseAdj.set(dep, list)
    }
  }

  // BFS to find full transitive downstream closure
  const upstreamSet = new Set(upstreams)
  const visited = new Set(upstreams)
  const queue = [...upstreams]

  while (queue.length > 0) {
    const u = queue.shift()!
    for (const dependent of reverseAdj.get(u) ?? []) {
      if (!visited.has(dependent)) {
        visited.add(dependent)
        queue.push(dependent)
      }
    }
  }

  const downstreamSet = new Set(
    [...visited].filter((name) => !upstreamSet.has(name)),
  )

  if (downstreamSet.size === 0) return []

  // Topological sort (Kahn's algorithm) on the downstream subgraph
  const pkgMap = new Map(graph.map((p) => [p.name, p]))
  const inDegree = new Map<string, number>()
  const subAdj = new Map<string, string[]>()

  for (const name of downstreamSet) {
    inDegree.set(name, 0)
    subAdj.set(name, [])
  }

  for (const name of downstreamSet) {
    const pkg = pkgMap.get(name)!
    for (const dep of pkg.deps) {
      if (downstreamSet.has(dep)) {
        subAdj.get(dep)!.push(name)
        inDegree.set(name, inDegree.get(name)! + 1)
      }
    }
  }

  const sorted: string[] = []
  const ready = [...downstreamSet].filter((n) => inDegree.get(n) === 0)

  while (ready.length > 0) {
    const u = ready.shift()!
    sorted.push(u)
    for (const dependent of subAdj.get(u)!) {
      const deg = inDegree.get(dependent)! - 1
      inDegree.set(dependent, deg)
      if (deg === 0) ready.push(dependent)
    }
  }

  if (sorted.length !== downstreamSet.size) {
    const stuck = [...downstreamSet].filter((n) => !sorted.includes(n))
    throw new Error(`Cycle detected among packages: ${stuck.join(', ')}`)
  }

  return sorted
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
