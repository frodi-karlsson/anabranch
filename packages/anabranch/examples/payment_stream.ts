import { Source } from "../index.ts";

interface Payment {
  id: string;
  amount: number;
  status: "pending" | "completed" | "failed";
}

const payments = Source.from<Payment, Error>(async function* () {
  yield { id: "1", amount: 100, status: "completed" };
  yield { id: "2", amount: 50, status: "completed" };
  yield { id: "3", amount: 200, status: "failed" };
  yield { id: "4", amount: 75, status: "completed" };
  yield { id: "5", amount: 150, status: "completed" };
});

const runningTotal = payments
  .filter((p) => p.status === "completed")
  .scan((total, payment) => total + payment.amount, 0)
  .takeWhile((total) => total < 400);

console.log("Running balance after each completed payment:");
for await (const result of runningTotal) {
  if (result.type === "success") {
    console.log(`  Balance: $${result.value}`);
  } else {
    console.error(`  Error: ${result.error}`);
  }
}
