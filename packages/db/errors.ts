/**
 * Structured error types for database operations.
 *
 * @example
 * ```ts
 * import { DB, InMemoryDriver, DBError } from "@anabranch/db";
 *
 * const db = await DB.connect(InMemoryDriver.connect()).run();
 * const result = await db.query("SELECT * FROM users").run();
 *
 * if (result.type === "error") {
 *   const err = result.error;
 *   if (err instanceof DBError) {
 *     console.error(`${err.kind}: ${err.message}`);
 *   }
 * }
 * ```
 */
export class DBError extends Error {
  readonly kind: string;
  readonly sql: string | undefined;

  constructor(kind: string, sql: string | undefined, message: string) {
    super(message);
    this.kind = kind;
    this.sql = sql;
  }
}

/** Failed to establish a database connection. */
export class ConnectionFailed extends DBError {
  constructor(message: string) {
    super("ConnectionFailed", undefined, message);
  }
}

/** Query execution failed. */
export class QueryFailed extends DBError {
  constructor(sql: string, message: string) {
    super("QueryFailed", sql, message);
  }
}

/** Constraint violation (e.g., unique, foreign key). */
export class ConstraintViolation extends DBError {
  constructor(sql: string, message: string) {
    super("ConstraintViolation", sql, message);
  }
}

/** Transaction failed. */
export class TransactionFailed extends DBError {
  constructor(message: string) {
    super("TransactionFailed", undefined, message);
  }
}

/** Failed to close the database connection. */
export class CloseError extends DBError {
  constructor(message: string) {
    super("CloseError", undefined, message);
  }
}

/** Serialization failure (concurrent modification detected). */
export class SerializationFailure extends DBError {
  constructor(message: string = "serialization failure") {
    super("SerializationFailure", undefined, message);
  }
}

/** Registry of error constructors for `instanceof` checks. */
export const DBErrors = {
  ConnectionFailed,
  QueryFailed,
  ConstraintViolation,
  TransactionFailed,
  CloseError,
  SerializationFailure,
} as const;
