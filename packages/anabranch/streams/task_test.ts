import { assertEquals, assertRejects } from "@std/assert";
import { Task } from "../index.ts";
import { deferred } from "../test_utils.ts";

Deno.test("Task.result - should return success", async () => {
  const task = Task.of<number, string>(() => Promise.resolve(42));

  const result = await task.result();

  assertEquals(result, { type: "success", value: 42 });
});

Deno.test("Task.result - should return error", async () => {
  const task = Task.of<number, string>(() => Promise.reject("boom"));

  const result = await task.result();

  assertEquals(result, { type: "error", error: "boom" });
});

Deno.test("Task.retry - should retry until success", async () => {
  let attempts = 0;
  const task = Task.of<number, string>(() => {
    attempts += 1;
    if (attempts < 3) {
      return Promise.reject("retry");
    }
    return Promise.resolve(7);
  }).retry({ attempts: 3 });

  const value = await task.run();

  assertEquals(value, 7);
  assertEquals(attempts, 3);
});

Deno.test("Task.retry - should stop when predicate fails", async () => {
  let attempts = 0;
  const task = Task.of<number, string>(() => {
    attempts += 1;
    return Promise.reject("fatal");
  }).retry({ attempts: 3, when: (error) => error === "retry" });

  await assertRejects(() => task.run(), "fatal");
  assertEquals(attempts, 1);
});

Deno.test("Task.timeout - should reject when time elapses", async () => {
  const gate = deferred<void>();
  const task = Task.of(async () => {
    await gate.promise;
    return 1;
  }).timeout(10, "timeout");

  await assertRejects(() => task.run(), "timeout");
  gate.resolve();
});

Deno.test("Task.all - should run all tasks", async () => {
  const task = Task.all([
    Task.of<number, string>(() => Promise.resolve(1)),
    Task.of<number, string>(() => Promise.resolve(2)),
    Task.of<number, string>(() => Promise.resolve(3)),
  ]);

  const values = await task.run();

  assertEquals(values, [1, 2, 3]);
});

Deno.test("Task.flatMap - should chain tasks", async () => {
  const task = Task.of<number, string>(() => Promise.resolve(2)).flatMap(
    (value) => Task.of(() => Promise.resolve(value * 3)),
  );

  const value = await task.run();

  assertEquals(value, 6);
});

Deno.test("Task.allSettled - should collect successes and errors", async () => {
  const task = Task.allSettled([
    Task.of<number, string>(() => Promise.resolve(1)),
    Task.of<number, string>(() => Promise.reject("boom")),
  ]);

  const results = await task.run();

  assertEquals(results, [
    { type: "success", value: 1 },
    { type: "error", error: "boom" },
  ]);
});

Deno.test("Task.retry - should use delay function", async () => {
  const delays: number[] = [];
  let attempts = 0;
  const task = Task.of<number, string>(() => {
    attempts += 1;
    return Promise.reject("boom");
  }).retry({
    attempts: 3,
    delay: (attempt) => {
      delays.push(attempt);
      return 0;
    },
  });

  await assertRejects(() => task.run(), "boom");

  assertEquals(attempts, 3);
  assertEquals(delays, [0, 1, 2]);
});

Deno.test("Task.race - should resolve first success", async () => {
  const slow = Task.of<number, string>(async () => {
    await Promise.resolve();
    return 2;
  });
  const fast = Task.of<number, string>(() => Promise.resolve(1));

  const result = await Task.race([slow, fast]).run();

  assertEquals(result, { type: "success", value: 1 });
});

Deno.test("Task.race - should resolve success after error", async () => {
  const slow = Task.of<number, string>(async () => {
    await Promise.resolve();
    return 2;
  });
  const fast = Task.of<number, string>(() => Promise.reject("boom"));

  const result = await Task.race([slow, fast]).run();

  assertEquals(result, { type: "success", value: 2 });
});

Deno.test("Task.race - should resolve errors when all fail", async () => {
  const slow = Task.of<number, string>(async () => {
    await Promise.resolve();
    throw "slow";
  });
  const fast = Task.of<number, string>(() => Promise.reject("boom"));

  const result = await Task.race([slow, fast]).run();

  assertEquals(result, { type: "error", error: ["boom", "slow"] });
});

Deno.test("Task.withSignal - should abort underlying task", async () => {
  const controller = new AbortController();
  const gate = deferred<void>();
  const task = Task.of<number, Error>((signal?: AbortSignal) => {
    if (!signal) {
      return Promise.reject(new Error("missing signal"));
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason ?? new Error("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      gate.promise.then(() => {
        signal.removeEventListener("abort", onAbort);
        resolve(1);
      });
    });
  }).withSignal(controller.signal);

  const runPromise = task.run();
  controller.abort(new Error("aborted"));

  await assertRejects(() => runPromise, Error, "aborted");
  gate.resolve();
});

Deno.test("Task.acquireRelease - should acquire, use, and release resource", async () => {
  let acquired = false;
  let released = false;
  const task = Task.acquireRelease({
    acquire: () => {
      acquired = true;
      return Promise.resolve("resource");
    },
    release: (r) => {
      released = true;
      assertEquals(r, "resource");
      return Promise.resolve();
    },
    use: (r) =>
      Task.of(() =>
        Promise.resolve().then(() => {
          assertEquals(r, "resource");
          return "result";
        })
      ),
  });

  const result = await task.result();
  assertEquals(result.type, "success");
  assertEquals((result as { value: string }).value, "result");
  assertEquals(acquired, true);
  assertEquals(released, true);
});

Deno.test("Task.acquireRelease - should release on error", async () => {
  let released = false;
  const task = Task.acquireRelease<unknown, number, Error>({
    acquire: () => Promise.resolve("resource"),
    release: () => {
      released = true;
      return Promise.resolve();
    },
    use: () =>
      Task.of<number, Error>(() => Promise.reject(new Error("failed"))),
  });

  const result = await task.result();
  assertEquals(result.type, "error");
  assertEquals(released, true);
});

Deno.test("Task.acquireRelease - should pass signal to acquire", async () => {
  let receivedSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const task = Task.acquireRelease({
    acquire: (signal) => {
      receivedSignal = signal;
      return Promise.resolve("resource");
    },
    release: () => Promise.resolve(),
    use: () => Task.of(() => Promise.resolve("result")),
  });

  const result = await task.withSignal(controller.signal).run();
  assertEquals(receivedSignal, controller.signal);
  assertEquals(result, "result");
});

Deno.test("Task.acquireRelease - should release even when signal aborted during use", async () => {
  let released = false;
  const gate = Promise.withResolvers<void>();
  const task = Task.acquireRelease({
    acquire: () => Promise.resolve("resource"),
    release: () => {
      released = true;
      return Promise.resolve();
    },
    use: () =>
      Task.of(() =>
        Promise.race([
          gate.promise.then(() => "done"),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 10_000)
          ),
        ])
      ),
  });

  const controller = new AbortController();
  const runPromise = task.withSignal(controller.signal).run();

  controller.abort(new Error("aborted during use"));

  await assertRejects(() => runPromise, Error, "aborted during use");
  assertEquals(released, true);
});

Deno.test("Task.retry - should throw final error when all attempts exhausted", async () => {
  let attempts = 0;
  const task = Task.of<number, string>(() => {
    attempts += 1;
    return Promise.reject(`error ${attempts}`);
  }).retry({ attempts: 3 });

  await assertRejects(() => task.run(), "error 3");
  assertEquals(attempts, 3);
});

Deno.test("Task.all - should reject on first failure", async () => {
  const task = Task.all([
    Task.of(() => Promise.resolve(1)),
    Task.of(() => Promise.reject("fail")),
    Task.of(() => Promise.resolve(3)),
  ]);

  await assertRejects(() => task.run(), "fail");
});

Deno.test("Task.race - should throw for empty input", async () => {
  const task = Task.race<string, never>([]);
  await assertRejects(
    () => task.run(),
    Error,
    "Task.race requires at least one task",
  );
});

Deno.test("Task.flatMap - should not run second task when first fails", async () => {
  let secondRan = false;
  const task = Task.of(() => Promise.reject("first fail"))
    .flatMap(() =>
      Task.of(() => {
        secondRan = true;
        return Promise.resolve("second");
      })
    );

  const result = await task.result();
  assertEquals(result.type, "error");
  assertEquals((result as { error: string }).error, "first fail");
  assertEquals(secondRan, false);
});

Deno.test("Task.timeout - should resolve when task completes within timeout", async () => {
  const task = Task.of<string, Error>(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "success";
  }).timeout(5_000, new Error("timed out"));

  const value = await task.run();
  assertEquals(value, "success");
});
