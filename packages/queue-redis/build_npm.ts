import { build, emptyDir } from '@deno/dnt'
import { resolve } from 'node:path'

const dir = import.meta.dirname!
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`))
const { description } = JSON.parse(
  await Deno.readTextFile(`${dir}/metadata.json`),
)

await emptyDir(`${dir}/npm`)

const queuePath = resolve(dir, '../queue/index.ts')

await build({
  entryPoints: [`${dir}/index.ts`],
  outDir: `${dir}/npm`,
  shims: { deno: false },
  compilerOptions: {
    lib: ['ESNext'],
  },
  scriptModule: false,
  test: false,
  package: {
    name: '@anabranch/queue-redis',
    version,
    description,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/frodi-karlsson/anabranch.git',
    },
    bugs: {
      url: 'https://github.com/frodi-karlsson/anabranch/issues',
    },
    dependencies: {
      '@anabranch/queue': '^0',
      ioredis: '^5',
    },
    devDependencies: {
      '@types/node': '^24',
    },
  },
  mappings: {
    [new URL(`file://${queuePath}`).href]: {
      name: '@anabranch/queue',
      version: '^0',
    },
  },
  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`)
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`)
  },
})
