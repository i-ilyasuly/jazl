// Жергілікті PostgreSQL-ға қарсы: TEST_DATABASE_URL (мысалы postgres://postgres@127.0.0.1:5433/jazl_test).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { seedCatalog } from "../src/db/seed.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("API", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", ALLOWED_ORIGINS: "https://miniapp.example", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>;
  const auth = (id = 42, name = "Айгерім") => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name }) }, TOKEN) });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL });
    await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade; drop table if exists public.users");
    // Ескі боттың кестесі (public.users) — жаңа құрылым оған тимеуі керек
    await admin.query("create table public.users (id serial primary key, telegram_id bigint unique, first_name text); insert into public.users (telegram_id, first_name) values (1, 'bot')");
    await admin.end();
    await runMigrations(URL!, "disable");
    dbh = createDb(cfg);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("/health", async () => {
    const res = await createApp(cfg, dbh.db).request("/health");
    expect(res.status).toBe(200);
  });
  it("initData-сыз /v1/me — 401", async () => {
    const res = await createApp(cfg, dbh.db).request("/v1/me");
    expect(res.status).toBe(401);
  });
  it("бөтен токенмен — 401", async () => {
    const raw = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 1, first_name: "x" }) }, "1:OTHER");
    const res = await createApp(cfg, dbh.db).request("/v1/me", { headers: { Authorization: "tma " + raw } });
    expect(res.status).toBe(401);
  });
  it("мини апп басқа ботта ашылса: MINIAPP_BOT_TOKEN-мен қол қойылғаны да өтеді", async () => {
    const cfg2 = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, MINIAPP_BOT_TOKEN: "777:MINIAPP", DB_SSL: "disable", NODE_ENV: "test" });
    const raw = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 77, first_name: "Мини" }) }, "777:MINIAPP");
    const res = await createApp(cfg2, dbh.db).request("/v1/me", { headers: { Authorization: "tma " + raw } });
    expect(res.status).toBe(200);
  });
  it("кіру: пайдаланушы бір рет жазылады, аты жаңарады", async () => {
    const appx = createApp(cfg, dbh.db);
    const a = await (await appx.request("/v1/me", { headers: auth(42, "Айгерім") })).json();
    const b = await (await appx.request("/v1/me", { headers: auth(42, "Айгерім Н.") })).json();
    expect(a.user.id).toBe(b.user.id);
    expect(b.user.firstName).toBe("Айгерім Н.");
    const n = await dbh.pool.query("select count(*)::int as n from app.users where telegram_id = 42");
    expect(n.rows[0].n).toBe(1);
  });
  it("PATCH /v1/me: тіл мен қала; артық өріс — 400", async () => {
    const appx = createApp(cfg, dbh.db);
    const ok = await appx.request("/v1/me", { method: "PATCH", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ lang: "ru", city: "astana" }) });
    expect((await ok.json()).user).toMatchObject({ lang: "ru", city: "astana" });
    const bad = await appx.request("/v1/me", { method: "PATCH", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ pinHash: "x" }) });
    expect(bad.status).toBe(400);
  });
  it("CORS: тек рұқсат етілген мекенжай", async () => {
    const appx = createApp(cfg, dbh.db);
    const good = await appx.request("/v1/me", { method: "OPTIONS", headers: { Origin: "https://miniapp.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type,x-tg-platform,x-tg-version,x-app-version" } });
    expect(good.headers.get("access-control-allow-origin")).toBe("https://miniapp.example");
    expect(good.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-tg-platform"); // мини апп жіберетін тақырыптар рұқсат етілген
    const evil = await appx.request("/v1/me", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("B1 каталог: кірусіз ашық, seed екі рет іске қосылса да екі еселенбейді", async () => {
    await seedCatalog(dbh.db); await seedCatalog(dbh.db);
    const res = await createApp(cfg, dbh.db).request("/v1/catalog");
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.venues).toHaveLength(10);
    expect(j.offers).toHaveLength(11);
    const doner = j.offers.find((o: { slug: string }) => o.slug === "doner");
    expect(doner).toMatchObject({ venueSlug: "damdi", price: 6000, units: 4, regularUnitPrice: 2000, status: "active" });
    expect(j.venues.find((v: { slug: string }) => v.slug === "damdi").branches[0].address).toBe("Нұркен Әбдіров, 24");
    expect(j.offers.find((o: { slug: string }) => o.slug === "burger").status).toBe("ended");
  });
  it("ескі боттың public.users кестесі өзгеріссіз", async () => {
    const r = await dbh.pool.query("select first_name from public.users");
    expect(r.rows).toEqual([{ first_name: "bot" }]);
  });
});
