#!/usr/bin/env -S deno run -A

await main();

async function main(): Promise<void> {
  const args = [...Deno.args];
  const dryRun = args.includes("--dry-run");
  const pkgName = args.find((a) => !a.startsWith("-"));

  if (!pkgName) {
    console.log("Usage: deno run -A bootstrap.ts [--dry-run] <package-name>");
    console.log("       deno run -A bootstrap.ts --dry-run db");
    Deno.exit(1);
  }

  if (!/^[a-z][a-z0-9-]*$/.test(pkgName)) {
    console.error(
      "Package name must be lowercase letters, numbers, and hyphens only.",
    );
    Deno.exit(1);
  }

  const repoRoot = Deno.cwd();
  const pkgDir = `${repoRoot}/packages/${pkgName}`;
  const log = (msg: string) => console.log((dryRun ? "[DRY-RUN] " : "") + msg);

  if (await Deno.stat(pkgDir).catch(() => null)) {
    console.error(`Package ${pkgName} already exists at ${pkgDir}`);
    Deno.exit(1);
  }

  log(`Bootstrapping @anabranch/${pkgName} in ${pkgDir}`);

  log(`mkdir ${pkgDir}`);
  if (!dryRun) Deno.mkdirSync(pkgDir);

  const denoJson = {
    name: `@anabranch/${pkgName}`,
    version: "0.1.0",
    exports: "./index.ts",
    publish: {
      exclude: ["examples/", "build_npm.ts", "npm/"],
    },
    imports: {
      "@anabranch/anabranch": "jsr:@anabranch/anabranch@^0",
      "@deno/dnt": "jsr:@deno/dnt@^0",
      "@std/assert": "jsr:@std/assert@^1",
    },
    mappings: {
      "@anabranch/anabranch": {
        name: "anabranch",
        version: "^0",
      },
    },
  };
  log(`write ${pkgDir}/deno.json`);
  if (!dryRun) {
    await Deno.writeTextFile(
      `${pkgDir}/deno.json`,
      JSON.stringify(denoJson, null, 2) + "\n",
    );
  }

  log(`write ${pkgDir}/metadata.json`);
  if (!dryRun) {
    const metadata = {
      name: pkgName,
      description: "TODO: Add description",
    };
    await Deno.writeTextFile(
      `${pkgDir}/metadata.json`,
      JSON.stringify(metadata, null, 2) + "\n",
    );
  }

  log(`write ${pkgDir}/index.ts`);
  if (!dryRun) {
    await Deno.writeTextFile(`${pkgDir}/index.ts`, "/** @module */\n");
  }

  const readme = `# @anabranch/${pkgName}

TODO: Add description

## Usage

\`\`\`ts
import { } from "@anabranch/${pkgName}";
\`\`\`

## API

###

\`\`\`ts
\`\`\`
`;
  log(`write ${pkgDir}/README.md`);
  if (!dryRun) {
    await Deno.writeTextFile(`${pkgDir}/README.md`, readme);
  }

  const buildNpm = `import { build, emptyDir } from "@deno/dnt";
import { resolve } from "node:path";

const dir = import.meta.dirname!;
const { version } = JSON.parse(await Deno.readTextFile(\`\${dir}/deno.json\`));

await emptyDir(\`\${dir}/npm\`);

const anabranchPath = resolve(dir, "../anabranch/index.ts");

await build({
  entryPoints: [\`\${dir}/index.ts\`],
  outDir: \`\${dir}/npm\`,
  shims: { deno: false },
  compilerOptions: {
    lib: ["ESNext"],
  },
  scriptModule: false,
  test: false,
  package: {
    name: "@anabranch/${pkgName}",
    version,
    description: "TODO: Add description",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/frodi-karlsson/anabranch.git",
    },
    bugs: {
      url: "https://github.com/frodi-karlsson/anabranch.git",
    },
    dependencies: {
      anabranch: "^0",
    },
  },
  mappings: {
    [new URL(\`file://\${anabranchPath}\`).href]: {
      name: "anabranch",
      version: "^0",
    },
  },
  postBuild() {
    Deno.copyFileSync(\`\${dir}/../../LICENSE\`, \`\${dir}/npm/LICENSE\`);
    Deno.copyFileSync(\`\${dir}/README.md\`, \`\${dir}/npm/README.md\`);
  },
});`;
  log(`write ${pkgDir}/build_npm.ts`);
  if (!dryRun) {
    await Deno.writeTextFile(`${pkgDir}/build_npm.ts`, buildNpm);
  }

  log(`write ${pkgDir}/${pkgName}_test.ts`);
  if (!dryRun) {
    await Deno.writeTextFile(
      `${pkgDir}/${pkgName}_test.ts`,
      `import { assertEquals } from "@std/assert";

Deno.test({
  name: "${pkgName} - TODO",
  fn() {
    assertEquals(true, true);
  },
});`,
    );
  }

  const rootDeno = JSON.parse(
    await Deno.readTextFile(`${repoRoot}/deno.json`),
  );
  const workspaceChange = !rootDeno.workspace.includes(`./packages/${pkgName}`);

  log(`update ${repoRoot}/deno.json`);
  if (dryRun) {
    if (workspaceChange) {
      log(`  + workspace: "./packages/${pkgName}"`);
    }
  } else {
    if (workspaceChange) {
      rootDeno.workspace.push(`./packages/${pkgName}`);
      await Deno.writeTextFile(
        `${repoRoot}/deno.json`,
        JSON.stringify(rootDeno, null, 2) + "\n",
      );
    }
  }

  log(`format created files`);
  if (!dryRun) {
    const fmt = new Deno.Command("deno", {
      args: [
        "fmt",
        `${pkgDir}/deno.json`,
        `${pkgDir}/build_npm.ts`,
        `${pkgDir}/${pkgName}_test.ts`,
        `${pkgDir}/metadata.json`,
      ],
    });
    await fmt.output();
  }

  console.log("");
  if (dryRun) {
    console.log(
      "[DRY-RUN] No changes made. Re-run without --dry-run to apply.",
    );
  } else {
    console.log(`Package @anabranch/${pkgName} bootstrapped!`);
    console.log("Next steps:");
    console.log(`  1. Add functionality to ${pkgName}.ts`);
    console.log(`  2. Write tests in ${pkgName}_test.ts`);
    console.log("  3. Update README.md with usage examples");
    console.log("  4. Run: deno run -A scripts/sync-docs.ts");
    console.log("  5. CI is automatic - docs deploy on main, publish on tag");
    console.log("  6. Set up OIDC for npm publishing (see publish-npm.yml)");
    console.log(
      "  7. Create package in JSR and set up GitHub Actions connector",
    );
    console.log(`  8. Run: deno run -A scripts/bump.ts -p=${pkgName}`);
  }
}
