import { assertEquals } from "@std/assert";
import { writeFile, writeJson, writeTextFile } from "./write.ts";

Deno.test({
  name: "writeTextFile - should write a UTF-8 string to a file",
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir();
    const path = `${dir}/out.txt`;
    try {
      await writeTextFile(path, "hello world").run();
      const content = await Deno.readTextFile(path);
      assertEquals(content, "hello world");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "writeTextFile - should overwrite an existing file",
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir();
    const path = `${dir}/out.txt`;
    await Deno.writeTextFile(path, "old content");
    try {
      await writeTextFile(path, "new content").run();
      const content = await Deno.readTextFile(path);
      assertEquals(content, "new content");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "writeJson - should serialise and write JSON to a file",
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir();
    const path = `${dir}/out.json`;
    try {
      await writeJson(path, { name: "alice", age: 30 }).run();
      const content = await Deno.readTextFile(path);
      assertEquals(JSON.parse(content), { name: "alice", age: 30 });
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "writeFile - should write bytes to a file",
  permissions: { read: true, write: true },
  async fn() {
    const dir = await Deno.makeTempDir();
    const path = `${dir}/data.bin`;
    const data = new Uint8Array([10, 20, 30]);
    try {
      await writeFile(path, data).run();
      const result = await Deno.readFile(path);
      assertEquals(result, data);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
