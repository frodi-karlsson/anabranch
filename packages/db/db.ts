import { type Promisable, Source, Task } from '@anabranch/anabranch'
import type { DBAdapter, DBConnector, DBTransactionAdapter } from './adapter.ts'
import {
  ConnectionFailed,
  ConstraintViolation,
  DBError,
  QueryFailed,
  TransactionFailed,
} from './errors.ts'

const transactionDepths = new WeakMap<DBAdapter, number>()

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
          if (error instanceof ConnectionFailed) throw error
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
    return Task.of(async () => await this.adapter.query<T>(sql, params))
      .mapErr((error) => {
        if (
          error instanceof QueryFailed || error instanceof ConstraintViolation
        ) {
          return error
        }
        return new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
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
    return Task.of(async () => await this.adapter.execute(sql, params))
      .mapErr((error) => {
        if (
          error instanceof QueryFailed || error instanceof ConstraintViolation
        ) {
          return error
        }
        return new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      })
  }

  /**
   * Execute multiple commands in a batch.
   * Leverages optimized adapter method if available.
   */
  executeBatch(
    sql: string,
    paramsArray: unknown[][],
  ): Task<number[], QueryFailed | ConstraintViolation> {
    return Task.of(async () =>
      await this.adapter.executeBatch(sql, paramsArray)
    )
      .mapErr((error) => {
        if (
          error instanceof QueryFailed || error instanceof ConstraintViolation
        ) {
          return error
        }
        return new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
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
        if (error instanceof QueryFailed) throw error
        throw new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
  }

  /**
   * Execute a callback within a transaction.
   * Supports nested transactions via SQL savepoints.
   */
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
          async () => {
            return await fn(tx)
          },
        ).flatMap((result) => tx.commit().map(() => result)),
    })
  }

  private transaction(): Task<DBTransaction, TransactionFailed> {
    return Task.of(async () => {
      const depth = transactionDepths.get(this.adapter) ?? 0
      const isNested = depth > 0
      const savepoint = `sp_${depth}`

      if (isNested) {
        await this.adapter.execute(`SAVEPOINT ${savepoint}`)
      } else {
        await this.adapter.execute('BEGIN')
      }
      transactionDepths.set(this.adapter, depth + 1)

      return new DBTransaction(
        {
          query: (sql, params) => this.adapter.query(sql, params),
          execute: (sql, params) => this.adapter.execute(sql, params),
          executeBatch: (sql, paramsArray) =>
            this.adapter.executeBatch(sql, paramsArray),
          commit: async () => {
            if (isNested) {
              await this.adapter.execute(`RELEASE SAVEPOINT ${savepoint}`)
            } else {
              await this.adapter.execute('COMMIT')
            }
          },
          rollback: async () => {
            if (isNested) {
              await this.adapter.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`)
            } else {
              await this.adapter.execute('ROLLBACK')
            }
          },
        },
        this.adapter,
        this,
      )
    }).mapErr((error) => {
      if (error instanceof TransactionFailed) return error
      return new TransactionFailed(
        error instanceof Error ? error.message : String(error),
      )
    })
  }
}

/** Database transaction with Task semantics. */
export class DBTransaction {
  private settled = false

  constructor(
    private readonly adapter: DBTransactionAdapter,
    private readonly rawAdapter: DBAdapter,
    private readonly db: DB,
  ) {}

  query<T>(
    sql: string,
    params?: unknown[],
  ): Task<T[], QueryFailed | ConstraintViolation> {
    return Task.of(async () => await this.adapter.query(sql, params) as T[])
      .mapErr((error) => {
        if (error instanceof DBError) {
          return error as QueryFailed | ConstraintViolation
        }
        return new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      })
  }

  execute(
    sql: string,
    params?: unknown[],
  ): Task<number, QueryFailed | ConstraintViolation> {
    return Task.of(async () => await this.adapter.execute(sql, params))
      .mapErr((error) => {
        if (error instanceof DBError) {
          return error as QueryFailed | ConstraintViolation
        }
        return new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      })
  }

  executeBatch(
    sql: string,
    paramsArray: unknown[][],
  ): Task<number[], QueryFailed | ConstraintViolation> {
    return Task.of(async () =>
      await this.adapter.executeBatch(sql, paramsArray)
    )
      .mapErr((error) => {
        if (error instanceof DBError) {
          return error as QueryFailed | ConstraintViolation
        }
        return new QueryFailed(
          sql,
          error instanceof Error ? error.message : String(error),
        )
      })
  }

  /**
   * Execute a callback within a nested transaction (savepoint).
   */
  withTransaction<R>(
    fn: (tx: DBTransaction) => Promisable<R>,
  ): Task<R, TransactionFailed | QueryFailed | ConstraintViolation> {
    return this.db.withTransaction(fn)
  }

  commit(): Task<void, TransactionFailed> {
    return Task.of(async () => {
      await this.adapter.commit()
      this.settled = true
      const depth = transactionDepths.get(this.rawAdapter) ?? 1
      transactionDepths.set(this.rawAdapter, depth - 1)
    }).mapErr((error) => {
      if (error instanceof TransactionFailed) return error
      return new TransactionFailed(
        error instanceof Error ? error.message : String(error),
      )
    })
  }

  rollback(): Task<void, TransactionFailed> {
    return Task.of(async () => {
      if (this.settled) return
      await this.adapter.rollback()
      this.settled = true
      const depth = transactionDepths.get(this.rawAdapter) ?? 1
      transactionDepths.set(this.rawAdapter, depth - 1)
    }).mapErr((error) => {
      if (error instanceof TransactionFailed) return error
      return new TransactionFailed(
        error instanceof Error ? error.message : String(error),
      )
    })
  }
}
