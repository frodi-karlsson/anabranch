async function main(): Promise<void> {
  console.log("Cleaning up any existing containers...");
  await new Deno.Command("docker", {
    args: ["rm", "-f", "anabranch-postgres"],
  }).output();
  await new Deno.Command("docker", {
    args: ["rm", "-f", "anabranch-mysql"],
  }).output();

  console.log("Starting PostgreSQL container...");
  const pgStart = await new Deno.Command("docker", {
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

  if (!pgStart.success) {
    console.error("Failed to start PostgreSQL container");
    Deno.exit(1);
  }

  console.log("Starting MySQL container...");
  const mysqlStart = await new Deno.Command("docker", {
    args: [
      "run",
      "-d",
      "--name",
      "anabranch-mysql",
      "-e",
      "MYSQL_ROOT_PASSWORD=mysql",
      "-e",
      "MYSQL_DATABASE=mysql",
      "-e",
      "MYSQL_ROOT_HOST=%",
      "-p",
      "3307:3306",
      "mysql:8",
    ],
  }).output();

  if (!mysqlStart.success) {
    console.error("Failed to start MySQL container");
    Deno.exit(1);
  }

  try {
    console.log("Waiting for PostgreSQL to be ready...");
    const pgWait = new Deno.Command("deno", {
      args: ["run", "-A", `${import.meta.dirname}/wait-for-postgres.ts`],
    });
    await pgWait.output();

    console.log("Waiting for MySQL to be ready...");
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const probe = await new Deno.Command("docker", {
        args: [
          "exec",
          "anabranch-mysql",
          "mysqladmin",
          "ping",
          "-h",
          "127.0.0.1",
        ],
      }).output();
      if (probe.success) {
        console.log("MySQL is ready!");
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log("Running PostgreSQL integration tests...");
    const pgTests = await new Deno.Command("deno", {
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
    console.log(new TextDecoder().decode(pgTests.stdout));
    if (!pgTests.success) {
      console.error(new TextDecoder().decode(pgTests.stderr));
      Deno.exit(1);
    }

    console.log("Running MySQL integration tests...");
    const mysqlTests = await new Deno.Command("deno", {
      args: [
        "test",
        "--allow-read",
        "--allow-write",
        "--allow-sys",
        "--allow-env",
        "--allow-net",
        "./packages/db-mysql/db-mysql_test.ts",
      ],
      env: {
        ...Deno.env.toObject(),
        MYSQL_URL: "mysql://root:mysql@127.0.0.1:3307/mysql",
      },
    }).output();
    console.log(new TextDecoder().decode(mysqlTests.stdout));
    if (!mysqlTests.success) {
      console.error(new TextDecoder().decode(mysqlTests.stderr));
      Deno.exit(1);
    }

    console.log("All integration tests passed!");
  } finally {
    console.log("Stopping containers...");
    await new Deno.Command("docker", { args: ["stop", "anabranch-postgres"] })
      .output();
    await new Deno.Command("docker", { args: ["stop", "anabranch-mysql"] })
      .output();
  }
}

await main();
