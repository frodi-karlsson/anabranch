async function main(): Promise<void> {
  console.log("Cleaning up any existing PostgreSQL container...");
  await new Deno.Command("docker", {
    args: ["rm", "-f", "anabranch-postgres"],
  }).output();

  console.log("Starting PostgreSQL container...");

  const start = await new Deno.Command("docker", {
    args: [
      "run",
      "-d",
      "--name",
      "anabranch-postgres",
      "-e",
      "POSTGRES_USER=postgres",
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-e",
      "POSTGRES_DB=postgres",
      "-p",
      "5432:5432",
      "postgres:16",
    ],
  }).output();

  if (!start.success) {
    console.error("Failed to start PostgreSQL container");
    Deno.exit(1);
  }

  try {
    console.log("Waiting for PostgreSQL to be ready...");
    const proc = new Deno.Command("deno", {
      args: ["run", "-A", `${import.meta.dirname}/wait-for-postgres.ts`],
    });
    await proc.output();

    console.log("Running integration tests...");
    const tests = await new Deno.Command("deno", {
      args: [
        "test",
        "--allow-read",
        "--allow-write",
        "--allow-sys",
        "--allow-env",
        "--allow-net",
        "./packages/db-postgres/db-postgres_test.ts",
      ],
      env: {
        ...Deno.env.toObject(),
        POSTGRES_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
      },
    }).output();

    console.log(new TextDecoder().decode(tests.stdout));
    console.error(new TextDecoder().decode(tests.stderr));

    if (!tests.success) {
      Deno.exit(1);
    }
  } finally {
    console.log("Stopping PostgreSQL container...");
    await new Deno.Command("docker", {
      args: ["stop", "anabranch-postgres"],
    }).output();
  }
}

await main();
