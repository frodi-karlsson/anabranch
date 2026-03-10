import { Task } from '../packages/anabranch/index.ts'
import {
  loadMetadataWithServices,
  type PackageMetadata,
  parsePackageArgs,
  type ServiceConfig,
} from './utils.ts'

await main()

async function main(): Promise<void> {
  const requestedPackages = await parsePackageArgs([...Deno.args])
  const filter = Deno.args.includes('--filter')
    ? Deno.args[Deno.args.indexOf('--filter') + 1]
    : undefined
  const { packages, services } = await loadMetadataWithServices(
    requestedPackages,
  )

  if (packages.length === 0) {
    console.log('No matching packages with integration tests found')
    return
  }

  console.log(`Found ${packages.length} packages with integration tests`)
  for (const pkg of packages) {
    console.log(`  - ${pkg.name}`)
  }

  await startServices(services)

  try {
    await waitForServices(services)

    await runTests(packages, filter)

    console.log('All integration tests passed!')
  } finally {
    await cleanupServices(services)
  }
}

async function startServices(services: ServiceConfig[]): Promise<void> {
  console.log('Cleaning up any existing containers...')
  await Promise.all(
    services.map((s) =>
      new Deno.Command('docker', { args: ['rm', '-f', `anabranch-${s.name}`] })
        .output()
    ),
  )

  await Task.all(
    services.map((service) =>
      Task.of(() => {
        console.log(`Starting ${service.name} container...`)
        const args: string[] = []
        for (const opt of service.dockerOptions ?? []) {
          args.push(opt)
        }
        for (const [key, value] of Object.entries(service.env ?? {})) {
          args.push('-e', `${key}=${value}`)
        }
        for (const port of service.ports) {
          args.push('-p', port)
        }
        args.push(service.image, ...(service.args ?? []))
        const output = new Deno.Command('docker', {
          args: ['run', '-d', '--name', `anabranch-${service.name}`, ...args],
        }).output()
        console.log(`Started ${service.name} container`)
        return output
      }).timeout(
        15_000,
        new Error(`Failed to start ${service.name} container in time`),
      )
    ),
  ).run()
}

async function waitForServices(services: ServiceConfig[]): Promise<void> {
  console.log('Waiting for services to be ready...')
  const probes = services.map((service) => createProbe(service))
  const probeTasks = probes.map((probe) =>
    Task.of(async () => {
      await probe.check()
    })
      .retry({ attempts: 30, delay: probe.delay ?? 1000 })
      .tap(() => console.log(probe.readyMessage))
  )

  await Task.all(probeTasks).timeout(
    45_000,
    new Error('Services did not become ready in time'),
  ).run()
}

async function runTests(
  packages: PackageMetadata[],
  filter?: string,
): Promise<void> {
  for (const pkg of packages) {
    console.log(`Running ${pkg.name} integration tests...`)
    const testPath = `./packages/${pkg.name}/${pkg.name}_test.ts`
    await Task.of(() => runTest(testPath, pkg.env ?? {}, filter)).timeout(
      45_000,
      new Error(`Tests for ${pkg.name} did not complete in time`),
    ).run()
  }
}

async function cleanupServices(services: ServiceConfig[]): Promise<void> {
  console.log('Cleaning up containers...')
  await Promise.all(
    services.map((s) =>
      new Deno.Command('docker', { args: ['rm', '-f', `anabranch-${s.name}`] })
        .output()
    ),
  )
}

function execProbe(container: string, cmd: string[]): Promise<void> {
  return new Deno.Command('docker', { args: ['exec', container, ...cmd] })
    .output().then((output) => {
      if (!output.success) throw new Error(`${container} not ready`)
    })
}

function httpProbe(url: string): Promise<void> {
  return fetch(url).then(async (res) => {
    if (!res.ok) {
      await res.body?.cancel()
      throw new Error('HTTP probe failed')
    }
    await res.body?.cancel()
  })
}

async function runTest(
  file: string,
  additionalEnv: Record<string, string>,
  filter?: string,
): Promise<void> {
  const args = [
    'test',
    '--allow-read',
    '--allow-write',
    '--allow-sys',
    '--allow-env',
    '--allow-net',
  ]
  if (filter) {
    args.push('--filter', filter)
  }
  args.push(file)
  const testProc = await new Deno.Command('deno', {
    args,
    env: { ...Deno.env.toObject(), ...additionalEnv },
  }).output()

  console.log(new TextDecoder().decode(testProc.stdout))
  if (!testProc.success) {
    console.error(new TextDecoder().decode(testProc.stderr))
    Deno.exit(1)
  }
}

function createProbe(
  service: ServiceConfig,
): {
  name: string
  readyMessage: string
  check: () => Promise<void>
  delay?: number
} {
  const probe = service.probe
  if (!probe) {
    return {
      name: service.name,
      readyMessage: `${service.name} is ready!`,
      check: () => Promise.resolve(),
    }
  }

  if (probe.type === 'exec') {
    const cmd = probe.command ?? []
    return {
      name: service.name,
      readyMessage: `${service.name} is ready!`,
      delay: probe.delay,
      check: () => execProbe(`anabranch-${service.name}`, cmd),
    }
  }

  if (probe.type === 'http') {
    const url = probe.url ?? ''
    return {
      name: service.name,
      readyMessage: `${service.name} is ready!`,
      delay: probe.delay,
      check: () => httpProbe(url),
    }
  }

  return {
    name: service.name,
    readyMessage: `${service.name} is ready!`,
    check: () => Promise.resolve(),
  }
}
