// Бот хабарламалары (Figma «Бот хабарламалары (мекеме/клиент)»): тапсырыс, шағым, команда, пікір, өтінім, 22:00 қорытынды, мерзім ескертуі (TEST_DATABASE_URL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeNotifier, type Msg } from "../src/notify.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Бот хабарламалары", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", CRON_KEY: "cron-key-for-tests-only" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  const sent: Msg[] = [];
  const to = (tg: number) => sent.filter((m) => m.chatId === tg);
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id, last_name: "Тест" }) }, TOKEN), "Content-Type": "application/json" });
  const post = (path: string, body: object, id: number) => app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const json = async (r: Response | Promise<Response>) => (await r).json();
  let n = 0; const key = () => "k-" + Date.now() + "-" + n++;
  const buy = async (id: number) => (await json(post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, id))).pack.id as string;
  let venueId = ""; let branchId = "";
  const OWNER = 801, CASH = 802, CLIENT = 803;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
    app = createApp(cfg, dbh.db, { send: async (m) => { sent.push(m); } });
    await post("/v1/venue/dev-join", { venueSlug: "damdi" }, OWNER);
    const r = (await dbh.pool.query("select v.id as v, b.id as b from app.venues v join app.branches b on b.venue_id = v.id where v.slug='damdi' limit 1")).rows[0];
    venueId = r.v; branchId = r.b;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("кассир қосылуды сұрайды → иесіне; растаған соң → кассирге", async () => {
    const inv = await json(post(`/v1/venue/${venueId}/invites`, { role: "cashier" }, OWNER));
    await post("/v1/venue/join", { code: inv.code }, CASH);
    expect(to(OWNER).at(-1)?.text).toContain("командаға қосылуды сұрайды");
    expect(to(OWNER).at(-1)?.button?.start).toBe("v_team");
    const uid = (await dbh.pool.query("select id from app.users where telegram_id=$1", [CASH])).rows[0].id;
    await post(`/v1/venue/${venueId}/staff/${uid}/approve`, {}, OWNER);
    expect(to(CASH).at(-1)?.text).toContain("командасына қабылдады");
    const before = to(CASH).length;
    await post(`/v1/venue/${venueId}/staff/${uid}/approve`, {}, OWNER); // қайта растау — қайта хабар жоқ
    expect(to(CASH).length).toBe(before);
  });

  it("жаңа тапсырыс → иесі мен кассирге «Ашу» батырмасымен; дайын → клиентке код", async () => {
    const p = await buy(CLIENT);
    const o = await json(post("/v1/orders", { packId: p, type: "now", idempotencyKey: key() }, CLIENT));
    expect(o.ok).toBe(true);
    for (const tg of [OWNER, CASH]) {
      const m = to(tg).at(-1)!;
      expect(m.text).toMatch(/^🛒 Жаңа тапсырыс № \d+/);
      expect(m.button).toEqual({ text: "Ашу", start: `vo_${o.order.id}` });
    }
    expect(to(CLIENT).some((m) => m.text.startsWith("🛒"))).toBe(false);
    await post(`/v1/venue/orders/${o.order.id}/status`, { status: "ready" }, CASH);
    expect(to(CLIENT).at(-1)?.text).toContain(`дайын`);
    expect(to(CLIENT).at(-1)?.text).toContain(o.order.code);
  });

  it("баптау: «Жаңа тапсырыс» өшірілсе — кассирге келмейді", async () => {
    const prefs = (await json(app.request(`/v1/venue/${venueId}/prefs`, { headers: h(CASH) }))).prefs;
    expect(prefs.newOrder).toBe(true);
    await app.request(`/v1/venue/${venueId}/prefs`, { method: "PUT", headers: h(CASH), body: JSON.stringify({ ...prefs, newOrder: false }) });
    const before = to(CASH).length;
    const p = await buy(CLIENT);
    await post("/v1/orders", { packId: p, type: "now", idempotencyKey: key() }, CLIENT);
    expect(to(CASH).length).toBe(before);
    expect(to(OWNER).at(-1)?.text).toMatch(/^🛒/);
  });

  it("QR қолдану → клиентке «✅ Қолданылды»", async () => {
    const p = await buy(CLIENT);
    const r = await json(post("/v1/redeem", { packId: p, qr: "MDB1:" + branchId, idempotencyKey: key() }, CLIENT));
    expect(r.ok).toBe(true);
    expect(to(CLIENT).at(-1)?.text).toContain("✅ Қолданылды");
    expect(to(CLIENT).at(-1)?.text).toContain(r.receipt.no);
  });

  it("шағым → иесіне (кассирге емес); шешім → клиентке", async () => {
    const p = await buy(CLIENT);
    await post("/v1/redeem", { packId: p, qr: "MDB1:" + branchId, idempotencyKey: key() }, CLIENT);
    const cashBefore = to(CASH).length;
    const c = await json(post("/v1/complaints", { packId: p, reason: "Қате қолдану", text: "Мен бүгін келмедім" }, CLIENT));
    expect(to(OWNER).at(-1)?.text).toMatch(/^⚠️ Жаңа шағым: қате қолдану/);
    expect(to(OWNER).at(-1)?.button).toEqual({ text: "Қарау", start: `vc_${c.complaint.id}` });
    expect(to(CASH).length).toBe(cashBefore);
    await post(`/v1/venue/${venueId}/complaints/${c.complaint.id}/resolve`, { action: "refund", reply: "Кешіріңіз" }, OWNER);
    expect(to(CLIENT).at(-1)?.text).toContain("1 дана пакетіңізге қайтарылды");
    expect(to(CLIENT).at(-1)?.button?.start).toBe(`pk_${p}`);
  });

  it("пікір → иесіне", async () => {
    const p = await buy(CLIENT);
    // Баға тек қолданғаннан кейін (2026-11-18): бұрынғы күнгі бір қолдануды жазамыз (бүгінгі есептерге әсер етпеуі үшін)
    await dbh.pool.query("insert into app.redemptions (pack_id, branch_id, units, amount, fee_pct, created_at) select p.id, b.id, 1, 0, 10, now() - interval '3 days' from app.packs p join app.offers o on o.id = p.offer_id join app.branches b on b.venue_id = o.venue_id where p.id = $1 limit 1", [p]);
    await post("/v1/ratings", { packId: p, stars: 4, tags: ["Дәмді"] }, CLIENT);
    expect(to(OWNER).at(-1)?.text).toBe("⭐ Жаңа пікір: ★★★★☆ — «Дәмді»");
  });

  it("/cron/tick: кілтсіз — 404; 22:00 қорытынды бір рет; мерзім ескертуі бір рет; өтінім нәтижесі", async () => {
    expect((await app.request("/cron/tick", { method: "POST" })).status).toBe(404);
    expect((await app.request("/cron/tick", { method: "POST", headers: { "X-Cron-Key": "wrong-key-wrong-key" } })).status).toBe(404);
    const ok = await app.request("/cron/tick", { method: "POST", headers: { "X-Cron-Key": "cron-key-for-tests-only" } });
    expect(ok.status).toBe(200);

    const notifier = makeNotifier(dbh.db, async (m) => { sent.push(m); });
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
    const at22 = new Date(`${today}T22:30:00+05:00`);
    const r1 = await notifier.tick(at22);
    expect(r1.daily).toBeGreaterThanOrEqual(1);
    const daily = to(OWNER).filter((m) => m.text.startsWith("📊 Бүгінгі қорытынды"));
    expect(daily.length).toBe(1);
    expect(daily[0].button?.start).toBe("v_report");
    expect(to(CASH).some((m) => m.text.startsWith("📊"))).toBe(false); // қорытынды тек иесіне
    expect((await notifier.tick(at22)).daily).toBe(0);

    const p = await buy(CLIENT);
    await dbh.pool.query("update app.packs set valid_until = now() + interval '2 days 12 hours' where id = $1", [p]);
    const at12 = new Date(`${today}T12:00:00+05:00`);
    await notifier.tick(at12);
    expect(to(CLIENT).at(-1)?.text).toMatch(/^⏰ «.+» пакетінің мерзімі 3 күннен кейін бітеді/);
    const before = to(CLIENT).length;
    await notifier.tick(at12);
    expect(to(CLIENT).length).toBe(before);

    // Өтінім: дерекқорда қолмен «need_info» қойылса да — бір рет хабар
    const uid = (await dbh.pool.query("select id from app.users where telegram_id=$1", [CLIENT])).rows[0].id;
    await dbh.pool.query("insert into app.venue_applications (user_id, status, note, data, submitted_at) values ($1, 'need_info', 'БСН анықтамасы оқылмайды', '{\"name\":\"Тест кафе\"}', now())", [uid]);
    expect((await notifier.tick(at12)).applications).toBe(1);
    expect(to(CLIENT).at(-1)?.text).toBe("✏️ Өтінімге түзету керек: БСН анықтамасы оқылмайды");
    expect((await notifier.tick(at12)).applications).toBe(0);
  });

  it("клиент «Мерзім ескертулері» өшірсе — ескерту келмейді; басқа баптаулар сақталады", async () => {
    await app.request("/v1/me", { method: "PATCH", headers: h(CLIENT), body: JSON.stringify({ notify: { promo: true } }) });
    await app.request("/v1/me", { method: "PATCH", headers: h(CLIENT), body: JSON.stringify({ notify: { expiry: false } }) });
    expect((await dbh.pool.query("select notify from app.users where telegram_id=$1", [CLIENT])).rows[0].notify).toEqual({ promo: true, expiry: false });
    const p = await buy(CLIENT);
    await dbh.pool.query("update app.packs set valid_until = now() + interval '2 days 12 hours' where id = $1", [p]);
    const before = to(CLIENT).length;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
    await makeNotifier(dbh.db, async (m) => { sent.push(m); }).tick(new Date(`${today}T12:00:00+05:00`));
    expect(to(CLIENT).length).toBe(before);
  });
  it("орыс тілі: users.lang = ru алушыға хабар орысша, батырма да орысша (PATCH /v1/me)", async () => {
    const RU = 804;
    await app.request("/v1/me", { method: "PATCH", headers: h(RU), body: JSON.stringify({ lang: "ru" }) });
    const p = await buy(RU);
    const o = await json(post("/v1/orders", { packId: p, type: "now", idempotencyKey: key() }, RU));
    await post(`/v1/venue/orders/${o.order.id}/status`, { status: "ready" }, CASH);
    const m = to(RU).at(-1)!;
    expect(m.text).toMatch(/^🍽 Заказ № \d+ готов/);
    expect(m.button?.text).toBe("Открыть пакет");
    // Мекеме иесі орыс тілін таңдаса — жаңа тапсырыс туралы хабар орысша
    await dbh.pool.query("update app.users set lang = 'ru' where telegram_id = $1", [OWNER]);
    await json(post("/v1/orders", { packId: p, type: "now", idempotencyKey: key() }, RU));
    expect(to(OWNER).at(-1)?.text).toMatch(/^🛒 Новый заказ № \d+/);
    expect(to(CASH).at(-1)?.text).toMatch(/^🛒 Жаңа тапсырыс № \d+/); // кассир — қазақша
    await dbh.pool.query("update app.users set lang = 'kk' where telegram_id = $1", [OWNER]);
  });
});
