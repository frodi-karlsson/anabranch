/**
 * Integration tests for db-mysql.
 * Set MYSQL_URL or environment variables to run them.
 * CI uses GitHub Actions service containers for this.
 */
import { assertEquals } from "@std/assert";
import { Task } from "@anabranch/anabranch";
import { DB } from "@anabranch/db";
import { createMySQL } from "./index.ts";

const MYSQL_URL = Deno.env.get("MYSQL_URL") ||
  (Deno.env.get("MYSQL_HOST") &&
    `mysql://${Deno.env.get("MYSQL_USER") ?? "root"}:${
      Deno.env.get("MYSQL_PASSWORD") ?? ""
    }@${Deno.env.get("MYSQL_HOST")}:${Deno.env.get("MYSQL_PORT") ?? "3306"}/${
      Deno.env.get("MYSQL_DATABASE") ?? "mysql"
    }`);

Deno.test("createMySQL - should return a valid connector", () => {
  const connector = createMySQL({
    connectionString: "mysql://user:pass@localhost:3306/testdb",
  });
  assertEquals(typeof connector.connect, "function");
});

Deno.test("createMySQL - should accept connection string", () => {
  const connector = createMySQL({
    connectionString: "mysql://user:pass@localhost:3306/testdb",
  });
  assertEquals(typeof connector.connect, "function");
});

Deno.test("createMySQL - should accept individual options", () => {
  const connector = createMySQL({
    host: "localhost",
    port: 3306,
    user: "testuser",
    password: "testpass",
    database: "testdb",
  });
  assertEquals(typeof connector.connect, "function");
});

Deno.test("createMySQL - should accept pool options", () => {
  const connector = createMySQL({
    connectionString: "mysql://user:pass@localhost:3306/testdb",
    connectionLimit: 20,
    waitForConnections: true,
    connectionTimeoutMillis: 10000,
  });
  assertEquals(typeof connector.connect, "function");
});

Deno.test("createMySQL - should use environment variables as defaults", () => {
  const connector = createMySQL();
  assertEquals(typeof connector.connect, "function");
});

Deno.test({
  name: "createMySQL.connect - should return adapter with all methods",
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! });
    try {
      const adapter = await connector.connect();

      assertEquals(typeof adapter.query, "function");
      assertEquals(typeof adapter.execute, "function");
      assertEquals(typeof adapter.close, "function");

      await adapter.close();
    } finally {
      await connector.end();
    }
  },
});

Deno.test({
  name: "DB - should execute SELECT and return results",
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! });
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, "_")}`;

      const result = await DB.withConnection(
        connector,
        (db) =>
          Task.of(async () => {
            await db
              .execute(
                `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
              )
              .run();
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run();
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
              .run();

            const users = await db.query<{ id: number; name: string }>(
              `SELECT * FROM ${table} ORDER BY id`,
            ).run();

            return users;
          }),
      ).run();

      assertEquals(result.length, 2);
      assertEquals(result[0].name, "Alice");
      assertEquals(result[1].name, "Bob");
    } finally {
      await connector.end();
    }
  },
});

Deno.test({
  name: "DB - should handle WHERE clause with parameters",
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! });
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, "_")}`;

      const result = await DB.withConnection(
        connector,
        (db) =>
          Task.of(async () => {
            await db
              .execute(
                `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
              )
              .run();
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run();
            await db
              .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
              .run();

            const users = await db.query<{ id: number; name: string }>(
              `SELECT * FROM ${table} WHERE name = ?`,
              ["Alice"],
            ).run();

            return users;
          }),
      ).run();

      assertEquals(result.length, 1);
      assertEquals(result[0].name, "Alice");
    } finally {
      await connector.end();
    }
  },
});

Deno.test({
  name: "DB.execute - should return affected row count",
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! });
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, "_")}`;

      await DB.withConnection(connector, (db) =>
        Task.of(async () => {
          await db
            .execute(
              `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
            )
            .run();

          const insertAffected = await db
            .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
            .run();

          assertEquals(insertAffected, 1);

          const updateAffected = await db
            .execute(
              `UPDATE ${table} SET name = 'Bob' WHERE name = ?`,
              ["Alice"],
            )
            .run();

          assertEquals(updateAffected, 1);

          const deleteAffected = await db
            .execute(`DELETE FROM ${table} WHERE name = ?`, ["Bob"])
            .run();

          assertEquals(deleteAffected, 1);
        })).run();
    } finally {
      await connector.end();
    }
  },
});

Deno.test({
  name: "DB.withTransaction - should commit on success",
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! });
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, "_")}`;

      const result = await DB.withConnection(
        connector,
        (db) =>
          db.withTransaction(async (tx) => {
            await tx
              .execute(
                `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`,
              )
              .run();
            await tx
              .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
              .run();
            await tx
              .execute(`INSERT INTO ${table} (name) VALUES ('Bob')`)
              .run();

            return db
              .query<{ id: number; name: string }>(`SELECT * FROM ${table}`)
              .run();
          }),
      ).run();

      assertEquals(result.length, 2);
    } finally {
      await connector.end();
    }
  },
});

Deno.test({
  name: "DB.withTransaction - should rollback on error",
  ignore: !MYSQL_URL,
  async fn() {
    const connector = createMySQL({ connectionString: MYSQL_URL! });
    try {
      const table = `users_${crypto.randomUUID().replace(/-/g, "_")}`;

      let threw = false;
      let errorMsg = "";

      try {
        await DB.withConnection(
          connector,
          (db) =>
            db.withTransaction(async (tx) => {
              await tx
                .execute(
                  `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) UNIQUE)`,
                )
                .run();
              await tx
                .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
                .run();
              await tx
                .execute(`INSERT INTO ${table} (name) VALUES ('Alice')`)
                .run();
            }),
        ).run();
      } catch (e) {
        threw = true;
        errorMsg = (e as Error).message;
      }

      assertEquals(threw, true, `Expected error, got: ${errorMsg}`);
      assertEquals(errorMsg.includes("Duplicate entry"), true);
    } finally {
      await connector.end();
    }
  },
});
