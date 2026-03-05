import { assertEquals, assertObjectMatch, assertRejects } from "@std/assert";
import { type Result, Source } from "../index.ts";
import { deferred, failure, streamFrom, success } from "../test_utils.ts";

Deno.test("Stream.toArray - should collect all results", async () => {
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
  "Stream.collect - should return successes when no errors",
  async () => {
    const stream = streamFrom<number, string>([success(1), success(2)]);

    const results = await stream.collect();

    assertEquals(results, [1, 2]);
  },
);

Deno.test(
  "Stream.collect - should throw aggregate error when errors exist",
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
  "Stream.successes - should yield only successful values",
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

Deno.test("Stream.errors - should yield only errors", async () => {
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

Deno.test("Stream iterator - should yield all results", async () => {
  const stream = streamFrom<number, string>([success(1), failure("boom")]);
  const collected: Result<number, string>[] = [];

  for await (const result of stream) {
    collected.push(result);
  }

  assertEquals(collected, [
    { type: "success", value: 1 },
    { type: "error", error: "boom" },
  ]);
});

Deno.test("Stream.map - should transform successful values", async () => {
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

Deno.test("Stream.flatMap - should expand successes", async () => {
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
  "Stream.flatMap - should convert thrown errors into error results",
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
  "Stream.flatMap - should convert iterable errors into error results",
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
  "Stream.flatMap - should preserve concurrency settings",
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
    const stream = new Source<number, string>(async function* () {
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
  "Stream.map - should honor concurrency limit",
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
    const stream = new Source<number, string>(async function* () {
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
  "Stream.map - should preserve order with concurrency 1",
  async () => {
    const stream = new Source<number, string>(async function* () {
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
  "Stream.map - should apply buffer backpressure",
  async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const started = deferred<void>();
    const gate = deferred<void>();
    const stream = new Source<number, string>(async function* () {
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
  "Stream.map - should propagate errors from mapped tasks",
  async () => {
    const expectedError = new Error("map failed");
    const stream = new Source<number, Error>(async function* () {
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
  "Stream.map - should surface source generator errors",
  async () => {
    const expectedError = new Error("source failed");
    const stream = new Source<number, Error>(async function* () {
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
  "Stream.map - should emit generator errors before completion",
  async () => {
    const expectedError = new Error("source race");
    const stream = new Source<number, Error>(async function* () {
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
  "Stream.throwOn - should preserve concurrency settings",
  async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const started = deferred<void>();
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const stream = new Source<number, "boom">(async function* () {
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
  "Stream.map - should convert thrown errors into error results",
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
  "Stream.filter - should keep matching successes",
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
  "Stream.filter - should convert thrown errors into error results",
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
  "Stream.fold - should accumulate successful values",
  async () => {
    const stream = streamFrom<number, string>([success(1), success(3)]);

    const result = await stream.fold((acc, value) => acc + value, 0);

    assertEquals(result, 4);
  },
);

Deno.test(
  "Stream.fold - should throw aggregate error when errors are present",
  async () => {
    const stream = streamFrom<number, string>([
      success(1),
      failure("bad"),
      success(3),
    ]);

    await assertRejects(
      () => stream.fold((acc, value) => acc + value, 0),
      Error,
      "AggregateError: 1 errors",
    );
  },
);

Deno.test(
  "Stream.fold - should throw aggregate error when callback fails",
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

Deno.test("Stream.mapErr - should transform errors", async () => {
  const stream = streamFrom<number, string>([failure("bad"), success(1)]);
  const mapped = stream.mapErr((error) => `${error}-mapped`);

  const results = await mapped.toArray();

  assertEquals(results, [
    { type: "error", error: "bad-mapped" },
    { type: "success", value: 1 },
  ]);
});

Deno.test("Stream.mapErr - should emit error when callback throws", async () => {
  const stream = streamFrom<number, string>([failure("bad"), success(1)]);
  const mapped = stream.mapErr((error) => {
    // deno-lint-ignore no-throw-literal
    if (error === "bad") throw "mapped-error";
    return error;
  });

  const results = await mapped.toArray();

  assertEquals(results, [
    { type: "error", error: "mapped-error" },
    { type: "success", value: 1 },
  ]);
});

Deno.test("Stream.filterErr - should keep matching errors", async () => {
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

Deno.test("Stream.foldErr - should accumulate errors", async () => {
  const stream = streamFrom<number, string>([
    failure("bad"),
    success(1),
    failure("worse"),
  ]);

  const result = await stream.foldErr((acc, error) => `${acc}|${error}`, "");

  assertEquals(result, "|bad|worse");
});

Deno.test(
  "Stream.foldErr - should throw raw error when callback fails",
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
  "Stream.recoverWhen - should convert matching errors to success",
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

Deno.test(
  "Stream.recoverWhen - should emit error when recovery function throws",
  async () => {
    const stream = streamFrom<number, string>([
      failure("recoverable"),
    ]);
    const recovered = stream.recoverWhen(
      (error): error is "recoverable" => error === "recoverable",
      () => {
        // deno-lint-ignore no-throw-literal
        throw "recovery failed";
      },
    );

    const results = await recovered.toArray();

    assertEquals(results, [
      { type: "error", error: "recovery failed" },
    ]);
  },
);

Deno.test("Stream.recover - should convert errors to successes", async () => {
  const stream = streamFrom<number, string>([failure("bad"), success(1)]);
  const recovered = stream.recover(() => 0);

  const results = await recovered.toArray();

  assertEquals(results, [
    { type: "success", value: 0 },
    { type: "success", value: 1 },
  ]);
});

Deno.test("Stream.tap - should run side effect and pass through", async () => {
  const seen: number[] = [];
  const stream = streamFrom<number, string>([
    success(1),
    failure("bad"),
    success(2),
  ]);
  const tapped = stream.tap((value) => {
    seen.push(value);
  });

  const results = await tapped.toArray();

  assertEquals(seen, [1, 2]);
  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: "bad" },
    { type: "success", value: 2 },
  ]);
});

Deno.test("Stream.tap - should convert thrown errors into error results", async () => {
  const stream = streamFrom<number, Error>([success(1), success(2)]);
  const expectedError = new Error("tap failed");
  const tapped = stream.tap((value) => {
    if (value === 2) throw expectedError;
  });

  const results = await tapped.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: expectedError },
  ]);
});

Deno.test("Stream.tapErr - should run side effect on errors and pass through", async () => {
  const stream = streamFrom<number, string>([
    failure("bad"),
    success(1),
    failure("worse"),
  ]);
  const seen: string[] = [];
  const tapped = stream.tapErr((error) => {
    seen.push(error);
  });

  const results = await tapped.toArray();

  assertEquals(seen, ["bad", "worse"]);
  assertEquals(results, [
    { type: "error", error: "bad" },
    { type: "success", value: 1 },
    { type: "error", error: "worse" },
  ]);
});

Deno.test("Stream.tryMap - should transform successes and errors", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    failure("original"),
    success(4),
  ]);
  const mapped = stream.tryMap(
    (v) => v * 10,
    (e, val) => `mapped: ${e} from ${val}`,
  );

  const results = await mapped.toArray();

  assertEquals(results, [
    { type: "success", value: 10 },
    { type: "success", value: 20 },
    { type: "error", error: "original" },
    { type: "success", value: 40 },
  ]);
});

Deno.test("Stream.tryMap - should collect errors from fn", async () => {
  const stream = streamFrom<number, Error>([
    success(1),
    success(2),
    success(3),
  ]);
  const mapped = stream.tryMap(
    (v) => {
      if (v === 2) throw new Error("cannot map 2");
      return v * 10;
    },
    (e, val) => new Error(`wrapped: ${val}: ${(e as Error).message}`),
  );

  const results = await mapped.toArray();

  assertEquals(results.length, 3);
  assertEquals(results[0], { type: "success", value: 10 });
  assertEquals(results[1].type, "error");
  assertObjectMatch(results[1], {
    type: "error",
    error: { message: "wrapped: 2: cannot map 2" },
  });
  assertEquals(results[2], { type: "success", value: 30 });
});

Deno.test(
  "Stream.tryMap - should honor concurrency limit",
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
    const stream = new Source<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
    }).withConcurrency(2);

    const mapped = stream.tryMap(
      async (value) => {
        inFlight += 1;
        maxObserved = Math.max(maxObserved, inFlight);
        if (inFlight === 2) {
          started.resolve();
        }
        await gates[value - 1].promise;
        inFlight -= 1;
        return value * 10;
      },
      (error) => `error: ${error}`,
    );

    const resultsPromise = mapped.toArray();
    await started.promise;
    assertEquals(maxObserved, 2);

    for (const gate of gates) {
      gate.resolve();
    }

    await resultsPromise;
    assertEquals(maxObserved, 2);
  },
);

Deno.test("Stream.take - should limit successes, errors pass through", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure("bad"),
    success(2),
    success(3),
    success(4),
  ]);
  const taken = stream.take(2);

  const results = await taken.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: "bad" },
    { type: "success", value: 2 },
  ]);
});

Deno.test("Stream.take - should handle n=0", async () => {
  const stream = streamFrom<number, string>([success(1), success(2)]);
  const taken = stream.take(0);

  const results = await taken.toArray();

  assertEquals(results, []);
});

Deno.test("Stream.takeWhile - should stop when predicate returns false", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(5),
    success(3),
  ]);
  const taken = stream.takeWhile((value) => value < 5);

  const results = await taken.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "success", value: 2 },
  ]);
});

Deno.test("Stream.takeWhile - should emit error and stop when predicate throws", async () => {
  const stream = streamFrom<number, Error>([success(1), success(2)]);
  const expectedError = new Error("predicate failed");
  const taken = stream.takeWhile((value) => {
    if (value === 2) throw expectedError;
    return true;
  });

  const results = await taken.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: expectedError },
  ]);
});

Deno.test("Stream.partition - should split successes and errors", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure("bad"),
    success(2),
    failure("worse"),
  ]);

  const { successes, errors } = await stream.partition();

  assertEquals(successes, [1, 2]);
  assertEquals(errors, ["bad", "worse"]);
});

Deno.test("Stream.partition - should handle stream with only successes", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ]);

  const { successes, errors } = await stream.partition();

  assertEquals(successes, [1, 2, 3]);
  assertEquals(errors, []);
});

Deno.test("Stream.partition - should handle stream with only errors", async () => {
  const stream = streamFrom<number, string>([
    failure("bad"),
    failure("worse"),
    failure("terrible"),
  ]);

  const { successes, errors } = await stream.partition();

  assertEquals(successes, []);
  assertEquals(errors, ["bad", "worse", "terrible"]);
});

Deno.test("Stream integration - should compose multiple operations", async () => {
  const stream = new Source<number, Error>(async function* () {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
    throw new Error("source error");
  });

  const result = await stream
    .map((n) => {
      if (n === 3) throw new Error("map error");
      return n;
    })
    .filter((n) => n % 2 !== 0) // keep odds: 1, 5
    .flatMap((n) => [n, n * 100]) // expand: 1, 100, 5, 500
    .recover(() => -1) // recover all errors as -1
    .collect();

  assertEquals(result.sort((a, b) => a - b), [-1, -1, 1, 5, 100, 500]);
});

Deno.test(
  "Stream integration - partial recovery: recoverWhen leaves unmatched errors intact",
  async () => {
    type Err = "retryable" | "fatal";
    const stream = new Source<number, Err>(async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const { successes, errors } = await stream
      .map((n): number => {
        if (n === 1) throw "retryable" as Err;
        if (n === 2) throw "fatal" as Err;
        return n * 10;
      })
      .recoverWhen(
        (e): e is "retryable" => e === "retryable",
        () => -1,
      )
      .partition();

    assertEquals(successes.sort((a, b) => a - b), [-1, 30]);
    assertEquals(errors, ["fatal"]);
  },
);

Deno.test(
  "Stream integration - error transformation chain: mapErr then filterErr",
  async () => {
    const stream = new Source<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const { successes, errors } = await stream
      .map((n) => {
        // deno-lint-ignore no-throw-literal
        if (n === 1) throw "minor error";
        // deno-lint-ignore no-throw-literal
        if (n === 2) throw "CRITICAL error";
        return n * 10;
      })
      .mapErr((e: string) => e.toUpperCase())
      .filterErr((e) => e.startsWith("CRITICAL"))
      .partition();

    assertEquals(successes, [30]);
    assertEquals(errors, ["CRITICAL ERROR"]);
  },
);

Deno.test(
  "Stream integration - tap and tapErr observe without affecting pipeline",
  async () => {
    const successLog: number[] = [];
    const errorLog: string[] = [];

    const stream = new Source<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const { successes, errors } = await stream
      .map((n) => {
        // deno-lint-ignore no-throw-literal
        if (n === 2) throw "bad";
        return n * 10;
      })
      .tap((v) => {
        successLog.push(v);
      })
      .tapErr((e: string) => {
        errorLog.push(e);
      })
      .map((n) => n + 1)
      .partition();

    assertEquals(successLog, [10, 30]);
    assertEquals(errorLog, ["bad"]);
    assertEquals(successes, [11, 31]);
    assertEquals(errors, ["bad"]);
  },
);

Deno.test(
  "Stream integration - take limits output of a large source",
  async () => {
    const stream = new Source<number, never>(async function* () {
      let i = 0;
      while (true) yield i++;
    });

    const results = await stream
      .map((n) => n * 2)
      .take(5)
      .collect();

    assertEquals(results, [0, 2, 4, 6, 8]);
  },
);

Deno.test(
  "Stream integration - takeWhile stops pipeline mid-stream",
  async () => {
    const stream = new Source<number, string>(async function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    });

    const { successes, errors } = await stream
      .map((n) => {
        // deno-lint-ignore no-throw-literal
        if (n === 2) throw "oops";
        return n;
      })
      .takeWhile((n) => n < 4)
      .partition();

    // 1 passes, 2 becomes error (errors pass through takeWhile),
    // 3 passes, 4 triggers takeWhile to stop
    assertEquals(successes, [1, 3]);
    assertEquals(errors, ["oops"]);
  },
);

Deno.test(
  "Stream integration - concurrent map with error accumulation",
  async () => {
    const stream = new Source<number, Error>(async function* () {
      for (let i = 1; i <= 6; i++) yield i;
    }).withConcurrency(3);

    const { successes, errors } = await stream
      .map(async (n) => {
        await Promise.resolve();
        if (n % 2 === 0) throw new Error(`even: ${n}`);
        return n;
      })
      .filter((n) => n < 5)
      .partition();

    assertEquals(successes.sort((a, b) => a - b), [1, 3]);
    assertEquals(
      errors.map((e) => e.message).sort(),
      ["even: 2", "even: 4", "even: 6"],
    );
  },
);

Deno.test("Stream.throwOn - should throw matching errors", async () => {
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

Deno.test("Stream.throwOn - should throw the same error instance", async () => {
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
});

Deno.test("Stream.scan - should emit running accumulator", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ]);
  const scanned = stream.scan((sum, n) => sum + n, 0);

  const results = await scanned.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "success", value: 3 },
    { type: "success", value: 6 },
  ]);
});

Deno.test("Stream.scan - should pass errors through", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    failure("bad"),
    success(2),
  ]);
  const scanned = stream.scan((sum, n) => sum + n, 0);

  const results = await scanned.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: "bad" },
    { type: "success", value: 3 },
  ]);
});

Deno.test("Stream.scan - should emit initial value", async () => {
  const stream = streamFrom<number, string>([
    success(10),
  ]);
  const scanned = stream.scan((acc, n) => acc + n, 5);

  const results = await scanned.toArray();

  assertEquals(results, [
    { type: "success", value: 15 },
  ]);
});

Deno.test("Stream.scan - should emit error when callback throws", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ]);
  const scanned = stream.scan((sum, n) => {
    // deno-lint-ignore no-throw-literal
    if (n === 2) throw "scan failed";
    return sum + n;
  }, 0);

  const results = await scanned.toArray();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: "scan failed" },
    { type: "success", value: 4 },
  ]);
});

Deno.test("Stream.chunks - should group successes into arrays", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
    success(4),
    success(5),
  ]);
  const chunked = stream.chunks(2);

  const results = await chunked.toArray();

  assertEquals(results, [
    { type: "success", value: [1, 2] },
    { type: "success", value: [3, 4] },
    { type: "success", value: [5] },
  ]);
});

Deno.test("Stream.chunks - should emit partial chunk at end", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
  ]);
  const chunked = stream.chunks(2);

  const results = await chunked.toArray();

  assertEquals(results, [
    { type: "success", value: [1, 2] },
    { type: "success", value: [3] },
  ]);
});

Deno.test("Stream.chunks - should pass errors through without breaking chunk", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    failure("bad"),
    success(3),
    success(4),
  ]);
  const chunked = stream.chunks(2);

  const results = await chunked.toArray();

  assertEquals(results, [
    { type: "success", value: [1, 2] },
    { type: "error", error: "bad" },
    { type: "success", value: [3, 4] },
  ]);
});

Deno.test("Stream.chunks - should flush chunk on error", async () => {
  const stream = streamFrom<number, string>([
    success(1),
    success(2),
    success(3),
    failure("bad"),
    success(4),
  ]);
  const chunked = stream.chunks(2);

  const results = await chunked.toArray();

  assertEquals(results, [
    { type: "success", value: [1, 2] },
    { type: "success", value: [3] },
    { type: "error", error: "bad" },
    { type: "success", value: [4] },
  ]);
});
