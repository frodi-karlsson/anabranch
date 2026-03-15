import { build, emptyDir } from '@deno/dnt'

const dir = import.meta.dirname!
const { version } = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`))
const { description } = JSON.parse(
  await Deno.readTextFile(`${dir}/metadata.json`),
)

await emptyDir(`${dir}/npm`)

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
    name: '@anabranch/db-mysql',
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
    engines: {
      node: '>=24.0.0',
    },
    devDependencies: {
      '@types/node': '^24',
    },
    dependencies: {
      '@anabranch/db': '^0',
      'mysql2': '^3',
    },
  },
  postBuild() {
    Deno.copyFileSync(`${dir}/../../LICENSE`, `${dir}/npm/LICENSE`)
    Deno.copyFileSync(`${dir}/README.md`, `${dir}/npm/README.md`)
  },
})
