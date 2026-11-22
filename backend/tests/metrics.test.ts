// Метрикалар (Патша, 2026-11-22): клиенттің көзі бірінші кіргенде жазылады, баға тарихы, күндік сурет, қаржы жазбалары, /admin/metrics
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Метрикалар", () => {
  const ADMIN = 951;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: `${ADMIN}` });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let tok = "";
  const h = (id: number, extra: Record<string, string> = {}, sp?: string) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id }), ...(sp ? { start_param: sp } : {}) }, TOKEN), "Content-Type": "application/json", ...extra });
  let n = 0; const key = () => "m-" + Date.now() + "-" + n++;
  const q = (s: string, p: unknown[] = []) => dbh.pool.query(s, p).then((r) => r.rows);
  const A = () => h(ADMIN, { "X-Admin-Token": tok });

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await c.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
    app = createApp(cfg, dbh.db);
    tok = (await (await app.request("/v1/admin/pin", { method: "POST", headers: h(ADMIN), body: JSON.stringify({ pin: "582193", setup: true }) })).json()).token;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("клиенттің көзі тек бірінші кіргенде жазылады", async () => {
    await app.request("/v1/packs", { headers: h(961, {}, "ad_insta1") });
    await app.request("/v1/packs", { headers: h(961, {}, "offer_latte") }); // екінші рет — өзгермейді
    await app.request("/v1/packs", { headers: h(962) });
    const [a] = await q("select source, source_ref from app.users where telegram_id = 961");
    expect(a).toEqual({ source: "ad", source_ref: "insta1" });
    expect((await q("select source from app.users where telegram_id = 962"))[0].source).toBe("direct");
    await app.request("/v1/events", { method: "POST", headers: h(961), body: JSON.stringify({ events: [{ k: "open", m: { platform: "ios", sp: "ad" } }, { k: "search", ref: "кофе", m: { n: 0 } }] }) });
    expect((await q("select first_platform from app.users where telegram_id = 961"))[0].first_platform).toBe("ios");
  });

  it("ұсыныс бағасының тарихы жазылады", async () => {
    const before = Number((await q("select count(*) from app.offer_price_log"))[0].count);
    expect(before).toBeGreaterThan(0); // бар ұсыныстар — тарихтың басы
    await q("update app.offers set price = price + 100 where slug = 'doner'");
    await q("update app.offers set title = title where slug = 'doner'"); // баға өзгермеді — жазылмайды
    expect(Number((await q("select count(*) from app.offer_price_log"))[0].count)).toBe(before + 1);
  });

  it("қаржы жазбасы қосылады, өшіріледі; метрикалар есептеледі", async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await (await app.request("/v1/purchases", { method: "POST", headers: h(961), body: JSON.stringify({ offerSlug: "doner", idempotencyKey: key() }) })).json()).ok).toBe(true);
    const add = (b: object) => app.request("/v1/admin/finance", { method: "POST", headers: A(), body: JSON.stringify(b) });
    expect((await add({ kind: "marketing", category: "Instagram", amount: 5000, day: today })).status).toBe(200);
    expect((await add({ kind: "cash", category: "Касса", amount: 300000, day: today })).status).toBe(200);
    const c = await (await add({ kind: "cost", category: "Сервер", amount: 20000, day: today })).json();
    expect((await add({ kind: "hack", category: "x", amount: 1, day: today })).status).toBe(400);
    expect((await (await app.request("/v1/admin/finance", { headers: A() })).json()).entries).toHaveLength(3);
    const m = (await (await app.request("/v1/admin/metrics?days=30", { headers: A() })).json()).metrics;
    expect(m.growth.gmv).toBeGreaterThan(0);
    expect(m.growth.newBuyers).toBe(1);
    expect(m.unit.cac).toBe(5000);
    expect(m.finance.cash).toBe(300000);
    expect(m.finance.burn30).toBe(25000);
    expect(m.finance.runway).toBe(12);
    expect(m.acquisition.campaigns[0]).toMatchObject({ ref: "insta1", users: 1, buyers: 1 });
    expect(m.demand.searches[0]).toMatchObject({ q: "кофе", zero: 1 });
    expect(m.usage.liability).toBeGreaterThan(0);
    expect(m.snapshots.length).toBe(1);
    expect((await app.request(`/v1/admin/finance/${c.id}/delete`, { method: "POST", headers: A() })).status).toBe(200);
    expect((await app.request("/v1/admin/metrics", { headers: h(961) })).status).toBe(403);
  });
});

d("Looker Studio көріністері (bi)", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>;
  beforeAll(async () => { await runMigrations(URL!, "disable"); dbh = createDb(cfg); });
  afterAll(async () => { await dbh?.pool.end(); });
  it("барлық көрініс оқылады, жеке дерек бағандары жоқ, looker_ro тек bi-ді көреді", async () => {
    const views = (await dbh.pool.query("select table_name from information_schema.views where table_schema = 'bi' order by 1")).rows.map((r) => r.table_name);
    expect(views.length).toBeGreaterThanOrEqual(17);
    const facts = (await dbh.pool.query("select fact, count(*)::int as n from bi.facts group by 1")).rows;
    expect(facts.map((r) => r.fact)).toEqual(expect.arrayContaining(["user", "pack", "event", "finance", "snapshot"]));
    for (const v of views) await dbh.pool.query(`select * from bi.${v} limit 5`);
    const cols = (await dbh.pool.query("select column_name from information_schema.columns where table_schema = 'bi'")).rows.map((r) => r.column_name);
    for (const bad of ["first_name", "last_name", "username", "phone", "telegram_id", "pin_hash", "text", "photo_url"]) expect(cols).not.toContain(bad);
    const c = await dbh.pool.connect();
    try {
      await c.query("set role looker_ro");
      expect((await c.query("select count(*) from bi.daily")).rows[0].count).toBeDefined();
      await expect(c.query("select * from app.users limit 1")).rejects.toThrow(/permission denied/);
    } finally { await c.query("reset role"); c.release(); }
  });
});
