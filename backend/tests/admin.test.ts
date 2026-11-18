// Medeo Басқару (Figma 14060:7998): кіру (ADMIN_IDS + PIN), пульс, өтінімдер, модерация, комиссия, тоқтату, шағым шешімі, пакеттер, техникалық жұмыстар, журнал
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData, signLoginWidget } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import type { Msg } from "../src/notify.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Medeo Басқару", () => {
  const ADMIN = 901, OTHER = 902, CLIENT = 903, OWNER = 904;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: `${ADMIN}, 999` });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  const sent: Msg[] = [];
  let tok = "";
  const h = (id: number, extra: Record<string, string> = {}) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id }) }, TOKEN), "Content-Type": "application/json", ...extra });
  const A = () => h(ADMIN, { "X-Admin-Token": tok });
  const get = (p: string, id = ADMIN) => app.request(p, { headers: id === ADMIN ? A() : h(id) });
  const post = (p: string, body: object, id = ADMIN) => app.request(p, { method: "POST", headers: id === ADMIN ? A() : h(id), body: JSON.stringify(body) });
  const json = async (r: Response | Promise<Response>) => (await r).json();
  let n = 0; const key = () => "k-" + Date.now() + "-" + n++;
  let venueId = ""; let branchId = "";

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

  it("кіру: тізімде жоқ — рұқсат жоқ (ID көрсетіледі); тізімдегі — PIN орнатады, токен алады", async () => {
    expect(await json(get("/v1/admin/me", OTHER))).toMatchObject({ admin: false, telegramId: OTHER });
    expect((await post("/v1/admin/pin", { pin: "5821", setup: true }, OTHER)).status).toBe(403);
    expect((await get("/v1/admin/pulse", OTHER)).status).toBe(403);
    expect(await json(app.request("/v1/admin/me", { headers: h(ADMIN) }))).toMatchObject({ admin: true, hasPin: false });
    expect((await app.request("/v1/admin/pulse", { headers: h(ADMIN) })).status).toBe(401); // токенсіз
    expect((await json(app.request("/v1/admin/pin", { method: "POST", headers: h(ADMIN), body: JSON.stringify({ pin: "1111", setup: true }) }))).error).toBe("weak_pin");
    const s = await json(app.request("/v1/admin/pin", { method: "POST", headers: h(ADMIN), body: JSON.stringify({ pin: "5821", setup: true }) }));
    expect(s.ok).toBe(true); tok = s.token;
    expect((await get("/v1/admin/pulse")).status).toBe(200);
    expect((await get("/v1/admin/pulse", OTHER)).status).toBe(403);
    // басқа адамның токенін қолдану — жарамсыз
    expect((await app.request("/v1/admin/pulse", { headers: h(OTHER, { "X-Admin-Token": tok }) })).status).toBe(403);
  });

  it("пульс: сатылым, комиссия, қолданылған бірлік, назар керек, тірі лента", async () => {
    const pk = (await json(post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, CLIENT))).pack;
    await post("/v1/redeem", { packId: pk.id, qr: "MDB1:" + branchId, idempotencyKey: key() }, CLIENT);
    const p = (await json(get("/v1/admin/pulse?period=today"))).pulse;
    expect(p.sales).toBeGreaterThan(0);
    expect(p.fee).toBe(Math.round(p.sales * 0.1));
    expect(p.packs).toBe(1); expect(p.units).toBe(1);
    expect(p.week).toHaveLength(7);
    expect(p.feed.map((x: { kind: string }) => x.kind)).toEqual(expect.arrayContaining(["buy", "use"]));
  });

  it("өтінім: тізім → түзетуге жіберу (мекемеге хабар) → қайта жіберсе бекіту → мекеме ашылды, журналда", async () => {
    const uid = (await dbh.pool.query("insert into app.users (telegram_id, first_name) values (905, 'Нан') returning id")).rows[0].id;
    const appId = (await dbh.pool.query(`insert into app.venue_applications (user_id, status, data, submitted_at) values ($1, 'review', $2, now()) returning id`,
      [uid, JSON.stringify({ kind: "food", name: "Naan House", legalName: "ЖК «Naan House»", bin: "910412300518", iban: "KZ12722S000012345678", branches: [{ address: "Ерубаев 12", open: "09:00", close: "22:00" }] })])).rows[0].id;
    const list = await json(get("/v1/admin/applications?status=review"));
    expect(list.counts.review).toBe(1); expect(list.applications[0]).toMatchObject({ name: "Naan House", kindName: "Тағамдар", form: "ЖК" });
    const one = (await json(get(`/v1/admin/applications/${appId}`))).application;
    expect(one.data.bank).toBe("Kaspi Bank");
    expect((await post(`/v1/admin/applications/${appId}/return`, { status: "need_info", reason: "Құжат жетіспейді", note: "Санитарлық қорытындыны жүктеңіз" })).status).toBe(200);
    expect(sent.at(-1)?.text).toBe("✏️ Өтінімге түзету керек: Құжат жетіспейді. Санитарлық қорытындыны жүктеңіз");
    expect((await post(`/v1/admin/applications/${appId}/approve`, {})).status).toBe(409); // қайта жіберілмейінше
    await dbh.pool.query("update app.venue_applications set status = 'review' where id = $1", [appId]);
    const ok = await json(post(`/v1/admin/applications/${appId}/approve`, {}));
    expect(ok.venueId).toBeTruthy();
    expect(sent.at(-1)?.text).toContain("Өтінім мақұлданды");
    const v = await json(get("/v1/admin/venues?q=naan"));
    expect(v.venues[0]).toMatchObject({ name: "Naan House", status: "active", branches: 1 });
  });

  it("модерация: жаңа ұсыныс кезекке түседі → түзету сұрау → қайта жіберу → бекіту", async () => {
    const body = { title: "Бургер", titleRu: "Бургер", category: "Бургер", about: "Тауық еті, соус, көкөніс, нан — бәрі жаңа, күн сайын дайындалады", aboutRu: "Описание на русском языке для клиентов", photos: [], validDays: 30, regularUnitPrice: 2000, sizes: [{ units: 4, price: 6400 }], rules: { carry: true, extend: true, preorder: true, branches: null }, publish: true };
    const o = await json(post(`/v1/venue/${venueId}/offers`, body, OWNER));
    expect(o.offer.status).toBe("review");
    const q = await json(get("/v1/admin/offers?tab=queue"));
    expect(q.offers.find((x: { id: string }) => x.id === o.offer.id)).toMatchObject({ discount: 20, isNew: true, venue: "Dämdi Doner" });
    const one = (await json(get(`/v1/admin/offers/${o.offer.id}`))).offer;
    expect(one.checks.map((x: { s: string }) => x.s)).toEqual(["ok", "check", "fail", "ok", "ok"]); // фото жоқ
    await post(`/v1/admin/offers/${o.offer.id}/fix`, { field: "photo", text: "Фото қосыңыз" });
    const mine = (await json(get(`/v1/venue/${venueId}/offers/${o.offer.id}`, OWNER))).offer;
    expect(mine.status).toBe("draft"); expect(mine.reviewNote).toMatchObject({ text: "Фото қосыңыз", field: "photo" });
    expect(sent.at(-1)?.text).toContain("түзету керек: Фото қосыңыз");
    await app.request(`/v1/venue/${venueId}/offers/${o.offer.id}`, { method: "PUT", headers: h(OWNER), body: JSON.stringify({ ...body, photos: ["https://example.com/a.jpg"] }) });
    await post(`/v1/admin/offers/${o.offer.id}/approve`, {});
    expect((await json(get(`/v1/venue/${venueId}/offers/${o.offer.id}`, OWNER))).offer.status).toBe("active");
    expect(sent.at(-1)?.text).toContain("тексеруден өтіп, жарияланды");
  });

  it("комиссия PIN-мен: қате PIN — қалған әрекет; 3 қате — 15 минут бұғат; дұрыс — мекеме есебінде 8%", async () => {
    let r = await json(post(`/v1/admin/venues/${venueId}/fee`, { feePct: 8, pin: "0000" }));
    expect(r).toMatchObject({ error: "bad_pin", left: 2 });
    r = await json(post(`/v1/admin/venues/${venueId}/fee`, { feePct: 8, pin: "5821" }));
    expect(r.ok).toBe(true);
    const card = (await json(get(`/v1/admin/venues/${venueId}`))).venue;
    expect(card).toMatchObject({ feePct: 8, feeCustom: true });
    const hist = await json(get(`/v1/venue/${venueId}/history?days=1`, OWNER));
    const u = hist.items[0]; expect(u.venueAmount).toBe(Math.round(u.amount * 0.92));
    for (let i = 0; i < 2; i++) await post(`/v1/admin/venues/${venueId}/fee`, { feePct: 10, pin: "0000" });
    const locked = await post(`/v1/admin/venues/${venueId}/fee`, { feePct: 10, pin: "0000" });
    expect(locked.status).toBe(423);
    expect((await post(`/v1/admin/venues/${venueId}/fee`, { feePct: 10, pin: "5821" })).status).toBe(423); // бұғат кезінде дұрыс PIN да өтпейді
    await dbh.pool.query("update app.admins set locked_until = null, failed = 0");
  });

  it("мекемені тоқтату: себебі міндетті, сатып алу жабылады, мекемеге хабар; қайта қосу", async () => {
    expect((await post(`/v1/admin/venues/${venueId}/status`, { status: "paused", reason: "", pin: "5821" })).status).toBe(400);
    expect((await post(`/v1/admin/venues/${venueId}/status`, { status: "paused", reason: "Қайталанған шағымдар", pin: "5821" })).status).toBe(200);
    expect((await post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, CLIENT)).status).toBe(409);
    expect(sent.at(-1)?.text).toContain("Мекеме уақытша тоқтатылды: Қайталанған шағымдар");
    const me = await json(app.request("/v1/venue/me", { headers: h(OWNER) }));
    expect(me.staff[0].venue).toMatchObject({ status: "paused", statusNote: "Қайталанған шағымдар" });
    await post(`/v1/admin/venues/${venueId}/status`, { status: "active", pin: "5821" });
    expect((await post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, CLIENT)).status).toBe(200);
  });

  it("шағым: мекеме қайтармаса — «Қаралуда»; Medeo клиент пайдасына шешеді → бірлік оралады", async () => {
    const pk = (await json(post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, CLIENT))).pack.id;
    await post("/v1/redeem", { packId: pk, qr: "MDB1:" + branchId, idempotencyKey: key() }, CLIENT);
    const c = (await json(post("/v1/complaints", { packId: pk, reason: "Қос қолдану", text: "Екі рет сканерленді" }, CLIENT))).complaint;
    expect((await json(get("/v1/admin/complaints?tab=new"))).complaints.some((x: { id: string }) => x.id === c.id)).toBe(true);
    await post(`/v1/venue/${venueId}/complaints/${c.id}/resolve`, { action: "reject", reply: "Бәрі дұрыс болды" }, OWNER);
    const rv = await json(get("/v1/admin/complaints?tab=review"));
    expect(rv.counts.review).toBe(1);
    const one = (await json(get(`/v1/admin/complaints/${c.id}`))).complaint;
    expect(one).toMatchObject({ status: "rejected", reply: "Бәрі дұрыс болды", byAdmin: false, venue: "Dämdi Doner", units: 1 });
    const left0 = (await dbh.pool.query("select units_left from app.packs where id=$1", [pk])).rows[0].units_left;
    expect((await json(post(`/v1/admin/complaints/${c.id}/decide`, { side: "client", reply: "Қолдану екі рет тіркелген, бір бірлік қайтарылды" }))).returned).toBe(1);
    expect((await dbh.pool.query("select units_left from app.packs where id=$1", [pk])).rows[0].units_left).toBe(left0 + 1);
    expect((await json(get("/v1/admin/complaints?tab=done"))).complaints.some((x: { id: string }) => x.id === c.id)).toBe(true);
    expect((await post(`/v1/admin/complaints/${c.id}/decide`, { side: "client", reply: "қайта" })).status).toBe(409);
  });

  it("пакеттер: іздеу (клиент аты), пакет беті, мерзімді ұзарту және қолдануды қайтару PIN-мен", async () => {
    const list = await json(get("/v1/admin/packs?q=Адам903"));
    expect(list.packs.length).toBeGreaterThan(0);
    const id = list.packs.find((p: { left: number; total: number }) => p.left < p.total).id;
    const p = (await json(get(`/v1/admin/packs/${id}`))).pack;
    expect(p.timeline.some((e: { type: string }) => e.type === "use")).toBe(true);
    expect(p.ref).toMatch(/^MD-\d+$/);
    expect((await json(get(`/v1/admin/packs?q=${p.ref}`))).packs[0].id).toBe(id);
    const before = new Date(p.validUntil).getTime();
    expect((await post(`/v1/admin/packs/${id}/extend`, { days: 7, pin: "5821" })).status).toBe(200);
    expect(new Date((await json(get(`/v1/admin/packs/${id}`))).pack.validUntil).getTime() - before).toBe(7 * 86400_000);
    expect((await post(`/v1/admin/packs/${id}/refund-use`, { reason: "Қате қолдану", pin: "1234" })).status).toBe(403);
    const left = p.left;
    expect((await json(post(`/v1/admin/packs/${id}/refund-use`, { reason: "Қате қолдану", pin: "5821" }))).returned).toBe(1);
    expect((await json(get(`/v1/admin/packs/${id}`))).pack.left).toBe(left + 1);
  });

  it("техникалық жұмыстар: қосылса клиент/мекеме API 503, Басқару жұмыс істейді; журналда бәрі бар", async () => {
    expect((await post("/v1/admin/settings", { key: "maintenance", value: true })).status).toBe(403); // PIN-сіз
    expect((await post("/v1/admin/settings", { key: "maintenance", value: true, pin: "5821" })).status).toBe(200);
    const r = await get("/v1/me", CLIENT);
    expect(r.status).toBe(503);
    expect((await r.json()).text).toContain("Жаңарту");
    expect((await get("/v1/admin/settings")).status).toBe(200);
    await post("/v1/admin/settings", { key: "maintenance", value: false, pin: "5821" });
    expect((await get("/v1/me", CLIENT)).status).toBe(200);
    expect((await post("/v1/admin/settings", { key: "graceDays", value: 40, pin: "5821" })).status).toBe(400);
    const log = (await json(get("/v1/admin/log"))).log.map((x: { action: string }) => x.action);
    expect(log).toEqual(expect.arrayContaining(["Комиссия өзгерді", "Өтінім бекітілді", "Ұсыныс бекітілді", "Мекеме тоқтатылды", "Шағым шешілді", "Мерзім ұзартылды", "Қолдану қайтарылды", "Техникалық жұмыстар қосылды", "Техникалық жұмыстар өшірілді"]));
  });

  it("веб-кіру (Telegram Login Widget): қолтаңба, рұқсат тізімі, PIN → веб-токенмен Басқару API", async () => {
    const now = Math.floor(Date.now() / 1000);
    const w = (id: number, at = now) => signLoginWidget({ id, first_name: "Адам" + id, auth_date: at }, TOKEN);
    const login = (body: object) => app.request("/admin-web/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await login({ auth: { ...w(ADMIN), hash: "00".repeat(32) } })).status).toBe(401);
    expect((await json(login({ auth: w(ADMIN, now - 2 * 86400) }))).reason).toBe("expired");
    expect(await json(login({ auth: w(OTHER) }))).toMatchObject({ error: "forbidden", telegramId: OTHER });
    expect(await json(login({ auth: w(ADMIN) }))).toMatchObject({ ok: true, hasPin: true });
    expect((await json(login({ auth: w(ADMIN), pin: "0000" }))).error).toBe("bad_pin");
    const ok = await json(login({ auth: w(ADMIN), pin: "5821" }));
    expect(ok.token).toMatch(/^[0-9a-f-]{36}\.\d+\.[0-9a-f]{32}$/);
    const [, e, sg] = ok.token.split(".");
    const web = { Authorization: "adm " + ok.token, "X-Admin-Token": `${e}.${sg}` };
    expect((await app.request("/v1/admin/pulse", { headers: web })).status).toBe(200);
    expect((await app.request("/v1/me", { headers: web })).status).toBe(401); // веб-токен тек Басқаруға
    expect((await app.request("/v1/admin/pulse", { headers: { ...web, Authorization: "adm " + ok.token.slice(0, -1) + (ok.token.endsWith("0") ? "1" : "0") } })).status).toBe(401);
    await dbh.pool.query("update app.admins set failed = 0, locked_until = null");
  });

  it("Басқаруға бот хабарламалары (Figma 18): шағым — веб-сілтемемен; баптау өшсе келмейді; тыныш уақытта тек шұғыл", async () => {
    const before = sent.length;
    const pk = (await json(post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, CLIENT))).pack.id;
    await post("/v1/redeem", { packId: pk, qr: "MDB1:" + branchId, idempotencyKey: key() }, CLIENT);
    await post("/v1/complaints", { packId: pk, reason: "Қос қолдану", text: "Тағы да екі рет" }, CLIENT);
    const m = sent.slice(before).find((x) => x.chatId === ADMIN && x.text.startsWith("💬 Жаңа шағым"));
    expect(m?.button?.url).toMatch(/#\/a\/complaints\/[0-9a-f-]{36}$/);
    const prefs = (await json(get("/v1/admin/prefs"))).prefs;
    expect(prefs).toMatchObject({ complaint: true, weekly: false, quiet: true });
    await app.request("/v1/admin/prefs", { method: "PUT", headers: A(), body: JSON.stringify({ ...prefs, moderation: false }) });
    const b2 = sent.length;
    const body = { title: "Лаваш", titleRu: "Лаваш", category: "Басқа", about: "Тауық еті, соус, көкөніс — бәрі жаңа, күн сайын дайындалады, түскі асқа", aboutRu: "Описание на русском языке для клиентов", photos: ["https://example.com/a.jpg"], validDays: 30, regularUnitPrice: 2000, sizes: [{ units: 4, price: 6400 }], rules: { carry: true, extend: true, preorder: true, branches: null }, publish: true };
    await post(`/v1/venue/${venueId}/offers`, body, OWNER);
    expect(sent.slice(b2).some((x) => x.chatId === ADMIN)).toBe(false);
    await app.request("/v1/admin/prefs", { method: "PUT", headers: A(), body: JSON.stringify({ ...prefs, quiet: false }) }); // тыныш уақытқа тәуелді болмау үшін
    const b3 = sent.length;
    await post(`/v1/venue/${venueId}/offers`, body, OWNER);
    expect(sent.slice(b3).find((x) => x.chatId === ADMIN)?.text).toContain("Модерацияға ұсыныс түсті");
  });

  it("ақша: төлемдер, есеп айырысу (8% комиссиямен), қайтарулар, CSV экспорт", async () => {
    const pays = await json(get("/v1/admin/payments?tab=paid"));
    expect(pays.payments.length).toBeGreaterThan(0);
    expect(pays.payments[0]).toMatchObject({ status: "paid", method: "test" });
    const st = await json(get("/v1/admin/settlements"));
    const dd = st.venues.find((x: { id: string }) => x.id === venueId);
    expect(dd.uses).toBeGreaterThan(0); expect(dd.fee).toBe(8); // жоғарыда 8%-ға өзгертілген
    expect(Math.abs(dd.amount - dd.gross * 0.92)).toBeLessThan(dd.uses);
    const rf = await json(get("/v1/admin/refunds"));
    expect(rf.refunds.map((x: { why: string }) => x.why)).toEqual(expect.arrayContaining(["шағым", "Басқару қайтарды"]));
    const csv = await get("/v1/admin/export?period=all&parts=payments,settlements,refunds");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const t = await csv.text();
    expect(t.replace(/^\uFEFF/, "").startsWith("Төлемдер")).toBe(true); // BOM — Excel кириллицаны дұрыс ашуы үшін
    expect(t).toContain("Dämdi Doner");
  });
});
