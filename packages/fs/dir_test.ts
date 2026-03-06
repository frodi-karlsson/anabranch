import { assertEquals } from "@std/assert";
import { glob, readDir, walk } from "./dir.ts";

const rwPerms = { read: true, write: true } as const;

async function makeDirTree(root: string): Promise<void> {
  await Deno.mkdir(`${root}/src`, { recursive: true });
  await Deno.mkdir(`${root}/src/sub`, { recursive: true });
  await Deno.writeTextFile(`${root}/README.md`, "");
  await Deno.writeTextFile(`${root}/src/index.ts`, "");
  await Deno.writeTextFile(`${root}/src/util.ts`, "");
  await Deno.writeTextFile(`${root}/src/sub/helper.ts`, "");
}

Deno.test({
  name: "readDir - should list immediate children",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await readDir(dir).toArray();
      const names = entries
        .filter((r) => r.type === "success")
        .map((r) =>
          (r as { type: "success"; value: { name: string } }).value.name
        )
        .sort();
      assertEquals(names, ["README.md", "src"]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "readDir - should set isFile and isDirectory correctly",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await readDir(dir).toArray();
      const byName = Object.fromEntries(
        entries
          .filter((r) => r.type === "success")
          .map((r) => {
            const e = (r as {
              value: { name: string; isFile: boolean; isDirectory: boolean };
            })
              .value;
            return [e.name, e];
          }),
      );
      assertEquals(byName["README.md"].isFile, true);
      assertEquals(byName["README.md"].isDirectory, false);
      assertEquals(byName["src"].isDirectory, true);
      assertEquals(byName["src"].isFile, false);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "walk - should yield all entries recursively",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await walk(dir).toArray();
      const names = entries
        .filter((r) => r.type === "success")
        .map((r) => (r as { value: { name: string } }).value.name)
        .sort();
      assertEquals(names.includes("README.md"), true);
      assertEquals(names.includes("index.ts"), true);
      assertEquals(names.includes("util.ts"), true);
      assertEquals(names.includes("helper.ts"), true);
      assertEquals(names.includes("src"), true);
      assertEquals(names.includes("sub"), true);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "walk - should respect maxDepth",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await walk(dir, { maxDepth: 0 }).toArray();
      const names = entries
        .filter((r) => r.type === "success")
        .map((r) => (r as { value: { name: string } }).value.name)
        .sort();
      assertEquals(names, ["README.md", "src"]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "walk - should filter with match option",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await walk(dir, {
        includeDirs: false,
        match: [/\.ts$/],
      }).toArray();
      const names = entries
        .filter((r) => r.type === "success")
        .map((r) => (r as { value: { name: string } }).value.name)
        .sort();
      assertEquals(names, ["helper.ts", "index.ts", "util.ts"]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "walk - should skip entries matching skip option",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await walk(dir, {
        includeDirs: false,
        skip: [/sub/],
      }).toArray();
      const names = entries
        .filter((r) => r.type === "success")
        .map((r) => (r as { value: { name: string } }).value.name)
        .sort();
      assertEquals(names.includes("helper.ts"), false);
      assertEquals(names.includes("index.ts"), true);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "glob - should find files matching a ** pattern",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await glob(dir, "**/*.ts").toArray();
      const names = entries
        .filter((r) => r.type === "success")
        .map((r) => (r as { value: { name: string } }).value.name)
        .sort();
      assertEquals(names, ["helper.ts", "index.ts", "util.ts"]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "glob - should find only top-level files with * pattern",
  permissions: rwPerms,
  async fn() {
    const dir = await Deno.makeTempDir();
    await makeDirTree(dir);
    try {
      const entries = await glob(dir, "*.md").toArray();
      const names = entries
        .filter((r) => r.type === "success")
        .map((r) => (r as { value: { name: string } }).value.name);
      assertEquals(names, ["README.md"]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
