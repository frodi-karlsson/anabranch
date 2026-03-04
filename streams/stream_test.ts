import { assertEquals, assertRejects } from "@std/assert";
import { type AnabranchResult, AnabranchSource } from "../index.ts";
import { deferred, failure, streamFrom, success } from "../test_utils.ts";

Deno.test("AnabranchStream.toArray - should collect all results", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure("boom"),
    success(2),
  ]);

  const results = await stream.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: "boom" },
    { type: "success", value: 2 },
  ]);
});

Deno.test(
  "AnabranchStream.collect - should return successes when no errors",
  async () => {
    const stream = streamFrom<number, string>([success(1), success(2)]);

    const results = await stream.collect();

    assertEquals(results, [1, 2]);
  },
);

Deno.test(
  "AnabranchStream.collect - should throw aggregate error when errors exist",
  async () => {
    const stream = streamFrom<number, string>([
      success(1),
      failure("nope"),
      success(2),
    ]);

    await assertRejects(
      () => stream.collect(),
      Error,
      "AggregateError: 1 errors",
    );
  },
);

Deno.test(
  "AnabranchStream.successes - should yield only successful values",
  async () => {
    const stream = streamFrom<string, string>([
      success("a"),
      failure("bad"),
      success("b"),
    ]);
    const collected: string[] = [];

    for await (const value of stream.successes()) {
      collected.push(value);
    }

    assertEquals(collected, ["a", "b"]);
  },
);

Deno.test("AnabranchStream.errors - should yield only errors", async () => {
  const stream = streamFrom<string, string>([
    success("a"),
    failure("bad"),
    failure("worse"),
  ]);
  const collected: string[] = [];

  for await (const error of stream.errors()) {
    collected.push(error);
  }

  assertEquals(collected, ["bad", "worse"]);
});

Deno.test("AnabranchStream iterator - should yield all results", async () => {
  const stream = streamFrom<number, string>([success(1), failure("boom")]);
  const collected: AnabranchResult<number, string>[] = [];

  for await (const result of stream) {
    collected.push(result);
  }

  assertEquals(collected, [
    { type: "success", value: 1 },
    { type: "error", error: "boom" },
  ]);
});

Deno.test("AnabranchStream.map - should transform successful values", async () => {
  const stream = streamFrom<number, string>([
    success(2),
    failure("bad"),
    success(3),
  ]);
  const mapped = stream.map((value) => value * 2);

  const results = await mapped.toArray();

  assertEquals(results, [
    { type: "success", value: 4 },
    { type: "error", error: "bad" },
    { type: "success", value: 6 },
  ]);
});

Deno.test("AnabranchStream.flatMap - should expand successes", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure("bad"),
    success(2),
  ]);
  const flattened = stream
    .flatMap((value) => [value, value * 10]);

  const results = await flattened.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "success", value: 10 },
    { type: "error", error: "bad" },
    { type: "success", value: 2 },
    { type: "success", value: 20 },
  ]);
});

Deno.test(
  "AnabranchStream.flatMap - should convert thrown errors into error results",
  async () => {
    const stream = streamFrom<number, Error>([success(1), success(2)]);
    const expectedError = new Error("nope");
    const flattened = stream
      .flatMap((value) => {
        if (value === 2) {
          throw expectedError;
        }
        return [value];
      });

    const results = await flattened.toArray();

    assertEquals(results, [
      { type: "success", value: 1 },
      { type: "error", error: expectedError },
    ]);
  },
);

Deno.test(
  "AnabranchStream.flatMap - should convert iterable errors into error results",
  async () => {
    const stream = streamFrom<number, Error>([success(1)]);
    const expectedError = new Error("bad iterable");
    const flattened = stream
      .flatMap(() =>
        (async function* () {
          yield await Promise.reject(expectedError);
        })()
      );

    const results = await flattened.toArray();

    assertEquals(results, [{ type: "error", error: expectedError }]);
  },
);

Deno.test(
  "AnabranchStream.flatMap - should preserve concurrency settings",
  async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const started = deferred<void>();
    const gates = [
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
    ];
    const stream = new AnabranchSource<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
    }).withConcurrency(2);

    const mapped = stream
      .flatMap((value) => [value * 2 - 1, value * 2])
      .map(async (value) => {
        inFlight += 1;
        maxObserved = Math.max(maxObserved, inFlight);
        if (inFlight === 2) {
          started.resolve();
        }
        await gates[value - 1].promise;
        inFlight -= 1;
        return value;
      });

    const resultsPromise = mapped.toArray();
    await started.promise;

    assertEquals(maxObserved, 2);

    for (const gate of gates) {
      gate.resolve();
    }

    await resultsPromise;
  },
);

Deno.test(
  "AnabranchStream.map - should honor concurrency limit",
  async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const started = deferred<void>();
    const gates = [
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
    ];
    const stream = new AnabranchSource<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
    }).withConcurrency(2);

    const mapped = stream.map(async (value) => {
      inFlight += 1;
      maxObserved = Math.max(maxObserved, inFlight);
      if (inFlight === 2) {
        started.resolve();
      }
      await gates[value - 1].promise;
      inFlight -= 1;
      return value;
    });

    const resultsPromise = mapped.toArray();
    await started.promise;
    assertEquals(maxObserved, 2);

    for (const gate of gates) {
      gate.resolve();
    }

    await resultsPromise;
  },
);

Deno.test(
  "AnabranchStream.map - should preserve order with concurrency 1",
  async () => {
    const stream = new AnabranchSource<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
    }).withConcurrency(1);

    const mapped = stream.map(async (value) => {
      await Promise.resolve();
      return value * 10;
    });

    const results = await mapped.toArray();

    assertEquals(results, [
      { type: "success", value: 10 },
      { type: "success", value: 20 },
      { type: "success", value: 30 },
    ]);
  },
);

Deno.test(
  "AnabranchStream.map - should apply buffer backpressure",
  async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const started = deferred<void>();
    const gate = deferred<void>();
    const stream = new AnabranchSource<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
    }).withConcurrency(3).withBufferSize(2);

    const mapped = stream.map(async (value) => {
      inFlight += 1;
      maxObserved = Math.max(maxObserved, inFlight);
      if (inFlight === 2) {
        started.resolve();
      }
      await gate.promise;
      inFlight -= 1;
      return value;
    });

    const resultsPromise = mapped.toArray();
    await started.promise;
    assertEquals(maxObserved, 2);
    gate.resolve();

    const results = await resultsPromise;
    assertEquals(results.length, 3);
  },
);

Deno.test(
  "AnabranchStream.map - should propagate errors from mapped tasks",
  async () => {
    const expectedError = new Error("map failed");
    const stream = new AnabranchSource<number, Error>(async function* () {
      yield 1;
      yield 2;
    }).withConcurrency(2);

    const mapped = stream.map((value) => {
      if (value === 2) {
        throw expectedError;
      }
      return value;
    });

    const results = await mapped.toArray();

    assertEquals(results, [
      { type: "success", value: 1 },
      { type: "error", error: expectedError },
    ]);
  },
);

Deno.test(
  "AnabranchStream.map - should surface source generator errors",
  async () => {
    const expectedError = new Error("source failed");
    const stream = new AnabranchSource<number, Error>(async function* () {
      yield 1;
      throw expectedError;
    }).withConcurrency(1);

    const mapped = stream.map((value) => value);
    const results = await mapped.toArray();

    assertEquals(
      results.map((result) => result.type).sort(),
      ["error", "success"],
    );
    assertEquals(
      results.find((result) => result.type === "success"),
      { type: "success", value: 1 },
    );
    assertEquals(
      results.find((result) => result.type === "error"),
      { type: "error", error: expectedError },
    );
  },
);

Deno.test(
  "AnabranchStream.map - should emit generator errors before completion",
  async () => {
    const expectedError = new Error("source race");
    const stream = new AnabranchSource<number, Error>(async function* () {
      yield 1;
      await Promise.resolve();
      throw expectedError;
    }).withConcurrency(1);

    const mapped = stream.map((value) => value);
    const results = await mapped.toArray();

    assertEquals(
      results.map((result) => result.type).sort(),
      ["error", "success"],
    );
    assertEquals(
      results.find((result) => result.type === "success"),
      { type: "success", value: 1 },
    );
    assertEquals(
      results.find((result) => result.type === "error"),
      { type: "error", error: expectedError },
    );
  },
);

Deno.test(
  "AnabranchStream.throwOn - should preserve concurrency settings",
  async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const started = deferred<void>();
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const stream = new AnabranchSource<number, "boom">(async function* () {
      yield 1;
      yield 2;
      yield 3;
    }).withConcurrency(1);

    const mapped = stream
      .throwOn((error): error is "boom" => error === "boom")
      .map(async (value) => {
        inFlight += 1;
        maxObserved = Math.max(maxObserved, inFlight);
        if (inFlight === 1) {
          started.resolve();
        }
        await gates[value - 1].promise;
        inFlight -= 1;
        return value;
      });

    const resultsPromise = mapped.toArray();
    await started.promise;

    assertEquals(maxObserved, 1);

    for (const gate of gates) {
      gate.resolve();
    }

    await resultsPromise;
  },
);

Deno.test(
  "AnabranchStream.map - should convert thrown errors into error results",
  async () => {
    const stream = streamFrom<number, Error>([success(2), success(3)]);
    const expectedError = new Error("nope");
    const mapped = stream.map((value) => {
      if (value === 3) {
        throw expectedError;
      }
      return value * 2;
    });

    const results = await mapped.toArray();

    assertEquals(results, [
      { type: "success", value: 4 },
      { type: "error", error: expectedError },
    ]);
  },
);

Deno.test(
  "AnabranchStream.filter - should keep matching successes",
  async () => {
    const stream = streamFrom<number, string>([
      success(1),
      success(2),
      failure("bad"),
    ]);
    const filtered = stream.filter((value) => value % 2 === 0);

    const results = await filtered.toArray();

    assertEquals(results, [
      { type: "success", value: 2 },
      { type: "error", error: "bad" },
    ]);
  },
);

Deno.test(
  "AnabranchStream.filter - should convert thrown errors into error results",
  async () => {
    const stream = streamFrom<number, Error>([success(1), success(2)]);
    const expectedError = new Error("filter failed");
    const filtered = stream.filter((value) => {
      if (value === 2) {
        throw expectedError;
      }
      return true;
    });

    const results = await filtered.toArray();

    assertEquals(results, [
      { type: "success", value: 1 },
      { type: "error", error: expectedError },
    ]);
  },
);

Deno.test(
  "AnabranchStream.fold - should accumulate successful values",
  async () => {
    const stream = streamFrom<number, string>([
      success(1),
      failure("bad"),
      success(3),
    ]);

    const result = await stream.fold((acc, value) => acc + value, 0);

    assertEquals(result, 4);
  },
);

Deno.test(
  "AnabranchStream.fold - should throw aggregate error when callback fails",
  async () => {
    const stream = streamFrom<number, Error>([success(1), success(2)]);
    const expectedError = new Error("fold failed");

    await assertRejects(
      () =>
        stream.fold((acc, value) => {
          if (value === 2) {
            throw expectedError;
          }
          return acc + value;
        }, 0),
      Error,
      "fold failed",
    );
  },
);

Deno.test("AnabranchStream.mapErr - should transform errors", async () => {
  const stream = streamFrom<number, string>([failure("bad"), success(1)]);
  const mapped = stream.mapErr((error) => `${error}-mapped`);

  const results = await mapped.toArray();

  assertEquals(results, [
    { type: "error", error: "bad-mapped" },
    { type: "success", value: 1 },
  ]);
});

Deno.test("AnabranchStream.filterErr - should keep matching errors", async () => {
  const stream = streamFrom<number, string>([
    failure("bad"),
    failure("worse"),
    success(1),
  ]);
  const filtered = stream.filterErr((error) => error === "worse");

  const results = await filtered.toArray();

  assertEquals(results, [
    { type: "error", error: "worse" },
    { type: "success", value: 1 },
  ]);
});

Deno.test("AnabranchStream.foldErr - should accumulate errors", async () => {
  const stream = streamFrom<number, string>([
    failure("bad"),
    success(1),
    failure("worse"),
  ]);

  const result = await stream.foldErr((acc, error) => `${acc}|${error}`, "");

  assertEquals(result, "|bad|worse");
});

Deno.test(
  "AnabranchStream.foldErr - should throw raw error when callback fails",
  async () => {
    const stream = streamFrom<number, Error>([failure(new Error("bad"))]);
    const expectedError = new Error("foldErr failed");

    await assertRejects(
      () =>
        stream.foldErr(() => {
          throw expectedError;
        }, ""),
      Error,
      "foldErr failed",
    );
  },
);

Deno.test(
  "AnabranchStream.recoverWhen - should convert matching errors to success",
  async () => {
    const stream = streamFrom<number, "recover" | "skip">([
      failure("recover"),
      failure("skip"),
    ]);
    const recovered = stream.recoverWhen(
      (error): error is "recover" => error === "recover",
      () => 42,
    );

    const results = await recovered.toArray();

    assertEquals(results, [
      { type: "success", value: 42 },
      { type: "error", error: "skip" },
    ]);
  },
);

Deno.test("AnabranchStream.recover - should convert errors to successes", async () => {
  const stream = streamFrom<number, string>([failure("bad"), success(1)]);
  const recovered = stream.recover(() => 0);

  const results = await recovered.toArray();

  assertEquals(results, [
    { type: "success", value: 0 },
    { type: "success", value: 1 },
  ]);
});

Deno.test("AnabranchStream.throwOn - should throw matching errors", async () => {
  const stream = streamFrom<number, "boom" | "other">([
    success(1),
    failure("boom"),
    success(2),
  ]);
  const throwsOn = stream.throwOn(
    (error): error is "boom" => error === "boom",
  );

  await assertRejects(
    async () => {
      for await (const _ of throwsOn.successes()) {
        // iterate to trigger throw
      }
    },
    "boom",
  );
});

Deno.test(
  "AnabranchStream.throwOn - should throw the same error instance",
  async () => {
    const expectedError = new Error("explode");
    const stream = streamFrom<number, Error>([
      success(1),
      failure(expectedError),
      success(2),
    ]);
    const throwsOn = stream.throwOn(
      (error): error is Error => error === expectedError,
    );

    await assertRejects(
      async () => {
        for await (const _ of throwsOn.successes()) {
          // iterate to trigger throw
        }
      },
      Error,
      "explode",
    );
  },
);
