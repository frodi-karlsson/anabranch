import { Stream } from '@anabranch/anabranch'
import { glob, readTextFile } from '@anabranch/fs'
import { resolve } from 'node:path'

export interface PackageMetadata {
  name: string
  description: string
  version?: string
  env?: Record<string, string>
  service?: ServiceConfig
}

export interface ServiceConfig {
  name: string
  image: string
  env?: Record<string, string>
  ports: string[]
  args?: string[]
  dockerOptions?: string[]
  probe?: ProbeConfig
}

export interface ProbeConfig {
  type: 'exec' | 'http'
  command?: string[]
  url?: string
  delay?: number
}

export function getAllPackages(): Stream<string, unknown> {
  return glob(resolve(Deno.cwd(), 'packages'), '*/')
    .map((entry) => entry.path.split('/').pop())
    .filter((v): v is string => v !== undefined)
}

export function loadAllMetadata(): Stream<PackageMetadata, unknown> {
  return glob(resolve(Deno.cwd(), 'packages'), '*/metadata.json')
    .withConcurrency(4)
    .map(async (entry) => {
      const content = await readTextFile(entry.path).run()
      return JSON.parse(content) as PackageMetadata
    })
}

export async function loadMetadataWithServices(
  requestedPackages?: string[],
): Promise<{
  packages: PackageMetadata[]
  services: ServiceConfig[]
}> {
  const packages = await loadAllMetadata().collect()
  packages.sort((a, b) => a.name.localeCompare(b.name))

  const serviceMap = new Map<string, ServiceConfig>()
  const packagesWithTests: PackageMetadata[] = []

  const filteredPackages = requestedPackages
    ? packages.filter((pkg) => requestedPackages.includes(pkg.name))
    : packages

  for (const pkg of filteredPackages) {
    if (pkg.service) {
      packagesWithTests.push(pkg)
      if (!serviceMap.has(pkg.service.name)) {
        serviceMap.set(pkg.service.name, pkg.service)
      }
    }
  }

  return {
    packages: packagesWithTests,
    services: Array.from(serviceMap.values()),
  }
}

export interface BumpSpec {
  package: string
  type: 'major' | 'minor' | 'patch'
}

export async function parseBumpArgs(
  args: string[],
): Promise<{ specs: BumpSpec[]; dryRun: boolean }> {
  const dryRun = args.includes('--dry-run')
  const remaining = dryRun ? args.filter((a) => a !== '--dry-run') : args
  const specs: BumpSpec[] = []

  for (const arg of remaining) {
    if (!arg.startsWith('-p=')) continue
    const val = arg.slice(3)
    const colonIdx = val.lastIndexOf(':')

    let type: BumpSpec['type'] = 'patch'
    if (colonIdx !== -1) {
      const typeChar = val.slice(colonIdx + 1)
      if (typeChar === 'M' || typeChar === 'major') type = 'major'
      else if (typeChar === 'm' || typeChar === 'minor') type = 'minor'
    }

    specs.push({
      package: colonIdx === -1 ? val : val.slice(0, colonIdx),
      type,
    })
  }

  if (specs.length === 0) {
    const allPkgs = await getAllPackages().collect()
    return {
      specs: allPkgs.map((p) => ({ package: p, type: 'patch' as const })),
      dryRun,
    }
  }

  return { specs, dryRun }
}

export async function parsePackageArgs(args: string[]): Promise<string[]> {
  const pkgs = args.filter((a) => a.startsWith('-p=')).map((a) => a.slice(3))

  if (pkgs.length > 0) {
    return Promise.resolve(pkgs)
  }

  return await getAllPackages().collect()
}

export function bumpVersion(current: string, type: BumpSpec['type']): string {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

export async function runGit(...args: string[]): Promise<void> {
  const proc = new Deno.Command('git', { args })
  await proc.output()
}

export function log(dryRun: boolean, ...msg: unknown[]): void {
  console.log(dryRun ? '[DRY-RUN] ' : '', ...msg)
}
