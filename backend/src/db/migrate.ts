// Миграцияларды іске қосу: npm run db:migrate (Cloud Run-ға шығармас бұрын, бөлек job ретінде).
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createDb } from "./client.js";

export async function runMigrations(url: string, ssl: "require" | "disable") {
  const { db, pool } = createDb({ DATABASE_URL: url, DB_SSL: ssl });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)), migrationsSchema: "app_migrations" });
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  await runMigrations(cfg.DATABASE_URL, cfg.DB_SSL);
  console.log("migrations: ok");
}
