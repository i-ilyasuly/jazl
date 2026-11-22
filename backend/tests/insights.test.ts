// Мекеме талдауы және аударымдар (Патша, 2026-11-23): жаңа/қайта келген клиент, алдын ала ақша, міндеттеме, ұсыныс кестесі,
// жүктеме; Басқару аударымды PIN-мен тіркейді → мекеме есебінде күн «аударылды», қалдық азаяды; қабаттасқан кезең — 409
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

d("Мекеме талдауы және аударымдар", () => {
  const ADMIN = 851, OWNER = 801, CASHIER = 802;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: `${ADMIN}`, MEDIA_DIR: "/tmp/medeo-media-test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let tok = "";
  let venueId = ""; let branchId = ""; let donerId = "";
  const h = (id: number, extra: Record<string, string> = {}) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id }) }, TOKEN), "Content-Type": "application/json", ...extra });
  const post = (path: string, body: object, id: number, extra: Record<string, string> = {}) => app.request(path, { method: "POST", headers: h(id, extra), body: JSON.stringify(body) });
  const json = async (r: Response | Promise<Response>) => (await r).json();
  const A = () => ({ "X-Admin-Token": tok });
  let n = 0; const key = () => "i-" + Date.now() + "-" + n++;
  const buy = async (id: number) => (await json(post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, id))).pack.id as string;
  const redeem = async (pack: string, tg: number, units = 1) => {
    const s = (await json(post("/v1/venue/qr", { branchId, offerId: donerId, units }, OWNER))).session;
    return json(post("/v1/redeem", { packId: pack, qr: s.payload, units, idempotencyKey: key() }, tg));
  };

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await c.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    const r = (await dbh.pool.query("select v.id as v, b.id as b from app.venues v join app.branches b on b.venue_id = v.id where v.slug='damdi' limit 1")).rows[0];
    venueId = r.v; branchId = r.b;
    donerId = (await dbh.pool.query("select id from app.offers where slug='doner'")).rows[0].id;
    await post("/v1/venue/dev-join", { venueSlug: "damdi" }, OWNER);
    tok = (await json(post("/v1/admin/pin", { pin: "582193", setup: true }, ADMIN))).token;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("талдау тек иесіне; жаңа/қайта клиент, алдын ала ақша, міндеттеме, ұсыныс, жүктеме", async () => {
    // 811 — екі рет алды (қайта келген), 812 — бір рет; 811-дің бірінші пакеті «өткен аптада»
    const p1 = await buy(811); await buy(812);
    await dbh.pool.query("update app.packs set created_at = now() - interval '9 days' where id = $1", [p1]);
    const p3 = await buy(811);
    expect((await redeem(p3, 811, 2)).ok).toBe(true);
    const inv = await json(post(`/v1/venue/${venueId}/invites`, {}, OWNER));
    await post("/v1/venue/join", { code: inv.code }, CASHIER);
    expect((await app.request(`/v1/venue/${venueId}/insights`, { headers: h(CASHIER) })).status).toBe(403);
    expect((await app.request(`/v1/venue/${venueId}/insights`, { headers: h(900) })).status).toBe(403);

    const x = (await json(app.request(`/v1/venue/${venueId}/insights?period=week`, { headers: h(OWNER) }))).insights;
    expect(x.customers).toMatchObject({ buyers: 2, newBuyers: 1, returning: 1, visitors: 1, buyersPrev: 1, newPrev: 1, everBuyers: 2, repeatRate: 50 });
    const [price] = (await dbh.pool.query("select price_paid from app.packs where id = $1", [p3])).rows.map((r) => Number(r.price_paid));
    expect(x.money.packs).toBe(2); expect(x.money.packsPrev).toBe(1);
    expect(x.money.prepaid).toBe(Math.round((2 * price * (100 - x.feePct)) / 100)); // мекеме үлесі
    expect(x.money.activePacks).toBe(3); expect(x.money.liability).toBeGreaterThan(0); expect(x.money.liability).toBeLessThan(3 * price);
    const off = x.offers.find((o: { id: string }) => o.id === donerId);
    expect(off).toMatchObject({ packs: 2, uses: 1, repeatRate: 50 });
    expect(off.utilization).toBeGreaterThan(0);
    expect(x.load.hours).toHaveLength(24); expect(x.load.weekdays).toHaveLength(7); expect(x.load.total).toBe(1);
    const all = (await json(app.request(`/v1/venue/${venueId}/insights?period=all`, { headers: h(OWNER) }))).insights;
    expect(all.customers.buyersPrev).toBeNull(); expect(all.money.packs).toBe(3);
  });

  it("есеп: аударым тіркелмейінше «күтуде»; Басқару PIN-мен тіркейді → «аударылды», қалдық азаяды", async () => {
    const rep0 = (await json(app.request(`/v1/venue/${venueId}/report?period=week`, { headers: h(OWNER) }))).report;
    expect(rep0.days[0].status).toBe("pending");
    expect(rep0.money.earned).toBeGreaterThan(0); expect(rep0.money.paid).toBe(0); expect(rep0.money.due).toBe(rep0.money.earned);
    expect(rep0).toHaveProperty("prevTotal");

    const list0 = await json(app.request(`/v1/admin/venues/${venueId}/payouts`, { headers: h(ADMIN, A()) }));
    expect(list0.balance.due).toBe(rep0.money.earned); expect(list0.payouts).toHaveLength(0);
    const today = rep0.days[0].date;
    const body = { amount: rep0.money.earned, from: "2026-01-01", to: today, paidAt: today, ref: "ПП-17" };
    expect((await post(`/v1/admin/venues/${venueId}/payouts`, { ...body, pin: "000000" }, ADMIN, A())).status).toBe(403);
    expect((await post(`/v1/admin/venues/${venueId}/payouts`, { ...body, from: today, to: "2026-01-01", pin: "582193" }, ADMIN, A())).status).toBe(400);
    expect((await post(`/v1/admin/venues/${venueId}/payouts`, { ...body, pin: "582193" }, ADMIN)).status).toBe(401); // Басқару токенісіз
    const ok = await json(post(`/v1/admin/venues/${venueId}/payouts`, { ...body, pin: "582193" }, ADMIN, A()));
    expect(ok.ok).toBe(true);
    expect((await post(`/v1/admin/venues/${venueId}/payouts`, { ...body, from: today, pin: "582193" }, ADMIN, A())).status).toBe(409); // қабаттасу

    const rep1 = (await json(app.request(`/v1/venue/${venueId}/report?period=week`, { headers: h(OWNER) }))).report;
    expect(rep1.days[0].status).toBe("paid");
    expect(rep1.money).toMatchObject({ paid: rep0.money.earned, due: 0, paidThrough: today });
    expect(rep1.payouts[0]).toMatchObject({ amount: rep0.money.earned, ref: "ПП-17" });

    expect((await post(`/v1/admin/venues/${venueId}/payouts/${ok.id}/delete`, { pin: "582193" }, ADMIN, A())).status).toBe(200);
    const rep2 = (await json(app.request(`/v1/venue/${venueId}/report?period=week`, { headers: h(OWNER) }))).report;
    expect(rep2.days[0].status).toBe("pending"); expect(rep2.money.paid).toBe(0);
  });
});
