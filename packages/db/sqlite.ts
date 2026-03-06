import { DatabaseSync } from "node:sqlite";
import type { DBConnector } from "./adapter.ts";

/** Creates an in-memory SQLite connector for testing. */
export function createInMemory(): DBConnector {
  return {
    connect: () => {
      const db = new DatabaseSync(":memory:");
      return Promise.resolve({
        query: (sql, params) => {
          const stmt = db.prepare(sql);
          return Promise.resolve(
            stmt.all(...(params ?? []) as Parameters<typeof stmt.all>),
          );
        },
        execute: (sql, params) => {
          const stmt = db.prepare(sql);
          const { changes } = stmt.run(
            ...(params ?? []) as Parameters<typeof stmt.run>,
          );
          return Promise.resolve(Number(changes));
        },
        close: () => {
          db.close();
          return Promise.resolve();
        },
      });
    },
  };
}
