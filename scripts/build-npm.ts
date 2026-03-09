#!/usr/bin/env -S deno run -A

import { Task } from '../packages/anabranch/index.ts'
import { parsePackageArgs } from './utils.ts'

await main()

async function main(): Promise<void> {
  const packages = await parsePackageArgs([...Deno.args])

  console.log(`Building ${packages.length} package(s): ${packages.join(', ')}`)

  await Task.all(packages.map((pkg) => Task.of(() => buildPackage(pkg)))).run()

  console.log('\nAll packages built successfully!')
}

async function buildPackage(pkg: string): Promise<void> {
  console.log(`Building ${pkg}...`)
  const proc = await new Deno.Command('deno', {
    args: ['run', '-A', `./packages/${pkg}/build_npm.ts`],
  }).output()

  if (!proc.success) {
    console.error(`Failed to build ${pkg}`)
    console.error(new TextDecoder().decode(proc.stderr))
    Deno.exit(1)
  }
  console.log(`  ${pkg} built successfully`)
}
