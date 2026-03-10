import { build, emptyDir } from '@deno/dnt'
import { resolve } from 'node:path'

const dir = import.meta.dirname!
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`))
const { description } = JSON.parse(
  await Deno.readTextFile(`${dir}/metadata.json`),
)

await emptyDir(`${dir}/npm`)

const eventlogPath = resolve(dir, '../eventlog/index.ts')

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
    name: '@anabranch/eventlog-kafka',
    version,
    description,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/frodi-karlsson/anabranch.git',
    },
    bugs: {
      url: 'https://github.com/frodi-karlsson/anabranch.git',
    },
    dependencies: {
      '@anabranch/eventlog': '^0',
      kafkajs: '^2',
    },
    devDependencies: {
      '@types/node': '^24',
    },
  },
  mappings: {
    [new URL(`file://${eventlogPath}`).href]: {
      name: '@anabranch/eventlog',
      version: '^0',
    },
  },
  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`)
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`)
  },
})
