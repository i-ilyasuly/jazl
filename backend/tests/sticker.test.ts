// Мекеме жапсырмасы: тұрақты филиал коды, /b/<код> бағыттағыш және санақ, жапсырма режимі, растау экранының дерегі
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { parseQr } from "../src/qr.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

describe("жапсырма QR-ын тану", () => {
  it("сервер сілтемесі де, Telegram сілтемесі де танылады", () => {
    expect(parseQr("https://medeo-api-1.europe-west3.run.app/b/7kq2ab", "k")).toEqual({ kind: "sticker", code: "7KQ2AB" });
    expect(parseQr("https://sqrl.kz/b/7KQ2?x=1", "k")).toEqual({ kind: "sticker", code: "7KQ2" });
    expect(parseQr("https://t.me/Mmedeo_bot?startapp=b_A1B2C3", "k")).toEqual({ kind: "sticker", code: "A1B2C3" });
    expect(parseQr("https://t.me/Mmedeo_bot?startapp=br_3f2c9a1e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "k")?.kind).toBe("static");
    expect(parseQr("https://evil.kz/b/../x", "k")).toBeNull();
  });
});

d("Мекеме жапсырмасы", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: "931" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let live: ReturnType<typeof createApp>;
  let code = ""; let venueId = "";
  const h = (id = 932, extra: Record<string, string> = {}) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" + id }) }, TOKEN), "Content-Type": "application/json", ...extra });
  let n = 0; const key = () => "s-" + Date.now() + "-" + n++;

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await c.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
    app = createApp(cfg, dbh.db);
    live = createApp(loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", PAYMENTS_MODE: "live" }), dbh.db);
    const r = (await dbh.pool.query("select b.sticker_code, v.id from app.branches b join app.venues v on v.id = b.venue_id where v.slug = 'damdi'")).rows[0];
    code = r.sticker_code; venueId = r.id;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("жаңа филиалдың өзінен-өзі коды болады", () => { expect(code).toMatch(/^[0-9A-F]{6}$/); });

  it("/b/<код> → Telegram Mini App, сканерлеу саналады", async () => {
    const res = await app.request(`/b/${code.toLowerCase()}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`https://t.me/Mmedeo_bot?startapp=b_${code}`);
    await new Promise((r) => setTimeout(r, 50));
    expect(Number((await dbh.pool.query("select count(*) from app.sticker_scans")).rows[0].count)).toBe(1);
    expect((await app.request("/b/ZZZZZZ")).headers.get("location")).toBe("https://t.me/Mmedeo_bot");
  });

  it("нақты режимде жапсырма режимі өшік болса — қабылданбайды, қосылса — қабылданады", async () => {
    const qr = `https://medeo-api.run.app/b/${code}`;
    const off = await live.request("/v1/qr/resolve", { method: "POST", headers: h(), body: JSON.stringify({ qr }) });
    expect((await off.json()).error).toBe("static_qr_disabled");
    await dbh.pool.query("update app.venues set sticker_enabled = true where id = $1", [venueId]);
    const on = await (await live.request("/v1/qr/resolve", { method: "POST", headers: h(), body: JSON.stringify({ qr }) })).json();
    expect(on).toMatchObject({ ok: true, sticker: true, kind: "static", venue: { slug: "damdi" } });
  });

  it("жапсырмамен қолдану: бірлік шегеріледі, растау экранына уақыт пен 5 минуттық мерзім келеді", async () => {
    const p = (await (await app.request("/v1/purchases", { method: "POST", headers: h(), body: JSON.stringify({ offerSlug: "doner", idempotencyKey: key() }) })).json()).pack.id;
    const r = await (await app.request("/v1/redeem", { method: "POST", headers: h(), body: JSON.stringify({ packId: p, qr: `https://t.me/Mmedeo_bot?startapp=b_${code}`, idempotencyKey: key() }) })).json();
    expect(r).toMatchObject({ ok: true, left: 3, confirm: { venue: expect.any(String) } });
    expect(new Date(r.confirm.until).getTime() - new Date(r.confirm.at).getTime()).toBe(5 * 60_000);
  });

  it("Басқару: филиалдар тізімі сілтемесімен және санағымен, режимді қосу/өшіру", async () => {
    const tok = (await (await app.request("/v1/admin/pin", { method: "POST", headers: h(931), body: JSON.stringify({ pin: "582193", setup: true }) })).json()).token;
    const H = h(931, { "X-Admin-Token": tok });
    const s = await (await app.request(`/v1/admin/venues/${venueId}/stickers`, { headers: H })).json();
    expect(s.venue.enabled).toBe(true);
    expect(s.branches[0]).toMatchObject({ code, scans30: 1, uses30: 1, url: expect.stringMatching(new RegExp(`/b/${code}$`)) });
    const off = await (await app.request(`/v1/admin/venues/${venueId}/stickers`, { method: "POST", headers: H, body: JSON.stringify({ enabled: false }) })).json();
    expect(off).toEqual({ ok: true, enabled: false });
    expect((await app.request(`/v1/admin/venues/${venueId}/stickers`, { headers: h(932) })).status).toBe(403);
  });
});
