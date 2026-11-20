// Қауіпсіздік аудиті (Алтай, 2026-11-21): бөлек қолтаңба кілті, сұраныс шегі, серверлік клиент PIN-і,
// админ PIN 6 таңба (ескі 4 таңбаны ауыстыру), нақты режимде сынақ вебхугы жабық
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeDynamicQr, parseQr } from "../src/qr.js";
import { verifyKeys, signKey, safeEqual } from "../src/secret.js";
import { resetRateLimits } from "../src/rateLimit.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const SECRET = "s".repeat(40);
const d = URL ? describe : describe.skip;
const base = { DATABASE_URL: "postgres://x@localhost/x", BOT_TOKEN: TOKEN, DB_SSL: "disable" as const, NODE_ENV: "test" as const };

describe("бөлек қолтаңба кілті (APP_SECRET)", () => {
  const branch = "11111111-2222-3333-4444-555555555555";
  it("APP_SECRET жоқ — бұрынғыдай бот токені", () => {
    const cfg = loadConfig(base);
    expect(signKey(cfg)).toBe(TOKEN);
    expect(verifyKeys(cfg)).toEqual([TOKEN]);
  });
  it("өтпелі кезеңде ескі QR жарайды, кейін — жоқ; жаңа кілтпен қойылғаны әрдайым жарайды", () => {
    const during = loadConfig({ ...base, APP_SECRET: SECRET, LEGACY_SIG_UNTIL: new Date(Date.now() + 3600_000).toISOString() });
    const after = loadConfig({ ...base, APP_SECRET: SECRET, LEGACY_SIG_UNTIL: new Date(Date.now() - 1000).toISOString() });
    const old = makeDynamicQr(TOKEN, branch, 2).payload;
    const neu = makeDynamicQr(signKey(during), branch, 2).payload;
    expect(parseQr(old, verifyKeys(during))).toMatchObject({ valid: true });
    expect(parseQr(old, verifyKeys(after))).toMatchObject({ valid: false });
    expect(parseQr(neu, verifyKeys(after))).toMatchObject({ valid: true });
    expect(parseQr(neu, [TOKEN])).toMatchObject({ valid: false }); // бот токені тараса да жаңа QR жасай алмайды
  });
  it("safeEqual", () => { expect(safeEqual("abc", "abc")).toBe(true); expect(safeEqual("abc", "abd")).toBe(false); expect(safeEqual("a", "ab")).toBe(false); });
});

d("сервер: сұраныс шегі, клиент PIN, админ PIN, вебхук", () => {
  let dbh: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createApp>;
  let live: ReturnType<typeof createApp>;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: "700" });
  const h = (id: number, extra: Record<string, string> = {}) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" }) }, TOKEN), "Content-Type": "application/json", ...extra });
  const post = (a: typeof app, path: string, body: object, id: number, extra?: Record<string, string>) => a.request(path, { method: "POST", headers: h(id, extra), body: JSON.stringify(body) });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable");
    dbh = createDb(cfg); await seedCatalog(dbh.db);
    process.env.RATE_LIMIT = "1"; resetRateLimits();
    app = createApp(cfg, dbh.db);
    live = createApp({ ...cfg, PAYMENTS_MODE: "live" }, dbh.db);
  });
  afterAll(async () => { delete process.env.RATE_LIMIT; await dbh?.pool.end(); });

  it("касса коды: минутына 8 әрекеттен кейін 429", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 9; i++) codes.push((await post(app, "/v1/qr/code", { code: String(1000 + i) }, 801)).status);
    expect(codes.slice(0, 8).every((s) => s === 404)).toBe(true);
    expect(codes[8]).toBe(429);
  });

  it("клиент PIN: қойылған соң бірлік жұмсау токенсіз — pin_required; 5 қате — бұғат; дұрыс PIN — токен", async () => {
    const U = 802;
    expect((await post(app, "/v1/me/pin", { pin: "4821" }, U)).status).toBe(200);
    expect((await post(app, "/v1/me/pin", { pin: "1111" }, U)).status).toBe(409); // ауыстыру — ескісімен ғана
    const noTok = await post(app, "/v1/redeem", { packId: "00000000-0000-0000-0000-000000000000", qr: "xxxxx", idempotencyKey: "abcdefgh1" }, U);
    expect(noTok.status).toBe(403); expect((await noTok.json()).error).toBe("pin_required");
    const v = await (await post(app, "/v1/me/pin/verify", { pin: "4821" }, U)).json() as { pinToken: string };
    const withTok = await post(app, "/v1/redeem", { packId: "00000000-0000-0000-0000-000000000000", qr: "xxxxx", idempotencyKey: "abcdefgh2" }, U, { "X-Pin-Token": v.pinToken });
    expect(withTok.status).not.toBe(403);
    const other = await post(app, "/v1/redeem", { packId: "00000000-0000-0000-0000-000000000000", qr: "xxxxx", idempotencyKey: "abcdefgh3" }, 803, { "X-Pin-Token": v.pinToken });
    expect(other.status).not.toBe(403); // 803-те PIN жоқ — талап етілмейді
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await post(app, "/v1/me/pin/verify", { pin: "0000" }, U)).status;
    expect(last).toBe(423);
    expect((await post(app, "/v1/me/pin/verify", { pin: "4821" }, U)).status).toBe(423); // бұғат кезінде дұрысы да өтпейді
  });

  it("биометрия құпиясы: тек PIN токенімен беріледі, кейін PIN-сіз токен алады", async () => {
    const U = 804;
    const s = await (await post(app, "/v1/me/pin", { pin: "7351" }, U)).json() as { pinToken: string };
    expect((await post(app, "/v1/me/pin/bio", {}, U)).status).toBe(403);
    const b = await (await post(app, "/v1/me/pin/bio", {}, U, { "X-Pin-Token": s.pinToken })).json() as { bio: string };
    expect(b.bio).toHaveLength(64);
    expect((await post(app, "/v1/me/pin/verify", { bio: b.bio }, U)).status).toBe(200);
    expect((await post(app, "/v1/me/pin/verify", { bio: "f".repeat(64) }, U)).status).toBe(403);
  });

  it("админ: жаңа PIN тек 6 таңба; ескі 4 таңбалы PIN кіргізеді, upgrade сұрайды, ауыстырылады", async () => {
    expect((await (await post(app, "/v1/admin/pin", { pin: "5821", setup: true }, 700)).json()).error).toBe("weak_pin");
    // ескі пішім (4 таңба, белгісіз) — қолмен
    const { scryptSync, randomBytes } = await import("node:crypto");
    await post(app, "/v1/admin/me", {}, 700); await app.request("/v1/admin/me", { headers: h(700) });
    const salt = randomBytes(16);
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query(`update app.admins set pin_hash = $1 where user_id = (select id from app.users where telegram_id = 700)`, [`${salt.toString("hex")}:${scryptSync("5821", salt, 32).toString("hex")}`]);
    await c.end();
    const me = await (await app.request("/v1/admin/me", { headers: h(700) })).json() as { pinLen: number; upgrade: boolean };
    expect(me).toMatchObject({ pinLen: 4, upgrade: true });
    const r = await (await post(app, "/v1/admin/pin", { pin: "5821" }, 700)).json() as { token: string; upgrade: boolean };
    expect(r.upgrade).toBe(true);
    expect((await post(app, "/v1/admin/pin/change", { pin: "582193" }, 700)).status).toBe(401); // сеанссыз — жоқ
    expect((await post(app, "/v1/admin/pin/change", { pin: "582193" }, 700, { "X-Admin-Token": r.token })).status).toBe(200);
    const me2 = await (await app.request("/v1/admin/me", { headers: h(700) })).json() as { pinLen: number; upgrade: boolean };
    expect(me2).toMatchObject({ pinLen: 6, upgrade: false });
    expect((await post(app, "/v1/admin/pin", { pin: "5821" }, 700)).status).toBe(403);
    expect((await post(app, "/v1/admin/pin", { pin: "582193" }, 700)).status).toBe(200);
  });

  it("нақты режимде сынақ провайдерінің вебхугы жабық", async () => {
    expect((await live.request("/payments/webhook/test", { method: "POST", body: "{}" })).status).toBe(404);
  });
});
