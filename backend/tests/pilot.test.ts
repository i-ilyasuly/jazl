// Пилот өлшеуі (Патша, 2026-11-27; 30-құжат): «Medeo-ға дейін бардыңыз ба?» сұрағы (бір мекемедегі бірінші пакетке ғана),
// жауап батырмасы (тек иесі, бір рет), 5 күндік «тегін ұзарту» ескертуі, /admin/pilot (екінші пакет, жаңа клиент, касса уақыты, арналар)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { Hono } from "hono";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeNotifier, type Msg } from "../src/notify.js";
import { botRoutes } from "../src/bot/handler.js";
import { webhookSecret, type TgCall } from "../src/bot/api.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Пилот өлшеуі", () => {
  const ADMIN = 7701;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: `${ADMIN}` });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let tok = "";
  const sent: Msg[] = [];
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const call: TgCall = async (method, body) => { calls.push({ method, body: body as Record<string, unknown> }); return { ok: true, result: true }; };
  const h = (id: number, extra: Record<string, string> = {}, sp?: string) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id }), ...(sp ? { start_param: sp } : {}) }, TOKEN), "Content-Type": "application/json", ...extra });
  let n = 0; const key = () => "pl-" + Date.now() + "-" + n++;
  const q = (s: string, p: unknown[] = []) => dbh.pool.query(s, p).then((r) => r.rows);
  const buy = async (id: number, slug = "doner", sp?: string) => (await (await app.request("/v1/purchases", { method: "POST", headers: h(id, {}, sp), body: JSON.stringify({ offerSlug: slug, method: "test", idempotencyKey: key() }) })).json()).pack.id as string;
  const A = () => h(ADMIN, { "X-Admin-Token": tok });
  const noon = new Date("2026-12-02T07:00:00Z"); // Алматы 12:00 — күндізгі хабар терезесі
  const bot = () => { const a = new Hono(); a.route("/bot", botRoutes(cfg, dbh.db, call)); return a; };
  const press = (from: number, data: string, messageId = 55) => bot().request("/bot/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": webhookSecret(cfg) },
    body: JSON.stringify({ update_id: Date.now(), callback_query: { id: "cb" + n++, from: { id: from }, message: { message_id: messageId, chat: { id: from } }, data } }) });

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await c.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
    app = createApp(cfg, dbh.db, { send: async (m) => { sent.push(m); } });
    tok = (await (await app.request("/v1/admin/pin", { method: "POST", headers: h(ADMIN), body: JSON.stringify({ pin: "582193", setup: true }) })).json()).token;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("бір мекемедегі бірінші пакеттен кейін — бір сұрақ (3 батырма, екі тілде), екінші пакетке — жоқ; жауап тек иесінен, бір рет", async () => {
    const notify = makeNotifier(dbh.db, async (m) => { sent.push(m); });
    const p1 = await buy(7711, "doner", "ad_sticker-bc1");
    await q("update app.packs set created_at = now() - interval '20 minutes' where id = $1", [p1]);
    const r = await notify.tick(noon);
    expect(r.priorAsked).toBe(1);
    const m = sent.filter((x) => x.chatId === 7711 && x.choices).at(-1)!;
    expect(m.text).toContain("Medeo-ға дейін барып па едің");
    expect(m.choices!.map((c) => c.data)).toEqual([`pv:${p1}:n`, `pv:${p1}:s`, `pv:${p1}:r`]);
    // Сол мекемеде екінші пакет — сұрақ қайталанбайды
    const p2 = await buy(7711, "doner");
    await q("update app.packs set created_at = now() - interval '20 minutes' where id = $1", [p2]);
    expect((await notify.tick(noon)).priorAsked).toBe(0);
    // Бөтен адам басса — жазылмайды; иесі басса — жазылады, хабар «рақмет»-ке ауысады; қайта басса — өзгермейді
    await press(7799, `pv:${p1}:r`);
    expect((await q("select prior_visit from app.packs where id = $1", [p1]))[0].prior_visit).toBeNull();
    await press(7711, `pv:${p1}:n`);
    expect((await q("select prior_visit from app.packs where id = $1", [p1]))[0].prior_visit).toBe("n");
    expect(calls.find((c) => c.method === "editMessageText" && c.body.message_id === 55)?.body.text).toMatch(/Рақмет/);
    await press(7711, `pv:${p1}:r`);
    expect((await q("select prior_visit from app.packs where id = $1", [p1]))[0].prior_visit).toBe("n");
  });

  it("мерзімге 5 күн қалғанда — тегін ұзарту ұсынысы (бір рет); тегін ұзарту қолданылған пакетке — жоқ", async () => {
    const notify = makeNotifier(dbh.db, async (m) => { sent.push(m); });
    const a = await buy(7721); const b = await buy(7722);
    await q("update app.packs set valid_until = now() + interval '4 days 12 hours' where id = any($1)", [[a, b]]);
    await q("update app.packs set free_extend_used = true where id = $1", [b]);
    const r = await notify.tick(noon);
    expect(r.expiry5).toBe(1);
    const m = sent.filter((x) => x.chatId === 7721).at(-1)!;
    expect(m.text).toContain("тегін 7 күнге ұзартуға болады");
    expect(m.button?.start).toBe(`pk_${a}`);
    expect(sent.some((x) => x.chatId === 7722 && x.text.includes("тегін 7 күнге"))).toBe(false);
    expect((await notify.tick(noon)).expiry5).toBe(0);
  });

  it("/admin/pilot: жаңа клиент үлесі, екінші пакет, касса уақыты (медиана, аяқталмаған), арналар; әкімші емеске — 403", async () => {
    // Екінші пакет: 7731 — бірінші пакеті 20 күн бұрын, тағы біреуін алды; 7732 — біреу ғана
    const x1 = await buy(7731); await buy(7731); const x2 = await buy(7732);
    await q("update app.packs set created_at = now() - interval '20 days' where id = any($1)", [[x1, x2]]);
    // Касса: 3 сәтті сеанс (6, 8, 30 с) және 1 бас тартылған
    const [br] = await q("select b.id from app.branches b join app.venues v on v.id = b.venue_id where v.slug = 'damdi' limit 1");
    const [u] = await q("select id from app.users where telegram_id = 7731");
    for (const sec of [6, 8, 30]) {
      const [rd] = await q("insert into app.redemptions (pack_id, branch_id, units) values ($1, $2, 1) returning id, created_at", [x1, br.id]);
      await q(`insert into app.qr_sessions (code, branch_id, units, created_by, redemption_id, expires_at, created_at) values ('1234', $1, 1, $2, $3, now() + interval '5 min', $4::timestamptz - make_interval(secs => $5))`, [br.id, u.id, rd.id, rd.created_at, sec]);
    }
    await q("insert into app.qr_sessions (code, branch_id, units, created_by, cancelled_at, expires_at) values ('9999', $1, 1, $2, now(), now() + interval '5 min')", [br.id, u.id]);
    const res = await app.request("/v1/admin/pilot?days=30", { headers: A() });
    expect(res.status).toBe(200);
    const p = (await res.json()).pilot;
    expect(p.newToVenue).toMatchObject({ answered: 1, first: 1, value: 100, grade: "pass" });
    expect(p.secondPack.matured).toBeGreaterThanOrEqual(2);
    expect(p.secondPack.repeat).toBeGreaterThanOrEqual(1);
    expect(p.till).toMatchObject({ done: 3, incomplete: 1, medianSec: 8 });
    expect(p.till.incompleteShare).toBe(25);
    expect(p.channels.find((c: { channel: string }) => c.channel === "ad_sticker-bc1")).toMatchObject({ users: 1, buyers: 1, repeat: 1 });
    expect(p.sales.packs).toBeGreaterThanOrEqual(5);
    expect((await app.request("/v1/admin/pilot", { headers: h(7711) })).status).toBe(403);
  });
});
