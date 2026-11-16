import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Config } from "../config.js";
import * as schema from "./schema.js";

export function createDb(cfg: Pick<Config, "DATABASE_URL" | "DB_SSL">) {
  // Cloud Run → Cloud SQL: Unix сокет (DATABASE_URL ішінде host=/cloudsql/...) немесе SSL арқылы.
  const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 5, ssl: cfg.DB_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  return { db: drizzle(pool, { schema }), pool };
}
export type Db = ReturnType<typeof createDb>["db"];
