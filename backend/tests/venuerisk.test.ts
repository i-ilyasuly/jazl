// Мекеме тәуекелі (Патша, 2026-11-28; 32-құжат): қабылдау шарттары (2ГИС ≥ 4,3, ≥ 6 ай, бос сағат), бір мекемедегі міндеттеме шегі,
// мекеме иесіне ай сайынғы «Medeo клиенті пакетсіз қайта келе ме» сұрағы және /admin/pilot-тағы жауабы
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
import { admission } from "../src/routes/apply.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Мекеме тәуекелі", () => {
  const ADMIN = 7801;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: `${ADMIN}` });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let tok = "";
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const call: TgCall = async (method, body) => { calls.push({ method, body: body as Record<string, unknown> }); return { ok: true, result: true }; };
  const h = (id: number, extra: Record<string, string> = {}) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id }) }, TOKEN), "Content-Type": "application/json", ...extra });
  const A = () => h(ADMIN, { "X-Admin-Token": tok });
  let n = 0; const key = () => "vr-" + Date.now() + "-" + n++;
  const q = (s: string, p: unknown[] = []) => dbh.pool.query(s, p).then((r) => r.rows);
  const buy = (id: number, slug = "doner") => app.request("/v1/purchases", { method: "POST", headers: h(id), body: JSON.stringify({ offerSlug: slug, method: "test", idempotencyKey: key() }) });
  const bot = () => { const a = new Hono(); a.route("/bot", botRoutes(cfg, dbh.db, call)); return a; };
  const noon = new Date("2026-12-02T07:00:00Z");

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await c.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
    app = createApp(cfg, dbh.db, { send: async () => undefined });
    tok = (await (await app.request("/v1/admin/pin", { method: "POST", headers: h(ADMIN), body: JSON.stringify({ pin: "582193", setup: true }) })).json()).token;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("қабылдау шарттары: 4,1★ және 3 ай → бекіту 409 (себебімен ғана); бос сағат жоқ — шарт орындалмайды", async () => {
    const rules = { admitMinRating: 4.3, admitMinMonths: 6 };
    const now = new Date("2026-11-28T00:00:00Z");
    expect(admission({ rating2gis: 4.6, opened: "2025-01", quietHours: "15–18" }, rules, now).ok).toBe(true);
    const bad = admission({ rating2gis: 4.1, opened: "2026-09", quietHours: "" }, rules, now);
    expect(bad.ok).toBe(false); expect(bad.checks.filter((x) => !x.ok).map((x) => x.key)).toEqual(["rating", "age", "quiet"]);
    const uid = (await q("insert into app.users (telegram_id, first_name) values (7811, 'Жаңа') returning id"))[0].id;
    const appId = (await q(`insert into app.venue_applications (user_id, status, data, submitted_at) values ($1, 'review', $2, now()) returning id`,
      [uid, JSON.stringify({ kind: "coffee", name: "Жас кофе", legalName: "ЖК «Жас»", bin: "910412300518", iban: "KZ12722S000012345678", branches: [{ address: "Ерубаев 1", open: "08:00", close: "21:00" }],
        pos: "none", opened: new Date().toISOString().slice(0, 7), rating2gis: 4.1, quietHours: "", monthlyRevenue: 2000000, otherFinancing: true })]))[0].id;
    const one = (await (await app.request(`/v1/admin/applications/${appId}`, { headers: A() })).json()).application;
    expect(one.admission.ok).toBe(false); expect(one.admission.warn).toMatch(/несие/);
    const r1 = await app.request(`/v1/admin/applications/${appId}/approve`, { method: "POST", headers: A(), body: "{}" });
    expect(r1.status).toBe(409); expect((await r1.json()).error).toBe("admission_failed");
    const r2 = await app.request(`/v1/admin/applications/${appId}/approve`, { method: "POST", headers: A(), body: JSON.stringify({ override: true, reason: "Желінің басқа нүктелері 4,8★" }) });
    expect(r2.status).toBe(200);
    const venueId = (await r2.json()).venueId;
    expect((await q("select monthly_revenue from app.venues where id = $1", [venueId]))[0].monthly_revenue).toBe(2000000);
    expect((await q("select meta from app.admin_log where action = 'Өтінім бекітілді' order by created_at desc limit 1"))[0]?.meta?.override).toBe("Желінің басқа нүктелері 4,8★");
  });

  it("міндеттеме шегі: жұмсалмаған бірліктер + жаңа пакет шектен асса — 409 venue_cap; Басқару картасында көрінеді; шекті көтерсе — сатылады", async () => {
    const [v] = await q("select id from app.venues where slug = 'damdi'");
    const price = (await q("select price from app.offers where slug = 'doner'"))[0].price as number;
    expect((await buy(7821)).status).toBe(200);
    await q("update app.venues set liability_cap = $1 where id = $2", [price + 10, v.id]);
    const r = await buy(7822);
    expect(r.status).toBe(409); expect((await r.json()).error).toBe("venue_cap");
    const card = (await (await app.request(`/v1/admin/venues/${v.id}`, { headers: A() })).json()).venue;
    expect(card.outstanding).toBeGreaterThanOrEqual(price); expect(card.liabilityCap).toBe(price + 10); expect(card.capCustom).toBe(true);
    await q("update app.venues set liability_cap = null, monthly_revenue = 100000000 where id = $1", [v.id]); // 10% = 10 млн
    expect((await buy(7822)).status).toBe(200);
  });

  it("мекеме иесіне айына бір сұрақ (жаңа клиенті болса), жауап тек иесінен, бір рет; /admin/pilot-та venueReturn", async () => {
    const [v] = await q("select id from app.venues where slug = 'damdi'");
    const owner = (await q("insert into app.users (telegram_id, first_name) values (7831, 'Иесі') returning id"))[0].id;
    await q("insert into app.venue_staff (venue_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing", [v.id, owner]);
    const pk = (await (await buy(7832)).json()).pack.id;
    await q("update app.packs set prior_visit = 'n', created_at = now() - interval '20 days' where id = $1", [pk]);
    const sent: Msg[] = [];
    const notify = makeNotifier(dbh.db, async (m) => { sent.push(m); });
    expect((await notify.tick(noon)).venueAsked).toBe(1);
    const m = sent.find((x) => x.chatId === 7831)!;
    expect(m.text).toContain("пакетсіз де");
    const fid = /^vf:([0-9a-f-]{36}):n$/.exec(m.choices![0].data)![1];
    expect((await notify.tick(noon)).venueAsked).toBe(0); // осы айда қайталанбайды
    const press = (from: number, data: string) => bot().request("/bot/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": webhookSecret(cfg) },
      body: JSON.stringify({ update_id: Date.now(), callback_query: { id: "cb" + n++, from: { id: from }, message: { message_id: 77, chat: { id: from } }, data } }) });
    await press(7899, `vf:${fid}:r`);
    expect((await q("select answer from app.venue_feedback where id = $1", [fid]))[0].answer).toBeNull();
    await press(7831, `vf:${fid}:s`);
    await press(7831, `vf:${fid}:n`);
    expect((await q("select answer from app.venue_feedback where id = $1", [fid]))[0].answer).toBe("s");
    const p = (await (await app.request("/v1/admin/pilot?days=30", { headers: A() })).json()).pilot;
    expect(p.venueReturn).toMatchObject({ asked: 1, answered: 1, sometimes: 1, value: 100 });
  });
});
