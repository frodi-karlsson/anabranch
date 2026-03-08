import { assertEquals } from "@std/assert";
import { createMemory, Storage } from "./index.ts";

Deno.test("Storage - should put and get string content", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  await storage.put("test.txt", "Hello, World!").run();
  const object = await storage.get("test.txt").run();
  const text = await new Response(object.body).text();

  assertEquals(text, "Hello, World!");
  assertEquals(object.metadata.key, "test.txt");
  assertEquals(object.metadata.size, 13);

  await connector.end();
});

Deno.test("Storage - should put and get Uint8Array content", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  await storage.put("data.bin", bytes).run();
  const object = await storage.get("data.bin").run();

  const result = await new Response(object.body).arrayBuffer();
  assertEquals(new Uint8Array(result), bytes);

  await connector.end();
});

Deno.test("Storage - should list objects with prefix using Source", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  await storage.put("users/a.txt", "a").run();
  await storage.put("users/b.txt", "b").run();
  await storage.put("other.txt", "other").run();

  const { successes } = await storage.list("users/").partition();

  assertEquals(successes.length, 2);
  assertEquals(successes[0].key, "users/a.txt");
  assertEquals(successes[1].key, "users/b.txt");

  await connector.end();
});

Deno.test("Storage - should throw StorageObjectNotFound when getting deleted object", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  await storage.put("delete-me.txt", "content").run();
  await storage.delete("delete-me.txt").run();

  try {
    await storage.get("delete-me.txt").run();
    throw new Error("Expected StorageObjectNotFound");
  } catch (e) {
    assertEquals((e as Error).name, "StorageObjectNotFound");
  }

  await connector.end();
});

Deno.test("Storage - should head object metadata", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  await storage.put("meta.txt", "content", { contentType: "text/plain" }).run();
  const metadata = await storage.head("meta.txt").run();

  assertEquals(metadata.key, "meta.txt");
  assertEquals(metadata.size, 7);
  assertEquals(metadata.contentType, "text/plain");

  await connector.end();
});

Deno.test("Storage - should throw StorageObjectNotFound for missing key", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  try {
    await storage.get("missing.txt").run();
    throw new Error("Expected StorageObjectNotFound");
  } catch (e) {
    assertEquals((e as Error).name, "StorageObjectNotFound");
  }

  await connector.end();
});

Deno.test("Storage - should collect list results with partition", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  await storage.put("a.txt", "a").run();
  await storage.put("b.txt", "b").run();

  const { successes, errors } = await storage.list("")
    .partition();

  assertEquals(successes.length, 2);
  assertEquals(errors.length, 0);

  await connector.end();
});

Deno.test("Storage - should close and end connector properly", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  await storage.close().run();
  await connector.end();
});

Deno.test("Storage - should throw StoragePresignNotSupported for memory adapter", async () => {
  const connector = createMemory();
  const storage = await Storage.connect(connector).run();

  const result = await storage
    .presign("test.txt", { method: "GET", expiresIn: 3600 })
    .result();

  assertEquals(result.type, "error");
  assertEquals(
    (result as { error: Error }).error.name,
    "StoragePresignNotSupported",
  );

  await connector.end();
});
