import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

// D1 is SQLite, so tests run the real migrations against Node's built-in SQLite.
const MIGRATIONS_DIR = new URL('../../../../migrations/', import.meta.url);

/** In-memory SQLite with all migrations applied and foreign keys on, as in D1. */
export function migrate(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }
  return db;
}

/** The subset of the D1 API the Worker uses, backed by node:sqlite. */
export function createTestD1(db: DatabaseSync = migrate()): D1Database {
  const prepare = (sql: string) => {
    let params: SQLInputValue[] = [];
    const statement = {
      bind(...values: SQLInputValue[]) {
        params = values;
        return statement;
      },
      async first<T>(): Promise<T | null> {
        return (db.prepare(sql).get(...params) as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...params) as T[], success: true, meta: {} };
      },
      async run() {
        const result = db.prepare(sql).run(...params);
        return { results: [], success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return statement;
  };
  type Statement = ReturnType<typeof prepare>;

  // D1 runs a batch as one transaction: all statements succeed or none do.
  const batch = async (statements: Statement[]) => {
    db.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      db.exec('COMMIT');
      return results;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
  return { prepare, batch } as unknown as D1Database;
}
