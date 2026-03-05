import { Source } from "../index.ts";

interface Event {
  type: "info" | "warn" | "error" | "metric";
  message: string;
  value?: number;
}

function createEventStream() {
  return new Source<Event, Error>(async function* () {
    yield { type: "info", message: "System started" };
    yield { type: "info", message: "Cache initialized" };
    yield { type: "metric", message: "cpu_usage", value: 45 };
    yield { type: "warn", message: "High memory usage" };
    yield { type: "metric", message: "cpu_usage", value: 78 };
    yield { type: "error", message: "Database connection failed" };
    yield { type: "metric", message: "cpu_usage", value: 92 };
    yield { type: "error", message: "Timeout waiting for response" };
    yield { type: "info", message: "Cleanup complete" };
  });
}

const fatalError = new Error("Fatal error detected");

const events = createEventStream();
const processed = events
  .filter((e) => e.type !== "info")
  .map((e) => {
    if (e.type === "error" && e.message.includes("Database")) {
      throw fatalError;
    }
    return e;
  })
  .throwOn((e): e is Error => e === fatalError);

console.log("Processing events (will throw on fatal error):");
try {
  for await (const result of processed.successes()) {
    const e = result;
    console.log(
      `  [${e.type.toUpperCase()}] ${e.message}${
        e.value ? ` (${e.value})` : ""
      }`,
    );
  }
} catch (error) {
  console.error(`\n  Fatal error: ${(error as Error).message}`);
  console.log("  Stopping processing...");
}

console.log("\nError summary (fresh stream):");
const errorStats = await createEventStream()
  .filter((e) => e.type === "error")
  .fold<{ count: number; messages: string[] }>(
    (acc, errEvent) => ({
      count: acc.count + 1,
      messages: [...acc.messages, errEvent.message],
    }),
    { count: 0, messages: [] },
  );

console.log(`  ${errorStats.count} errors:`);
for (const msg of errorStats.messages) {
  console.log(`    - ${msg}`);
}
