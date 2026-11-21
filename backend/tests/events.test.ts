// Мини апп оқиғалары: воронка (open → view → buy_start) және қателер; жеке дерек кетпейді; тек админге көрінеді
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

d("Мини апп оқиғалары", () => {
  const ADMIN = 911, A1 = 912, A2 = 913;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: `${ADMIN}` });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let tok = "";
  const h = (id: number, extra: Record<string, string> = {}) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id }) }, TOKEN), "Content-Type": "application/json", ...extra });
  const send = (id: number, events: object[]) => app.request("/v1/events", { method: "POST", headers: h(id), body: JSON.stringify({ events }) });

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await c.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
    app = createApp(cfg, dbh.db);
    tok = (await (await app.request("/v1/admin/pin", { method: "POST", headers: h(ADMIN), body: JSON.stringify({ pin: "582193", setup: true }) })).json()).token;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("қабылдайды, бұрыс түрін қабылдамайды, кірусіз — 401", async () => {
    expect((await send(A1, [{ k: "open" }, { k: "view", ref: "americano" }, { k: "buy_start", ref: "americano" }])).status).toBe(200);
    expect((await send(A2, [{ k: "open" }, { k: "view", ref: "americano" }])).status).toBe(200);
    expect((await send(A1, [{ k: "hack" }])).status).toBe(400);
    expect((await send(A1, Array.from({ length: 21 }, () => ({ k: "open" })))).status).toBe(400);
    expect((await app.request("/v1/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [{ k: "open" }] }) })).status).toBe(401);
  });

  it("қатедегі сілтеме параметрлері (initData) және белгісіз өрістер сақталмайды", async () => {
    await send(A1, [{ k: "error", m: { msg: "TypeError at https://app.example/x?tgWebAppData=user%3Dsecret#hash", route: "/offer/latte", phone: "+77001234567", ver: "1.2" } }]);
    const row = (await dbh.pool.query("select meta from app.client_events where kind = 'error'")).rows[0].meta;
    expect(row.msg).toBe("TypeError at https://app.example/x");
    expect(row.phone).toBeUndefined();
    expect(row).toMatchObject({ route: "/offer/latte", ver: "1.2" });
  });

  it("воронка мен қателер — тек админге", async () => {
    const H = h(ADMIN, { "X-Admin-Token": tok });
    expect((await app.request("/v1/admin/funnel", { headers: h(A1) })).status).toBe(403);
    const f = await (await app.request("/v1/admin/funnel?days=7", { headers: H })).json();
    expect(f.funnel).toMatchObject({ opened: 2, viewed: 2, started: 1, bought: 0, used: 0, repeat: 0 });
    expect(f.top[0]).toMatchObject({ slug: "americano", viewers: 2, buyers: 0 });
    const e = await (await app.request("/v1/admin/errors", { headers: H })).json();
    expect(e).toMatchObject({ day: 1, dayUsers: 1 });
    expect(e.items[0]).toMatchObject({ msg: "TypeError at https://app.example/x", n: 1, users: 1, route: "/offer/latte" });
    const p = await (await app.request("/v1/admin/pulse", { headers: H })).json();
    expect(p.attention.app_errors).toBe(1);
  });
});
