async function waitForPostgres(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const proc = await new Deno.Command("docker", {
        args: ["exec", "anabranch-postgres", "pg_isready", "-U", "postgres"],
      }).output();
      if (proc.success) {
        console.log("PostgreSQL is ready!");
        return;
      }
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("PostgreSQL did not become ready in time");
}

await waitForPostgres();
