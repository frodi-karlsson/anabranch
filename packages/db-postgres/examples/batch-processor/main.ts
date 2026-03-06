/**
 * Batch Processor with Error Handling Demo
 *
 * Demonstrates streaming from PostgreSQL with:
 * - Concurrent processing using withConcurrency()
 * - Error logging using tapErr() (after map to catch processing errors)
 * - Partition to collect successes and errors separately
 * - Proper cleanup with try/finally
 *
 * Run: deno run -A examples/batch-processor/main.ts
 */

import { DB } from "@anabranch/db";
import { createPostgres } from "../../index.ts";
import { Task } from "@anabranch/anabranch";

async function main() {
  const connector = createPostgres({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });

  console.log("=== Batch Processor with Error Handling Demo ===\n");

  try {
    await DB.withConnection(connector, (db) =>
      Task.of(async () => {
        await setupTestData(db);

        const { successes, errors } = await db
          .stream<User>("SELECT id, email FROM users ORDER BY id")
          .withConcurrency(5)
          .map(async (user) => {
            if (user.id % 7 === 0) {
              await delay(30);
              throw new TransientError(`User ${user.id} failed`);
            }

            await delay(Math.random() * 15);

            return {
              userId: user.id,
              email: user.email,
              processed: true,
            } as ProcessedUser;
          })
          .tapErr((err) => console.log(`  [error] ${err}`))
          .partition();

        console.log(`\nResults:`);
        console.log(`  Successes: ${successes.length}`);
        console.log(`  Errors: ${errors.length}`);

        const sample = successes.slice(0, 5);
        console.log(`\nProcessed users:`);
        sample.forEach((u) => console.log(`  - ${u.email}`));

        if (errors.length > 0) {
          console.log(`\nFailed users:`);
          errors.forEach((e) => console.log(`  - ${e}`));
        }
      })).run();
  } finally {
    await connector.end();
  }
}

async function setupTestData(db: DB) {
  console.log("Setting up test data...");

  const tableName = `users_${crypto.randomUUID().replace(/-/g, "_")}`;

  await db
    .execute(
      `CREATE TEMP TABLE ${tableName} (id SERIAL PRIMARY KEY, email TEXT)`,
    )
    .run();

  const inserted = await db
    .execute(
      `INSERT INTO ${tableName} (email) SELECT 'user' || i || '@example.com' FROM generate_series(1, 30) i`,
    )
    .run();

  console.log(`Created ${inserted} users (ids divisible by 7 will fail)`);

  await db
    .execute(
      `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), 1)`,
    )
    .run();
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface User {
  id: number;
  email: string;
}

interface ProcessedUser {
  userId: number;
  email: string;
  processed: boolean;
}

class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientError";
  }
}

main().catch(console.error);
