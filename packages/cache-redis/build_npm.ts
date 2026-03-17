import { build, emptyDir } from '@deno/dnt'
import { resolve } from 'node:path'

const dir = import.meta.dirname!
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`))
const { description } = JSON.parse(
  await Deno.readTextFile(`${dir}/metadata.json`),
)

await emptyDir(`${dir}/npm`)

const cachePath = resolve(dir, '../cache/index.ts')

await build({
  entryPoints: [`${dir}/index.ts`],
  outDir: `${dir}/npm`,
  shims: { deno: false },
  compilerOptions: {
    lib: ['ESNext'],
    target: 'ES2023',
  },
  scriptModule: false,
  test: false,
  package: {
    name: '@anabranch/cache-redis',
    version,
    sideEffects: false,
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
      '@anabranch/cache': '^0',
      ioredis: '^5',
    },
    devDependencies: {
      '@types/node': '^24',
    },
  },
  mappings: {
    [new URL(`file://${cachePath}`).href]: {
      name: '@anabranch/cache',
      version: '^0',
    },
  },
  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`)
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`)
  },
})
