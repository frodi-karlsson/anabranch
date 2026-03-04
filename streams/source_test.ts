import { assertEquals } from "@std/assert";
import { AnabranchSource } from "../index.ts";

Deno.test("AnabranchSource.from - should create a stream", async () => {
  const source = (async function* () {
    yield 1;
    yield 2;
  })();
  const stream = AnabranchSource.from<number, never>(source);

  const results = await stream.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "success", value: 2 },
  ]);
});

Deno.test(
  "AnabranchSource.withConcurrency - should clone with updated concurrency",
  async () => {
    const stream = new AnabranchSource<number, string>(async function* () {
      yield 1;
    });
    const withConcurrency = stream.withConcurrency(2);

    const results = await withConcurrency.toArray();

    assertEquals(results, [{ type: "success", value: 1 }]);
  },
);

Deno.test(
  "AnabranchSource.withBufferSize - should clone with updated buffer size",
  async () => {
    const stream = new AnabranchSource<number, string>(async function* () {
      yield 1;
    });
    const withBufferSize = stream.withBufferSize(4);

    const results = await withBufferSize.toArray();

    assertEquals(results, [{ type: "success", value: 1 }]);
  },
);
