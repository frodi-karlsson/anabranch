import "npm:fake-indexeddb@^4.0.0/auto";
import { assertEquals } from "@std/assert";
import { Source } from "@anabranch/anabranch";
import { Storage } from "@anabranch/storage";

Deno.test("StorageBrowser - should put and get string content", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({ prefix: "test/", dbName: "test-string" });
  const storage = await Storage.connect(connector).run();

  await storage.put("message.txt", "Hello, Browser!").run();
  const object = await storage.get("message.txt").run();
  const text = await new Response(object.body).text();

  assertEquals(text, "Hello, Browser!");
  assertEquals(object.metadata.key, "message.txt");
  assertEquals(object.metadata.size, 15);

  await connector.end();
});

Deno.test("StorageBrowser - should put and get Uint8Array content", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({ prefix: "test/", dbName: "test-bytes" });
  const storage = await Storage.connect(connector).run();

  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await storage.put("data.bin", bytes).run();
  const object = await storage.get("data.bin").run();

  const result = await new Response(object.body).arrayBuffer();
  assertEquals(new Uint8Array(result), bytes);

  await connector.end();
});

Deno.test("StorageBrowser - should store contentType and custom metadata", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "test/",
    dbName: "test-metadata",
  });
  const storage = await Storage.connect(connector).run();

  await storage.put(
    "document.json",
    '{"name": "test"}',
    { contentType: "application/json", custom: { version: "1" } },
  ).run();

  const metadata = await storage.head("document.json").run();
  assertEquals(metadata.key, "document.json");
  assertEquals(metadata.size, 16);
  assertEquals(metadata.contentType, "application/json");
  assertEquals(metadata.custom?.version, "1");

  await connector.end();
});

Deno.test("StorageBrowser - should list objects with prefix using Source.partition", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "users/",
    dbName: "test-list",
  });
  const storage = await Storage.connect(connector).run();

  await storage.put("users/alice.txt", "alice").run();
  await storage.put("users/bob.txt", "bob").run();
  await storage.put("other.txt", "other").run();

  const { successes } = await storage.list("users/").partition();

  assertEquals(successes.length, 2);
  assertEquals(successes[0].key, "users/alice.txt");
  assertEquals(successes[1].key, "users/bob.txt");

  await connector.end();
});

Deno.test("StorageBrowser - should throw StorageObjectNotFound for missing key", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "test/",
    dbName: "test-notfound",
  });
  const storage = await Storage.connect(connector).run();

  try {
    await storage.get("missing.txt").run();
    throw new Error("Expected StorageObjectNotFound");
  } catch (e) {
    assertEquals((e as Error).name, "StorageObjectNotFound");
  }

  await connector.end();
});

Deno.test("StorageBrowser - should delete object", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({ prefix: "test/", dbName: "test-delete" });
  const storage = await Storage.connect(connector).run();

  await storage.put("to-delete.txt", "delete me").run();
  await storage.delete("to-delete.txt").run();

  try {
    await storage.get("to-delete.txt").run();
    throw new Error("Expected StorageObjectNotFound");
  } catch (e) {
    assertEquals((e as Error).name, "StorageObjectNotFound");
  }

  const { successes } = await storage.list("").partition();
  assertEquals(successes.length, 0);

  await connector.end();
});

Deno.test("StorageBrowser - should collect list results with partition", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "test/",
    dbName: "test-collect",
  });
  const storage = await Storage.connect(connector).run();

  await storage.put("a.txt", "a").run();
  await storage.put("b.txt", "b").run();
  await storage.put("c.txt", "c").run();

  const { successes, errors } = await storage.list("").partition();

  assertEquals(successes.length, 3);
  assertEquals(errors.length, 0);

  await connector.end();
});

Deno.test("StorageBrowser - should process list with Source concurrency", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "items/",
    dbName: "test-concurrency",
  });
  const storage = await Storage.connect(connector).run();

  for (let i = 0; i < 5; i++) {
    await storage.put(`items/${i}.txt`, `content-${i}`).run();
  }

  const sizes: number[] = [];
  await storage.list("items/")
    .withConcurrency(3)
    .map(async (entry) => {
      const meta = await storage.head(entry.key).run();
      return meta.size;
    })
    .tap((size) => {
      sizes.push(size);
    })
    .collect();

  assertEquals(sizes.length, 5);
  assertEquals(sizes.sort(), [9, 9, 9, 9, 9]);

  await connector.end();
});

Deno.test("StorageBrowser - should use Source.from for bulk operations", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "bulk/",
    dbName: "test-bulk",
  });
  const storage = await Storage.connect(connector).run();

  const files = [
    { key: "bulk/file1.txt", content: "First file" },
    { key: "bulk/file2.txt", content: "Second file" },
    { key: "bulk/file3.txt", content: "Third file" },
  ];

  await Source.from<string, never>(async function* () {
    for (const file of files) yield file.key;
  })
    .tap(async (key) => {
      const file = files.find((f) => f.key === key)!;
      await storage.put(key, file.content).run();
    })
    .collect();

  const { successes } = await storage.list("bulk/").partition();
  assertEquals(successes.length, 3);

  await connector.end();
});

Deno.test("StorageBrowser - should handle ReadableStream input", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "test/",
    dbName: "test-stream",
  });
  const storage = await Storage.connect(connector).run();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("Streamed content"));
      controller.close();
    },
  });

  await storage.put("streamed.txt", stream).run();
  const object = await storage.get("streamed.txt").run();
  const text = await new Response(object.body).text();

  assertEquals(text, "Streamed content");

  await connector.end();
});

Deno.test("StorageBrowser - should close and end connector properly", async () => {
  const { createIndexedDB } = await import("./index.ts");
  const connector = createIndexedDB({
    prefix: "test/",
    dbName: "test-close",
  });
  const storage = await Storage.connect(connector).run();

  await storage.put("close-test.txt", "testing close").run();

  await storage.close().run();
  await connector.end();
});
