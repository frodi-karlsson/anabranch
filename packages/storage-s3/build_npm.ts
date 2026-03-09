import { build, emptyDir } from '@deno/dnt'
import { resolve } from 'node:path'

const dir = import.meta.dirname!
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`))
const { description } = JSON.parse(
  await Deno.readTextFile(`${dir}/metadata.json`),
)

await emptyDir(`${dir}/npm`)

const anabranchStoragePath = resolve(dir, '../storage/index.ts')

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
    name: '@anabranch/storage-s3',
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
      anabranch: '^0',
      '@anabranch/storage': '^0',
      '@aws-sdk/client-s3': '^3',
      '@aws-sdk/s3-request-presigner': '^3',
    },
    devDependencies: {
      '@types/node': '^24',
    },
  },
  mappings: {
    [new URL(`file://${anabranchStoragePath}`).href]: {
      name: '@anabranch/storage',
      version: '^0',
    },
  },

  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`)
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`)
  },
})
