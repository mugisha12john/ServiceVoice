import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { SQL } from "drizzle-orm";
import * as schema from "./schema";

const globals = globalThis as unknown as {
  feedbackPool?: Pool;
  feedbackDB?: NodePgDatabase<typeof schema>;
};
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  if (!globals.feedbackPool)
    globals.feedbackPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 20000,
    });
  return (globals.feedbackDB ??= drizzle(globals.feedbackPool, { schema }));
}
export type Executor = Pick<ReturnType<typeof getDb>, "execute">;
export async function query<T extends QueryResultRow>(
  statement: SQL,
  executor: Executor = getDb(),
): Promise<T[]> {
  return (await executor.execute(statement)).rows as T[];
}
export async function one<T extends QueryResultRow>(
  statement: SQL,
  executor?: Executor,
): Promise<T | undefined> {
  return (await query<T>(statement, executor))[0];
}
