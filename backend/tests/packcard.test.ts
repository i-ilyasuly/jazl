// Пакет картасы (Bot API 10.4 HTML widget): сатып алу → карта, қолдану → санақ жаңарады, мерзім → күй, қайталанбайды, жіберілмесе қайта сұралмайды
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import zlib from "node:zlib";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeDynamicQr } from "../src/qr.js";
import { packCardHtml } from "../src/bot/packCard.js";
import type { TgCall } from "../src/bot/api.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

describe("пакет картасының коды", () => {
  it("шектен әлдеқайда кіші (4096 байт сығылған), сыртқы ресурс жоқ, екі тілде", () => {
    for (const l of ["kk", "ru"] as const) {
      const h = packCardHtml(l, "Mmedeo_bot");
      expect(zlib.deflateSync(h, { level: 9 }).length).toBeLessThan(2500);
      expect(h).not.toMatch(/<script src|<link|@font-face|https?:\/\/(?!t\.me)/);
      expect(h).toContain("chatDataChanged");
    }
  });
});

d("Пакет картасы", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let damdi = "";
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let failSend = false; let mid = 500;
  const call: TgCall = async (method, body) => {
    calls.push({ method, body: body as Record<string, unknown> });
    if (method === "sendWidget") return failSend ? { ok: false, description: "Bad Request: method not found" } : { ok: true, result: { message_id: ++mid } };
    return { ok: true, result: true };
  };
  const h = (id = 9101) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "К" }) }, TOKEN), "Content-Type": "application/json" });
  const pj = async (p: string, b: object, id = 9101) => (await app.request(p, { method: "POST", headers: h(id), body: JSON.stringify(b) })).json();
  let n = 0; const key = () => "pc-" + Date.now() + "-" + n++;
  const tick = async () => { await new Promise((r) => setTimeout(r, 50)); };
  const of = (m: string) => calls.filter((c) => c.method === m);
  const state = (c: { body: Record<string, unknown> }) => JSON.parse(String(c.body.chat_data));

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db, { botCall: call });
    damdi = (await dbh.pool.query("select b.id from app.branches b join app.venues v on v.id = b.venue_id where v.slug = 'damdi'")).rows[0].id;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("сатып алу → клиентке карта (санақ 4/4, мәтін мен батырма ескі клиентке), қолдану → санақ 3/4, дыбыссыз", async () => {
    const pack = (await pj("/v1/purchases", { offerSlug: "doner", method: "test", idempotencyKey: key() })).pack.id;
    await tick();
    const sent = of("sendWidget");
    expect(sent).toHaveLength(1);
    expect(sent[0].body.chat_id).toBe(9101);
    expect(state(sent[0])).toMatchObject({ id: pack, l: 4, n: 4, s: "a" });
    expect(String(sent[0].body.caption)).toContain("Пакет картасы");
    expect(JSON.stringify(sent[0].body.reply_markup)).toContain(`startapp=pk_${pack}`);
    expect((await pj("/v1/redeem", { packId: pack, qr: makeDynamicQr(TOKEN, damdi, 1).payload, units: 1, idempotencyKey: key() })).ok).toBe(true);
    await tick();
    const ed = of("editMessageWidgetData");
    expect(ed).toHaveLength(1);
    expect(ed[0].body.message_id).toBe(mid);
    expect(state(ed[0])).toMatchObject({ l: 3, n: 4, s: "a" });
    // Қайта шақыру — өзгеріс жоқ: екінші карта да, артық жаңарту да жоқ
    const res = await app.request("/cron/tick", { method: "POST" });
    expect(res.status).toBe(404); // CRON_KEY жоқ — бірақ күйі өзгермеген, тексеру төменде sweep-пен
    expect(of("sendWidget")).toHaveLength(1);
  });

  it("жоспарлы тексеріс: мерзімі біткен пакет — карта «Мерзімі бітті» күйіне өтеді; жіберілмеген карта (-1) қайта сұралмайды", async () => {
    const c2 = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", CRON_KEY: "cron-key-1234567890" });
    const app2 = createApp(c2, dbh.db, { botCall: call });
    await dbh.pool.query("update app.packs set valid_until = now() - interval '1 hour' where widget_msg_id > 0");
    const r = await (await app2.request("/cron/tick", { method: "POST", headers: { "X-Cron-Key": "cron-key-1234567890" } })).json();
    expect(r.cards.updated).toBe(1);
    expect(state(of("editMessageWidgetData").at(-1)!)).toMatchObject({ s: "e" });
    failSend = true;
    const pack2 = (await pj("/v1/purchases", { offerSlug: "doner", method: "test", idempotencyKey: key() }, 9102)).pack.id;
    await tick();
    expect((await dbh.pool.query("select widget_msg_id from app.packs where id = $1", [pack2])).rows[0].widget_msg_id).toBe(-1);
    const before = of("sendWidget").length;
    await app2.request("/cron/tick", { method: "POST", headers: { "X-Cron-Key": "cron-key-1234567890" } });
    expect(of("sendWidget").length).toBe(before);
    failSend = false;
  });
});
