import { readFile } from "node:fs/promises";
import pg from "pg";

// bigint columns come back as strings by default; every amount here fits safely in a JS number.
pg.types.setTypeParser(20, (value) => Number(value));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createDb(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

export async function migrate(db: Db): Promise<void> {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await db.query(sql);
}

/** Runs `fn` in one transaction; rolls back on any error. */
export async function inTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}
