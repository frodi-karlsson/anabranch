import { assertEquals } from "@std/assert";
import { Task } from "@anabranch/anabranch";
import { createInMemory, DB } from "./index.ts";

Deno.test("DB - should execute SELECT and return results", async () => {
  const adapter = await createInMemory().connect();
  const db = new DB(adapter);

  await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();
  await db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')").run();
  await db.execute("INSERT INTO users (id, name) VALUES (2, 'Bob')").run();

  const users = await db.query<{ id: number; name: string }>(
    "SELECT * FROM users ORDER BY id",
  ).run();

  assertEquals(users.length, 2);
  assertEquals(users[0].id, 1);
  assertEquals(users[0].name, "Alice");
  assertEquals(users[1].id, 2);
  assertEquals(users[1].name, "Bob");

  await adapter.close();
});

Deno.test("DB.query - should handle WHERE clause with params", async () => {
  const adapter = await createInMemory().connect();
  const db = new DB(adapter);

  await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();
  await db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')").run();
  await db.execute("INSERT INTO users (id, name) VALUES (2, 'Bob')").run();

  const users = await db.query<{ id: number; name: string }>(
    "SELECT * FROM users WHERE id = ?",
    [1],
  ).run();

  assertEquals(users.length, 1);
  assertEquals(users[0].name, "Alice");

  await adapter.close();
});

Deno.test("DB.execute - INSERT should return affected rows", async () => {
  const adapter = await createInMemory().connect();
  const db = new DB(adapter);

  await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();

  const affected = await db.execute(
    "INSERT INTO users (id, name) VALUES (1, 'Alice')",
  ).run();

  assertEquals(affected, 1);

  await adapter.close();
});

Deno.test("DB.execute - UPDATE should return affected rows", async () => {
  const adapter = await createInMemory().connect();
  const db = new DB(adapter);

  await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();
  await db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')").run();
  await db.execute("INSERT INTO users (id, name) VALUES (2, 'Bob')").run();

  const affected = await db.execute(
    "UPDATE users SET name = 'Charlie' WHERE name = ?",
    ["Alice"],
  ).run();

  assertEquals(affected, 1);

  await adapter.close();
});

Deno.test("DB.execute - DELETE should return affected rows", async () => {
  const adapter = await createInMemory().connect();
  const db = new DB(adapter);

  await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();
  await db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')").run();
  await db.execute("INSERT INTO users (id, name) VALUES (2, 'Bob')").run();

  const affected = await db.execute("DELETE FROM users WHERE id = 1").run();

  assertEquals(affected, 1);

  await adapter.close();
});

Deno.test("DB.stream - should yield rows one at a time", async () => {
  const adapter = await createInMemory().connect();
  const db = new DB(adapter);

  await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();
  await db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')").run();
  await db.execute("INSERT INTO users (id, name) VALUES (2, 'Bob')").run();

  const users: { id: number; name: string }[] = [];

  for await (
    const row of db.stream<{ id: number; name: string }>(
      "SELECT * FROM users ORDER BY id",
    )
  ) {
    if (row.type === "success") {
      users.push(row.value);
    }
  }

  assertEquals(users.length, 2);
  assertEquals(users[0].name, "Alice");
  assertEquals(users[1].name, "Bob");

  await adapter.close();
});

Deno.test("DB.stream - partition should collect successes and errors", async () => {
  const adapter = await createInMemory().connect();
  const db = new DB(adapter);

  await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();
  await db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')").run();
  await db.execute("INSERT INTO users (id, name) VALUES (2, 'Bob')").run();

  const { successes, errors } = await db.stream(
    "SELECT * FROM users ORDER BY id",
  ).partition();

  assertEquals(successes.length, 2);
  assertEquals(errors.length, 0);

  await adapter.close();
});

Deno.test(
  "DB.stream - should buffer results when adapter lacks stream method",
  async () => {
    const connector = createInMemory();
    const adapter = await connector.connect();
    const db = new DB(adapter);

    assertEquals(adapter.stream, undefined);

    const { successes } = await db
      .stream<{ id: number; name: string }>(
        "SELECT * FROM users ORDER BY id",
      )
      .partition();

    assertEquals(successes.length, 0);

    await adapter.close();
  },
);

Deno.test("DB.withConnection - should commit on success", async () => {
  const result = await DB.withConnection(
    createInMemory(),
    (db) =>
      Task.of(async () => {
        await db.execute("CREATE TABLE users (id INTEGER, name TEXT)").run();
        await db
          .execute("INSERT INTO users (id, name) VALUES (1, 'Alice')")
          .run();
        await db
          .execute("INSERT INTO users (id, name) VALUES (2, 'Bob')")
          .run();
        return db.query<{ id: number; name: string }>(
          "SELECT * FROM users",
        ).run();
      }),
  ).run();

  assertEquals(result.length, 2);
});

Deno.test("DB.withConnection - should rollback on error", async () => {
  let threw = false;
  let errorMsg = "";
  try {
    await DB.withConnection(createInMemory(), (db) =>
      Task.of(async () => {
        await db
          .execute(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
          )
          .run();
        await db
          .execute("INSERT INTO users (id, name) VALUES (1, 'Alice')")
          .run();
        await db
          .execute(
            "INSERT INTO users (id, name) VALUES (1, 'Charlie')",
          )
          .run();
        return "should not reach here";
      })).run();
  } catch (e) {
    threw = true;
    errorMsg = (e as Error).message;
  }
  assertEquals(threw, true, `Expected error, got: ${errorMsg}`);
  assertEquals(errorMsg.includes("UNIQUE constraint failed"), true);
});

Deno.test(
  "DB.withTransaction - should commit on success",
  async () => {
    const result = await DB.withConnection(
      createInMemory(),
      (db) =>
        db.withTransaction(async (tx) => {
          await tx
            .execute("CREATE TABLE users (id INTEGER, name TEXT)")
            .run();
          await tx
            .execute("INSERT INTO users (id, name) VALUES (1, 'Alice')")
            .run();
          await tx.execute("INSERT INTO users (name) VALUES ('Bob')").run();

          return db
            .query<{ id: number; name: string }>("SELECT * FROM users")
            .run();
        }),
    ).run();

    assertEquals(result.length, 2);
  },
);

Deno.test(
  "DB.withTransaction - should not redundant rollback on success",
  async () => {
    let rollbackCount = 0;
    let commitCount = 0;

    const mockAdapter = {
      query: () => Promise.resolve([]),
      execute: (sql: string) => {
        if (sql === "ROLLBACK") rollbackCount++;
        if (sql === "COMMIT") commitCount++;
        return Promise.resolve(0);
      },
      close: () => Promise.resolve(),
    };

    const db = new DB(mockAdapter);
    await db.withTransaction(async (tx) => {
      await tx.execute("INSERT INTO test VALUES (1)").run();
    }).run();

    assertEquals(commitCount, 1, "Should have committed once");
    assertEquals(rollbackCount, 0, "Should NOT have rolled back");
  },
);

Deno.test(
  "DB.withTransaction - should rollback on failure",
  async () => {
    let rollbackCount = 0;

    const mockAdapter = {
      query: () => Promise.resolve([]),
      execute: (sql: string) => {
        if (sql === "ROLLBACK") rollbackCount++;
        return Promise.resolve(0);
      },
      close: () => Promise.resolve(),
    };

    const db = new DB(mockAdapter);
    try {
      await db.withTransaction(() => {
        throw new Error("fail");
      }).run();
    } catch {
      // expected
    }

    assertEquals(rollbackCount, 1, "Should have rolled back exactly once");
  },
);

Deno.test("createInMemory - should return a valid connector", async () => {
  const connector = createInMemory();
  assertEquals(typeof connector.connect, "function");

  const adapter = await connector.connect();
  assertEquals(typeof adapter.query, "function");
  assertEquals(typeof adapter.execute, "function");
  assertEquals(typeof adapter.close, "function");
  assertEquals(adapter.stream, undefined);

  await adapter.close();
});

Deno.test(
  "Task.acquireRelease - should acquire, use, and release resource",
  async () => {
    const connector = createInMemory();
    const released: boolean[] = [];

    const task = Task.acquireRelease({
      acquire: () =>
        connector.connect().finally(() => {
          released.push(true);
        }),
      release: (adapter) => {
        released.push(true);
        return adapter.close();
      },
      use: (adapter) =>
        Task.of(async () => {
          const db = new DB(adapter);
          await db.execute("CREATE TABLE users (id INTEGER)").run();
          await db.execute("INSERT INTO users (id) VALUES (1)").run();
          const users = await db.query("SELECT * FROM users").run();
          return users.length;
        }),
    });

    const result = await task.run();
    assertEquals(result, 1);
    assertEquals(released.length, 2);
  },
);
