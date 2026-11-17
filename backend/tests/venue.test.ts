// C · мекеме бөлімі (Figma «Jazl+ Мекеме»): шақыру коды → растау, рөлдер, кассир QR сеансы (пакет + дана, 6 таңбалы код, бір рет),
// басты бет, тарих, ұсыныстар, есеп (TEST_DATABASE_URL)
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

d("C мекеме бөлімі", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", MEDIA_DIR: "/tmp/jazl-media-test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  let venueId = ""; let branchId = ""; let donerId = ""; let otherOfferId = "";
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id, last_name: "Тест", username: "u" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (path: string, body: object, id: number) => app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const get = (path: string, id: number) => app.request(path, { headers: h(id) });
  const json = async (r: Response | Promise<Response>) => (await r).json();
  const userId = async (tg: number) => (await dbh.pool.query("select id from app.users where telegram_id = $1", [tg])).rows[0].id as string;
  let n = 0; const key = () => "k-" + Date.now() + "-" + n++;
  const buy = async (id: number, slug = "doner") => (await json(post("/v1/purchases", { offerSlug: slug, idempotencyKey: key() }, id))).pack.id as string;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    const r = (await dbh.pool.query("select v.id as v, b.id as b from app.venues v join app.branches b on b.venue_id = v.id where v.slug='damdi' limit 1")).rows[0];
    venueId = r.v; branchId = r.b;
    donerId = (await dbh.pool.query("select id from app.offers where slug='doner'")).rows[0].id;
    otherOfferId = (await dbh.pool.query("select id from app.offers where venue_id=$1 and slug<>'doner' limit 1", [venueId])).rows[0]?.id ?? "";
    await post("/v1/venue/dev-join", { venueSlug: "damdi" }, 701); // 701 — иесі
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("клиент: /venue/me бос; мекеме маршруттары — 403", async () => {
    expect(await json(get("/v1/venue/me", 700))).toEqual({ ok: true, staff: [] });
    expect((await get(`/v1/venue/${venueId}/dashboard`, 700)).status).toBe(403);
    expect((await post(`/v1/venue/${venueId}/invites`, {}, 700)).status).toBe(403);
  });

  it("шақыру коды (6 сан, 24 сағ) → кассир «күтілуде» → иесі растайды → кассир режимі ашылады", async () => {
    const inv = await json(post(`/v1/venue/${venueId}/invites`, {}, 701));
    expect(inv.code).toMatch(/^\d{6}$/);
    expect((await json(get(`/v1/venue/${venueId}/invite`, 701))).invite.code).toBe(inv.code);
    expect((await post("/v1/venue/join", { code: "000000" }, 702)).status).toBe(404);
    expect(await json(post("/v1/venue/join", { code: inv.code }, 702))).toMatchObject({ ok: true, status: "pending", role: "cashier" });
    expect((await json(get("/v1/venue/me", 702))).staff[0]).toMatchObject({ status: "pending" });
    expect((await get(`/v1/venue/${venueId}/dashboard`, 702)).status).toBe(403); // расталмаған — кіре алмайды
    expect((await post(`/v1/venue/${venueId}/staff/${await userId(702)}/approve`, {}, 702)).status).toBe(403);
    expect((await post(`/v1/venue/${venueId}/staff/${await userId(702)}/approve`, {}, 701)).status).toBe(200);
    expect((await get(`/v1/venue/${venueId}/dashboard`, 702)).status).toBe(200);
    // бір код бірнеше кассирге жарайды
    expect(await json(post("/v1/venue/join", { code: inv.code }, 703))).toMatchObject({ status: "pending" });
  });

  it("рөлдер: кассир есеп, ұсыныстар, команда көрмейді; иесін шығару мүмкін емес", async () => {
    expect((await get(`/v1/venue/${venueId}/report`, 702)).status).toBe(403);
    expect((await get(`/v1/venue/${venueId}/offers`, 702)).status).toBe(200); // кассир пакетті таңдау үшін көреді
    expect((await post(`/v1/venue/${venueId}/offers/${donerId}/status`, { status: "paused" }, 702)).status).toBe(403);
    expect((await get(`/v1/venue/${venueId}/staff`, 702)).status).toBe(403);
    expect((await post(`/v1/venue/${venueId}/invites`, {}, 702)).status).toBe(403);
    expect((await post(`/v1/venue/${venueId}/staff/${await userId(701)}/remove`, {}, 701)).status).toBe(403);
    const list = await json(get(`/v1/venue/${venueId}/staff`, 701));
    expect(list.staff.map((x: { role: string; status: string }) => x.role + ":" + x.status)).toEqual(["owner:active", "cashier:active", "cashier:pending"]);
    expect((await post(`/v1/venue/${venueId}/staff/${await userId(703)}/remove`, {}, 701)).status).toBe(200);
  });

  it("кассир QR: пакет + дана → клиент сканерлейді → «Төлем өтті»; сеанс бір рет қана", async () => {
    const s = (await json(post("/v1/venue/qr", { branchId, offerId: donerId, units: 2, extra: 500 }, 702))).session;
    expect(s.code).toMatch(/^\d{4}$/); expect(s.payload).toMatch(/^JZQ3\./);
    const info = await json(post("/v1/qr/resolve", { qr: s.payload }, 710));
    expect(info).toMatchObject({ ok: true, units: 2, offer: { slug: "doner" }, valid: true, expired: false });
    const p = await buy(710);
    expect((await json(post("/v1/redeem", { packId: p, qr: s.payload, units: 2, idempotencyKey: key() }, 710)))).toMatchObject({ ok: true, left: 2 });
    const st = await json(get(`/v1/venue/qr/${s.id}`, 702));
    expect(st).toMatchObject({ status: "paid", paid: { units: 2, left: 2, total: 4, extra: 500 } });
    expect(st.paid.venueAmount).toBe(Math.round(st.paid.amount * 0.9));
    // QR мен код әр 30 с бірге жаңарады
    const s3 = (await json(post("/v1/venue/qr", { branchId, offerId: donerId, units: 1 }, 702))).session;
    await dbh.pool.query("update app.qr_sessions set code_exp = now() - interval '1 second' where id = $1", [s3.id]);
    const w = await json(get(`/v1/venue/qr/${s3.id}`, 702));
    expect(w.status).toBe("waiting"); expect(w.amount).toBeUndefined(); expect(new Date(w.codeExp).getTime()).toBeGreaterThan(Date.now() + 20_000);
    const p2 = await buy(711);
    expect((await post("/v1/redeem", { packId: p2, qr: s.payload, units: 2, idempotencyKey: key() }, 711)).status).toBe(409); // екінші рет — жоқ
    const cashierId = (await dbh.pool.query("select cashier_id from app.redemptions where id = $1", [st.paid.redemptionId])).rows[0].cashier_id;
    expect(cashierId).toBe(await userId(702));
  });

  it("басқа пакет — other_offer; 6 таңбалы код QR береді; бас тартылған сеанс өтпейді", async () => {
    if (otherOfferId) {
      const s = (await json(post("/v1/venue/qr", { branchId, offerId: otherOfferId, units: 1 }, 701))).session;
      const p = await buy(712);
      const r = await post("/v1/redeem", { packId: p, qr: s.payload, units: 1, idempotencyKey: key() }, 712);
      expect(r.status).toBe(409); expect((await r.json()).error).toBe("other_offer");
    }
    const s2 = (await json(post("/v1/venue/qr", { branchId, offerId: donerId, units: 1 }, 701))).session;
    const byCode = await json(post("/v1/qr/code", { code: s2.code }, 713));
    expect(byCode.qr).toMatch(/^JZQ3\./);
    await post(`/v1/venue/qr/${s2.id}/cancel`, {}, 701);
    expect((await json(get(`/v1/venue/qr/${s2.id}`, 701))).status).toBe("cancelled");
    expect((await post("/v1/qr/code", { code: s2.code }, 713)).status).toBe(404);
  });

  it("басты бет, тарих, ұсыныстар, есеп — нақты сандар", async () => {
    const dash = (await json(get(`/v1/venue/${venueId}/dashboard`, 701))).dashboard;
    expect(dash.today).toBeGreaterThanOrEqual(1); expect(dash.series).toHaveLength(7); expect(dash.activePacks).toBeGreaterThan(0);
    const cash = (await json(get(`/v1/venue/${venueId}/dashboard`, 702))).dashboard;
    expect(cash.cashierToday).toBe(1);
    const hist = await json(get(`/v1/venue/${venueId}/history?days=7`, 701));
    expect(hist.summary.count).toBeGreaterThanOrEqual(1); expect(hist.items[0]).toHaveProperty("venueAmount");
    const offs = (await json(get(`/v1/venue/${venueId}/offers`, 701))).offers;
    expect(offs.find((o: { slug: string }) => o.slug === "doner")).toMatchObject({ status: "active" });
    expect((await post(`/v1/venue/${venueId}/offers/${donerId}/status`, { status: "paused" }, 701)).status).toBe(200);
    await post(`/v1/venue/${venueId}/offers/${donerId}/status`, { status: "active" }, 701);
    const rep = (await json(get(`/v1/venue/${venueId}/report?period=week`, 701))).report;
    expect(rep.bars).toHaveLength(7); expect(rep.today).toBeGreaterThan(0);
    const prof = (await json(get(`/v1/venue/${venueId}/staff/${await userId(702)}`, 701))).staff;
    expect(prof.today.count).toBe(1);
  });
  it("ұсыныс құру: жоба → жариялау (жеңілдік ≥10%), ұсыныс беті, бағаны өзгерту (50%+ түсіру — растау), өшіру", async () => {
    const body = { title: "Тауық бургер", category: "Бургер", about: "Тауық еті, *соус*", sizes: [{ units: 4, price: 7600 }], regularUnitPrice: 2000, validDays: 30,
      rules: { carry: true, extend: true, preorder: false, branches: null }, publish: false };
    expect((await post(`/v1/venue/${venueId}/offers`, body, 702)).status).toBe(403); // кассир құра алмайды
    const d = await json(post(`/v1/venue/${venueId}/offers`, body, 701));
    expect(d.offer.status).toBe("draft");
    expect((await post(`/v1/venue/${venueId}/offers`, { ...body, publish: true, sizes: [{ units: 4, price: 7900 }] }, 701)).status).toBe(409); // 1,25% ғана жеңілдік
    expect((await app.request(`/v1/venue/${venueId}/offers/${d.offer.id}`, { method: "PUT", headers: h(701), body: JSON.stringify({ ...body, publish: true, sizes: [{ units: 4, price: 6000 }, { units: 8, price: 11200 }] }) })).status).toBe(200);
    const o = (await json(get(`/v1/venue/${venueId}/offers/${d.offer.id}`, 701))).offer;
    expect(o).toMatchObject({ status: "active", category: "Бургер", about: "Тауық еті, *соус*" });
    expect(o.sizes.map((x: { units: number }) => x.units)).toEqual([4, 8]);
    expect(o.stats.series).toHaveLength(7);
    const big = await post(`/v1/venue/${venueId}/offers/${d.offer.id}/price`, { units: 8, price: 5000 }, 701);
    expect(big.status).toBe(409); expect((await big.json()).error).toBe("big_drop");
    expect((await post(`/v1/venue/${venueId}/offers/${d.offer.id}/price`, { units: 8, price: 5000, confirmDrop: true }, 701)).status).toBe(200);
    expect((await post(`/v1/venue/${venueId}/offers/${d.offer.id}/price`, { units: 8, price: 9000 }, 702)).status).toBe(403);
    expect((await json(get(`/v1/venue/${venueId}/offers/${d.offer.id}`, 701))).offer.sizes[1].price).toBe(5000);
    const d2 = await json(post(`/v1/venue/${venueId}/offers`, body, 701));
    await post(`/v1/venue/${venueId}/offers/${d2.offer.id}/remove`, {}, 701);
    expect((await get(`/v1/venue/${venueId}/offers/${d2.offer.id}`, 701)).status).toBe(404);
  });
  it("сурет жүктеу: WebP-ке сығылады, /media арқылы беріледі; кассир жүктей алмайды; сурет емес — 400", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#ff9900" } }).png().toBuffer();
    const up = (id: number, body: Uint8Array, type = "image/png") => app.request(`/v1/venue/${venueId}/media?kind=offer`, { method: "POST", headers: { ...h(id), "Content-Type": type }, body });
    expect((await up(702, png)).status).toBe(403);
    const r = await (await up(701, png)).json();
    expect(r.url).toMatch(/\/media\/venues\/.+\/offer-.+\.webp$/);
    const img = await app.request(r.url.replace(/^https?:\/\/[^/]+/, ""));
    expect(img.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 1200]);
    expect((await up(701, new TextEncoder().encode("not an image"))).status).toBe(400);
    expect((await up(701, png, "text/plain")).status).toBe(415);
  });
  it("филиалдар: уақытша жабу QR-ды тоқтатады, ашу; кесте мен мереке күні; соңғы филиал өшпейді", async () => {
    const list = await json(get(`/v1/venue/${venueId}/branches`, 701));
    expect(list.branches[0]).toMatchObject({ id: branchId, status: { open: true } });
    expect((await get(`/v1/venue/${venueId}/branches`, 702)).status).toBe(403);
    await post(`/v1/venue/${venueId}/branches/${branchId}/close`, { for: "1h", reason: "Үзіліс" }, 701);
    expect((await json(get(`/v1/venue/${venueId}/branches`, 701))).branches[0].status).toMatchObject({ open: false, kind: "temp", reason: "Үзіліс" });
    const q = await post("/v1/venue/qr", { branchId, offerId: donerId, units: 1 }, 701);
    expect(q.status).toBe(409); expect((await q.json()).error).toBe("branch_closed");
    const p = await buy(720);
    const r = await post("/v1/redeem", { packId: p, qr: "JZB1:" + branchId, idempotencyKey: key() }, 720);
    expect(r.status).toBe(409); expect((await r.json()).error).toBe("branch_closed");
    await post(`/v1/venue/${venueId}/branches/${branchId}/open`, {}, 701);
    expect((await post("/v1/redeem", { packId: p, qr: "JZB1:" + branchId, idempotencyKey: key() }, 720)).status).toBe(200);
    // Бүгінгі күн — мереке, жабық
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
    const days = Array.from({ length: 7 }, () => ({ on: true, open: "00:00", close: "00:00" }));
    const put = (holidays: object[]) => app.request(`/v1/venue/${venueId}/branches/${branchId}`, { method: "PUT", headers: h(701), body: JSON.stringify({ address: "Нұркен Әбдіров, 24", is247: false, days, holidays }) });
    expect((await put([{ name: "Наурыз", from: today, to: today, closed: true }])).status).toBe(200);
    expect((await json(get(`/v1/venue/${venueId}/branches`, 701))).branches[0].status).toMatchObject({ open: false, kind: "holiday" });
    await put([]);
    expect((await json(get(`/v1/venue/${venueId}/branches`, 701))).branches[0].status.open).toBe(true); // 00:00–00:00 — тәулік бойы
    expect((await post(`/v1/venue/${venueId}/branches/${branchId}/remove`, {}, 701)).status).toBe(409);
    const add = await json(post(`/v1/venue/${venueId}/branches`, { address: "Бұхар-Жырау, 52" }, 701));
    expect((await post(`/v1/venue/${venueId}/branches/${add.id}/remove`, {}, 701)).status).toBe(200);
  });
});
