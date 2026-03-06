#!/usr/bin/env -S deno run -A

main();

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

  // Check if package already exists
  if (await Deno.stat(pkgDir).catch(() => null)) {
    console.error(`Package ${pkgName} already exists at ${pkgDir}`);
    Deno.exit(1);
  }

  log(`Bootstrapping @anabranch/${pkgName} in ${pkgDir}`);

  // Create package directory
  log(`mkdir ${pkgDir}`);
  if (!dryRun) Deno.mkdirSync(pkgDir);

  // Create deno.json
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
  };
  log(`write ${pkgDir}/deno.json`);
  if (!dryRun) {
    await Deno.writeTextFile(
      `${pkgDir}/deno.json`,
      JSON.stringify(denoJson, null, 2) + "\n",
    );
  }

  // Create index.ts
  log(`write ${pkgDir}/index.ts`);
  if (!dryRun) {
    await Deno.writeTextFile(`${pkgDir}/index.ts`, "/** @module */\n");
  }

  // Create README.md
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

  // Create build_npm.ts
  const buildNpm = `import { build, emptyDir } from "@deno/dnt";

const dir = import.meta.dirname!;
const { version } = JSON.parse(await Deno.readTextFile(\`\${dir}/deno.json\`));

await emptyDir(\`\${dir}/npm\`);

await build({
  entryPoints: [\`\${dir}/index.ts\`],
  outDir: \`\${dir}/npm\`,
  shims: { deno: false },
  compilerOptions: {
    lib: ["ESNext", "DOM"],
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
      url: "https://github.com/frodi-karlsson/anabranch/issues",
    },
    dependencies: {
      anabranch: "^0",
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

  // Create empty test file
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

  // Compute deno.json changes
  const rootDeno = JSON.parse(
    await Deno.readTextFile(`${repoRoot}/deno.json`),
  );
  const workspaceChange = !rootDeno.workspace.includes(`./packages/${pkgName}`);
  const existingBuildNpm = rootDeno.tasks["build:npm"] || "";
  const buildNpmChanges = existingBuildNpm &&
    !existingBuildNpm.includes(pkgName);
  const buildNpmTaskNew = !rootDeno.tasks[`build:npm:${pkgName}`];
  const docTaskNew = !rootDeno.tasks[`doc:${pkgName}`];

  log(`update ${repoRoot}/deno.json`);
  if (dryRun) {
    if (workspaceChange) {
      log(`  + workspace: "./packages/${pkgName}"`);
    }
    if (buildNpmTaskNew) {
      log(
        `  + task: build:npm:${pkgName} = "deno run -A ./packages/${pkgName}/build_npm.ts"`,
      );
    }
    if (docTaskNew) {
      log(
        `  + task: doc:${pkgName} = "mkdir -p docs/${pkgName} && deno doc --html ..."`,
      );
    }
    if (buildNpmChanges) {
      log(`  ~ task: build:npm (append build step for ${pkgName})`);
    }
  } else {
    if (workspaceChange) {
      rootDeno.workspace.push(`./packages/${pkgName}`);
    }
    // Add build:npm task for this package
    if (buildNpmTaskNew) {
      rootDeno.tasks[`build:npm:${pkgName}`] =
        `deno run -A ./packages/${pkgName}/build_npm.ts`;
    }
    // Add doc task for this package
    if (docTaskNew) {
      rootDeno.tasks[`doc:${pkgName}`] =
        `mkdir -p docs/${pkgName} && deno doc --html --name=${pkgName} --output=docs/${pkgName} ./packages/${pkgName}/index.ts`;
    }
    // Update main build:npm task to include this package
    if (buildNpmChanges) {
      rootDeno.tasks["build:npm"] = existingBuildNpm.replace(
        /(\.\/packages\/[^/]+\/build_npm\.ts)(?!.*\1)/,
        `$1 && deno run -A ./packages/${pkgName}/build_npm.ts`,
      );
    }
    await Deno.writeTextFile(
      `${repoRoot}/deno.json`,
      JSON.stringify(rootDeno, null, 2) + "\n",
    );
  }

  // Update .github/workflows/ci.yml
  const ciPath = `${repoRoot}/.github/workflows/ci.yml`;
  log(`update ${ciPath}`);
  if (dryRun) {
    log(`  + tag trigger: "${pkgName}@*"`);
    log(`  + job: publish-jsr-${pkgName}`);
    log(`  + job: publish-npm-${pkgName}`);
  } else {
    let ciContent = await Deno.readTextFile(ciPath);
    // Add tag trigger
    if (!ciContent.includes(`"${pkgName}@*"`)) {
      ciContent = ciContent.replace(
        /("fs@\*"\s*\n\s*pull_request:)/,
        `  - "${pkgName}@*"\n$1`,
      );
    }
    // Add publish jobs before the closing brace
    const publishJobs = `
  publish-jsr-${pkgName}:
    needs: check
    if: startsWith(github.ref, 'refs/tags/${pkgName}@')
    permissions:
      contents: read
      id-token: write
    uses: ./.github/workflows/publish-jsr.yml
    with:
      package: ${pkgName}

  publish-npm-${pkgName}:
    needs: check
    if: startsWith(github.ref, 'refs/tags/${pkgName}@')
    permissions:
      contents: read
      id-token: write
    uses: ./.github/workflows/publish-npm.yml
    with:
      package: ${pkgName}`;
    ciContent = ciContent.replace(/\n\}$/, `${publishJobs}\n}`);
    await Deno.writeTextFile(ciPath, ciContent);
  }

  // Format created files
  log(`format created files`);
  if (!dryRun) {
    const fmt = new Deno.Command("deno", {
      args: [
        "fmt",
        `${pkgDir}/deno.json`,
        `${pkgDir}/build_npm.ts`,
        `${pkgDir}/${pkgName}_test.ts`,
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
    console.log(`\nPackage @anabranch/${pkgName} bootstrapped!`);
    console.log("Next steps:");
    console.log(`  1. Add functionality to ${pkgName}.ts`);
    console.log(`  2. Write tests in ${pkgName}_test.ts`);
    console.log("  3. Update README.md with usage examples");
    console.log(`  4. Add doc:${pkgName} to the "doc" task in deno.json`);
    console.log(
      `  5. Add publish jobs for ${pkgName} to .github/workflows/ci.yml`,
    );
    console.log("  6. Manually publish to npm");
    console.log("  7. Set up OIDC");
    console.log(
      "  8. Create package in JSR and set up GitHub Actions connector",
    );
    console.log(`  9. Run: deno run -A scripts/bump.ts -p=${pkgName}`);
  }
}
