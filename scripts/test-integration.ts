import { Task } from "../packages/anabranch/index.ts";

async function startContainer(name: string, args: string[]): Promise<void> {
  console.log(`Starting ${name} container...`);
  const proc = await new Deno.Command("docker", {
    args: ["run", "-d", "--name", name, ...args],
  }).output();

  if (!proc.success) {
    console.error(`Failed to start ${name} container`);
    Deno.exit(1);
  }
}

async function main(): Promise<void> {
  const isCI = Deno.env.get("CI") === "true";

  if (isCI) {
    console.log("CI detected, using existing services...");
  } else {
    console.log("Cleaning up any existing containers...");
    const cleanup = ["postgres", "mysql", "redis", "rabbitmq"].map((name) =>
      new Deno.Command("docker", {
        args: ["rm", "-f", `anabranch-${name}`],
      }).output()
    );
    await Promise.all(cleanup);

    await Task.all([
      Task.of(() =>
        startContainer("anabranch-postgres", [
          "-e",
          "POSTGRES_USER=postgres",
          "-e",
          "POSTGRES_PASSWORD=postgres",
          "-e",
          "POSTGRES_DB=postgres",
          "-p",
          "5432:5432",
          "postgres:16",
        ])
      ),
      Task.of(() =>
        startContainer("anabranch-mysql", [
          "-e",
          "MYSQL_ROOT_PASSWORD=mysql",
          "-e",
          "MYSQL_DATABASE=mysql",
          "-e",
          "MYSQL_ROOT_HOST=%",
          "-p",
          "3307:3306",
          "mysql:8",
        ])
      ),
      Task.of(() =>
        startContainer("anabranch-redis", [
          "-p",
          "6379:6379",
          "redis:7",
        ])
      ),
      Task.of(() =>
        startContainer("anabranch-rabbitmq", [
          "--user",
          "rabbitmq",
          "-p",
          "5672:5672",
          "-p",
          "15672:15672",
          "rabbitmq:3-management",
        ])
      ),
    ]).run();
  }

  try {
    if (!isCI) {
      console.log("Waiting for services to be ready...");
      await Task.all([
        Task.of(async () => {
          const probe = await new Deno.Command("docker", {
            args: [
              "exec",
              "anabranch-postgres",
              "pg_isready",
              "-U",
              "postgres",
            ],
          }).output();
          if (!probe.success) throw new Error("PostgreSQL not ready");
        })
          .retry({ attempts: 30, delay: 1000 })
          .tap(() => console.log("PostgreSQL is ready!")),

        Task.of(async () => {
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
          if (!probe.success) throw new Error("MySQL not ready");
        })
          .retry({ attempts: 30, delay: 1000 })
          .tap(() => console.log("MySQL is ready!")),

        Task.of(async () => {
          const probe = await new Deno.Command("docker", {
            args: [
              "exec",
              "anabranch-redis",
              "redis-cli",
              "ping",
            ],
          }).output();
          if (!probe.success) throw new Error("Redis not ready");
        })
          .retry({ attempts: 30, delay: 1000 })
          .tap(() => console.log("Redis is ready!")),

        Task.of(async () => {
          const probe = await new Deno.Command("docker", {
            args: [
              "exec",
              "anabranch-rabbitmq",
              "rabbitmq-diagnostics",
              "ping",
            ],
          }).output();
          if (!probe.success) throw new Error("RabbitMQ not ready");
        })
          .retry({ attempts: 30, delay: 2000 })
          .tap(() => console.log("RabbitMQ is ready!")),
      ])
        .timeout(45_000, new Error("Services did not become ready in time"))
        .run();
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
        POSTGRES_URL: isCI
          ? Deno.env.get("POSTGRES_URL") ??
            "postgresql://postgres:postgres@localhost:5432/postgres"
          : "postgresql://postgres:postgres@localhost:5432/postgres",
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
        MYSQL_URL: isCI
          ? Deno.env.get("MYSQL_URL") ??
            "mysql://root:mysql@localhost:3307/mysql"
          : "mysql://root:mysql@127.0.0.1:3307/mysql",
      },
    }).output();
    console.log(new TextDecoder().decode(mysqlTests.stdout));
    if (!mysqlTests.success) {
      console.error(new TextDecoder().decode(mysqlTests.stderr));
      Deno.exit(1);
    }

    console.log("Running Redis queue integration tests...");
    const redisTests = await new Deno.Command("deno", {
      args: [
        "test",
        "--allow-read",
        "--allow-write",
        "--allow-sys",
        "--allow-env",
        "--allow-net",
        "./packages/queue-redis/queue-redis_test.ts",
      ],
      env: {
        ...Deno.env.toObject(),
        REDIS_URL: isCI
          ? Deno.env.get("REDIS_URL") ?? "redis://localhost:6379"
          : "redis://localhost:6379",
      },
    }).output();
    console.log(new TextDecoder().decode(redisTests.stdout));
    if (!redisTests.success) {
      console.error(new TextDecoder().decode(redisTests.stderr));
      Deno.exit(1);
    }

    console.log("Running RabbitMQ queue integration tests...");
    const rabbitmqTests = await new Deno.Command("deno", {
      args: [
        "test",
        "--allow-read",
        "--allow-write",
        "--allow-sys",
        "--allow-env",
        "--allow-net",
        "./packages/queue-rabbitmq/queue-rabbitmq_test.ts",
      ],
      env: {
        ...Deno.env.toObject(),
        RABBITMQ_URL: isCI
          ? Deno.env.get("RABBITMQ_URL") ?? "amqp://localhost:5672"
          : "amqp://localhost:5672",
      },
    }).output();
    console.log(new TextDecoder().decode(rabbitmqTests.stdout));
    if (!rabbitmqTests.success) {
      console.error(new TextDecoder().decode(rabbitmqTests.stderr));
      Deno.exit(1);
    }

    console.log("All integration tests passed!");
  } finally {
    if (!isCI) {
      console.log("Cleaning up containers...");
      await new Deno.Command("docker", {
        args: ["rm", "-f", "anabranch-postgres"],
      })
        .output();
      await new Deno.Command("docker", {
        args: ["rm", "-f", "anabranch-mysql"],
      })
        .output();
      await new Deno.Command("docker", {
        args: ["rm", "-f", "anabranch-redis"],
      })
        .output();
      await new Deno.Command("docker", {
        args: ["rm", "-f", "anabranch-rabbitmq"],
      })
        .output();
    }
  }
}

await main();
