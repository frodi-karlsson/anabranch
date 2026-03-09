import { type Promisable, Source, Task } from '@anabranch/anabranch'
import type { DBAdapter, DBConnector, DBTransactionAdapter } from './adapter.ts'
import {
  ConnectionFailed,
  ConstraintViolation,
  QueryFailed,
  TransactionFailed,
} from './errors.ts'

/**
 * Database wrapper with Task/Stream semantics.
 *
 * @example
 * ```ts
 * // With a connector (recommended for production)
 * const result = await DB.withConnection(myConnector, (db) =>
 *   db.query("SELECT * FROM users")
 * ).run();
 *
 * // With a bare adapter (for testing or custom lifecycle)
 * const db = new DB(adapter);
 * const users = await db.query("SELECT * FROM users").run();
 * ```
 */
export class DB {
  constructor(private readonly adapter: DBAdapter) {}

  /**
   * Execute operations with a connection acquired from the connector.
   * The connection is automatically released after the operation completes,
   * whether successful or failed.
   *
   * @example
   * ```ts
   * const result = await DB.withConnection(postgresConnector, (db) =>
   *   db.withTransaction(async (tx) => {
   *     await tx.execute("INSERT INTO orders (user_id) VALUES (?)", [userId]).run();
   *     return tx.query("SELECT last_insert_rowid()").run();
   *   })
   * ).run();
   * ```
   */
  static withConnection<R, E>(
    connector: DBConnector,
    fn: (db: DB) => Task<R, E>,
  ): Task<R, E | ConnectionFailed> {
    return Task.acquireRelease({
      acquire: (signal) =>
        connector.connect(signal).catch((error) => {
          throw new ConnectionFailed(
            error instanceof Error ? error.message : String(error),
          )
        }),
      release: (adapter) => adapter.close(),
      use: (adapter) => fn(new DB(adapter)),
    })
  }

  /**
   * Execute a SELECT query and return rows.
   * @example
   * const users = await db.query("SELECT * FROM users").run();
   */
  // deno-lint-ignore no-explicit-any
  query<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Task<T[], QueryFailed | ConstraintViolation> {
    return Task.of(async () => {
      try {
        return await this.adapter.query<T>(sql, params)
      } catch (error) {
        if (error instanceof Error && error.message.includes('constraint')) {
          throw new ConstraintViolation(sql, error.message)
        }
        throw new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }

  /**
   * Execute INSERT/UPDATE/DELETE and return affected row count.
   * @example
   * const affected = await db.execute("DELETE FROM users WHERE id = ?", [1]).run();
   */
  execute(
    sql: string,
    params?: unknown[],
  ): Task<number, QueryFailed | ConstraintViolation> {
    return Task.of(async () => {
      try {
        return await this.adapter.execute(sql, params)
      } catch (error) {
        if (error instanceof Error && error.message.includes('constraint')) {
          throw new ConstraintViolation(sql, error.message)
        }
        throw new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }

  /**
   * Stream rows from a SELECT query for memory-efficient processing.
   *
   * If the adapter supports cursor-based streaming (via the optional stream method),
   * rows are yielded one at a time. Otherwise, the full result set is buffered
   * in memory before streaming.
   *
   * @example
   * const { successes, errors } = await db.stream("SELECT * FROM users").partition();
   */
  // deno-lint-ignore no-explicit-any
  stream<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Source<T, QueryFailed> {
    const adapter = this.adapter
    return Source.from<T, QueryFailed>(async function* () {
      try {
        if (adapter.stream) {
          yield* adapter.stream<T>(sql, params)
        } else {
          const results = await adapter.query<T>(sql, params)
          for (const row of results) {
            yield row
          }
        }
      } catch (error) {
        throw new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }

  withTransaction<R>(
    fn: (tx: DBTransaction) => Promisable<R>,
  ): Task<R, TransactionFailed | QueryFailed | ConstraintViolation> {
    return Task.acquireRelease<
      DBTransaction,
      R,
      TransactionFailed | QueryFailed | ConstraintViolation
    >({
      acquire: () => this.transaction().run(),
      release: (tx) => tx.rollback().run().catch(() => {}),
      use: (tx) =>
        Task.of<R, TransactionFailed | QueryFailed | ConstraintViolation>(
          () => {
            const result = fn(tx)
            return result instanceof Promise ? result : Promise.resolve(result)
          },
        ).flatMap((result) => tx.commit().map(() => result)),
    })
  }

  private transaction(): Task<DBTransaction, TransactionFailed> {
    return Task.of(async () => {
      await this.adapter.execute('BEGIN')
      return new DBTransaction({
        query: (sql, params) => this.adapter.query(sql, params),
        execute: (sql, params) => this.adapter.execute(sql, params),
        commit: () => this.adapter.execute('COMMIT').then(() => {}),
        rollback: () => this.adapter.execute('ROLLBACK').then(() => {}),
      })
    }).mapErr((error) =>
      new TransactionFailed(
        error instanceof Error ? error.message : String(error),
      )
    )
  }
}

/** Database transaction with Task semantics. */
export class DBTransaction {
  private settled = false

  constructor(private readonly adapter: DBTransactionAdapter) {}

  query<T>(sql: string, params?: unknown[]): Task<T[], QueryFailed> {
    return Task.of(async () => {
      try {
        return await this.adapter.query(sql, params) as T[]
      } catch (error) {
        if (error instanceof Error && error.message.includes('constraint')) {
          throw new ConstraintViolation(sql, error.message)
        }
        throw new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }

  execute(sql: string, params?: unknown[]): Task<number, QueryFailed> {
    return Task.of(async () => {
      try {
        return await this.adapter.execute(sql, params)
      } catch (error) {
        if (error instanceof Error && error.message.includes('constraint')) {
          throw new ConstraintViolation(sql, error.message)
        }
        throw new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }

  commit(): Task<void, TransactionFailed> {
    return Task.of(async () => {
      try {
        await this.adapter.commit()
        this.settled = true
      } catch (error) {
        throw new TransactionFailed(
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }

  rollback(): Task<void, TransactionFailed> {
    return Task.of(async () => {
      if (this.settled) return
      try {
        await this.adapter.rollback()
        this.settled = true
      } catch (error) {
        throw new TransactionFailed(
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }
}
