import { glob } from "@anabranch/fs";
import { resolve } from "node:path";

await main();

async function main(): Promise<void> {
  console.log("Discovering packages...");
  const packagesDir = resolve(Deno.cwd(), "packages");
  const packages: PackageMetadata[] = [];

  const entries = await glob(packagesDir, "*/metadata.json").collect();

  for (const entry of entries) {
    const content = await Deno.readTextFile(entry.path);
    const metadata = JSON.parse(content) as PackageMetadata;
    packages.push(metadata);
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Found ${packages.length} packages`);
  for (const pkg of packages) {
    console.log(`  - ${pkg.name}`);
  }

  const mdTable = generateMarkdownTable(packages);
  const htmlList = generateHtmlList(packages);

  console.log("\nUpdating README.md...");
  await injectContent("./README.md", mdTable);

  console.log("Updating docs-src/index.html...");
  await injectContent("./docs-src/index.html", htmlList);

  console.log("\nSync complete!");

  await formatGeneratedFiles();

  await updateBuildScripts(packages);
}

function generateMarkdownTable(packages: PackageMetadata[]): string {
  let md = `| Package | Description | JSR | npm |\n`;
  md += `| --- | --- | --- | --- |\n`;

  for (const pkg of packages) {
    const jsr =
      `[![](https://jsr.io/badges/@anabranch/${pkg.name})](https://jsr.io/@anabranch/${pkg.name})`;
    const npmPkgName = pkg.name === "anabranch"
      ? "anabranch"
      : `@anabranch/${pkg.name}`;
    const npm =
      `[![](https://img.shields.io/npm/v/${npmPkgName}.svg)](https://www.npmjs.com/package/${npmPkgName})`;

    md +=
      `| [${pkg.name}](./packages/${pkg.name}) | ${pkg.description} | ${jsr} | ${npm} |\n`;
  }

  return md.trim();
}

function generateHtmlList(packages: PackageMetadata[]): string {
  const items = packages.map((pkg) => {
    const npmPkgName = pkg.name === "anabranch"
      ? "anabranch"
      : `@anabranch/${pkg.name}`;
    const bundleUrl = `https://bundlejs.com/?q=${
      encodeURIComponent(npmPkgName)
    }`;
    const badgeUrl = `https://deno.bundlejs.com/?q=${
      encodeURIComponent(npmPkgName)
    }&badge=minified&badge-style=flat`;

    let html = `      <li>\n`;
    html += `        <a href="./${pkg.name}/">${pkg.name}</a>\n`;
    html +=
      `        <div class="description">\n          ${pkg.description}\n        </div>\n`;
    html += `        <div class="badges">\n`;
    html +=
      `          <a href="https://jsr.io/@anabranch/${pkg.name}" class="badge badge-jsr">JSR</a>\n`;
    html +=
      `          <a href="https://www.npmjs.com/package/${npmPkgName}" class="badge badge-npm">npm</a>\n`;
    html +=
      `          <span class="bundle"><a href="${bundleUrl}"><img src="${badgeUrl}" alt="bundle size"></a></span>\n`;
    html += `        </div>\n`;
    html += `      </li>`;
    return html;
  });

  return items.join("\n");
}

async function injectContent(filePath: string, content: string): Promise<void> {
  const fileContent = await Deno.readTextFile(filePath);
  const startMarker = "<!-- PACKAGES START -->";
  const endMarker = "<!-- PACKAGES END -->";

  const startIndex = fileContent.indexOf(startMarker);
  const endIndex = fileContent.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    console.error(`Could not find markers in ${filePath}`);
    return;
  }

  const before = fileContent.slice(0, startIndex + startMarker.length);
  const after = fileContent.slice(endIndex);

  const newContent = `${before}\n${content}\n${after}`;
  await Deno.writeTextFile(filePath, newContent);
  console.log(`  Updated ${filePath}`);
}

async function updateBuildScripts(packages: PackageMetadata[]): Promise<void> {
  for (const pkg of packages) {
    const buildPath = resolve(Deno.cwd(), "packages", pkg.name, "build_npm.ts");

    if (!existsSync(buildPath)) {
      continue;
    }

    let content = await Deno.readTextFile(buildPath);
    const descRegex = /description:\s*"TODO: Add description"/;
    const newDesc = `description: "${pkg.description}"`;

    if (descRegex.test(content)) {
      content = content.replace(descRegex, newDesc);
      await Deno.writeTextFile(buildPath, content);
      console.log(`  Updated description in ${pkg.name}/build_npm.ts`);
    }
  }
}

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

async function formatGeneratedFiles(): Promise<void> {
  console.log("Formatting generated files...");
  const proc = await new Deno.Command("deno", {
    args: ["fmt", "./README.md", "./docs-src/index.html"],
  }).output();
  if (!proc.success) {
    console.error("Failed to format files");
  }
}

interface PackageMetadata {
  name: string;
  description: string;
  env?: Record<string, string>;
}
