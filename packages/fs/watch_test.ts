import { assertEquals } from "@std/assert";
import { watch } from "./watch.ts";

Deno.test({
  name: "watch - should emit a create event when a file is added",
  permissions: { read: true, write: true, sys: ["osRelease"] },
  async fn() {
    const dir = await Deno.makeTempDir();
    try {
      const collecting = watch(dir).take(1).toArray();

      // Give the watcher time to initialise before creating the file
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      await Deno.writeTextFile(`${dir}/test.txt`, "hello");

      const results = await collecting;
      assertEquals(results.length, 1);
      assertEquals(results[0].type, "success");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "watch - should stop cleanly when take limit is reached",
  permissions: { read: true, write: true, sys: ["osRelease"] },
  async fn() {
    const dir = await Deno.makeTempDir();
    try {
      // take(0) breaks on the first event; write a file to trigger it
      const collecting = watch(dir).take(0).toArray();

      await new Promise<void>((r) => setTimeout(r, 50));
      await Deno.writeTextFile(`${dir}/trigger.txt`, "");

      const results = await collecting;
      assertEquals(results, []);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
