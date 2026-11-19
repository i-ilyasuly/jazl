// Қауіпсіздік тексерісі (2026-11-19): сынақ құралдары тек басқару иелеріне; нақты режимде ақшасыз «төленді» жолдары жабық
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { devToolsFor, loadConfig } from "../src/config.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

describe("сынақ құралдары кімге ашық", () => {
  const base = loadConfig({ DATABASE_URL: "postgres://x@localhost/x", BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "production", ADMIN_IDS: "111, 222" });
  it("өндірісте: тек ADMIN_IDS, тек сынақ режимінде", () => {
    expect(devToolsFor(base, 111)).toBe(true);
    expect(devToolsFor(base, 333)).toBe(false);
    expect(devToolsFor({ ...base, PAYMENTS_MODE: "live" }, 111)).toBe(false);
  });
});

d("нақты режим (live)", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", PAYMENTS_MODE: "live" });
  let dbh: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createApp>;
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" }) }, TOKEN), "Content-Type": "application/json" });
  let k = 0;
  const buy = (body: object) => app.request("/v1/purchases", { method: "POST", headers: h(950), body: JSON.stringify({ offerSlug: "doner", idempotencyKey: `sec-key-${++k}-abcdef`, ...body }) });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable");
    dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("Kaspi/сынақ әдісімен ақшасыз сатып алу — жабық, ештеңе жазылмайды", async () => {
    for (const method of ["kaspi", "test"]) {
      const r = await buy({ method });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("payment_method_unavailable");
    }
    expect((await dbh.pool.query("select count(*)::int n from app.payments")).rows[0].n).toBe(0);
    expect((await dbh.pool.query("select count(*)::int n from app.packs")).rows[0].n).toBe(0);
  });
  it("сынақ провайдерінің картасы (криптограмма) — жабық", async () => {
    const r = await buy({ method: "card", card: { cryptogram: "test-cryptogram-123" } });
    expect((await r.json()).error).toBe("payment_method_unavailable");
  });
  it("бонуссыз «бонуспен төлеймін» деп ақшасыз алу — жабық, бонус ұсталмайды", async () => {
    const r = await buy({ method: "test", useBonus: true });
    expect(r.status).toBe(400);
    expect((await dbh.pool.query("select count(*)::int n from app.payments")).rows[0].n).toBe(0);
  });
  it("өзіңді мекеме иесі ету (dev-join) — жабық", async () => {
    const r = await app.request("/v1/venue/dev-join", { method: "POST", headers: h(950), body: JSON.stringify({ venueSlug: "damdi" }) });
    expect(r.status).toBe(404);
    expect((await dbh.pool.query("select count(*)::int n from app.venue_staff")).rows[0].n).toBe(0);
  });
});
