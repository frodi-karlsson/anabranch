import { assertEquals } from "@std/assert";
import { AnabranchAggregateError } from "../index.ts";

Deno.test("AnabranchAggregateError - should set message and errors", () => {
  const error1 = new Error("Error 1");
  const error2 = new Error("Error 2");
  const aggregateError = new AnabranchAggregateError([error1, error2]);

  assertEquals(aggregateError.name, "AnabranchAggregateError");
  assertEquals(aggregateError.message, "AggregateError: 2 errors");
  assertEquals(aggregateError.errors, [error1, error2]);
});
