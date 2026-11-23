// Филиал таңдау және франшиза (Патша, 2026-11-23): клиент тапсырыста филиалды өзі таңдайды (тізім, жабық филиалға — 409);
// кассир тек өз филиалының тапсырысын көреді/береді; ақша алушы (заңды тұлға) бойынша есеп пен аударым (TEST_DATABASE_URL)
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

d("Филиал таңдау және франшиза", () => {
  const ADMIN = 951, OWNER = 952, CASH_A = 953, CASH_B = 954;
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", ADMIN_IDS: `${ADMIN}`, MEDIA_DIR: "/tmp/medeo-media-test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let tok = "";
  let venueId = "", A = "", B = "", C = "";
  const h = (id: number, extra: Record<string, string> = {}) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Ф" + id }) }, TOKEN), "Content-Type": "application/json", ...extra });
  const post = (path: string, body: object, id: number, extra: Record<string, string> = {}) => app.request(path, { method: "POST", headers: h(id, extra), body: JSON.stringify(body) });
  const pj = async (path: string, body: object, id: number, extra: Record<string, string> = {}) => (await post(path, body, id, extra)).json();
  const gj = async (path: string, id: number, extra: Record<string, string> = {}) => (await app.request(path, { headers: h(id, extra) })).json();
  const ADM = () => ({ "X-Admin-Token": tok });
  let n = 0; const key = () => "f-" + Date.now() + "-" + n++;
  const q = (s: string, p: unknown[] = []) => dbh.pool.query(s, p).then((r) => r.rows);
  const buy = async (id: number) => (await pj("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, id)).pack.id as string;

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL }); await c.connect();
    await c.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await c.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    const [b] = await q("select b.id, b.venue_id from app.branches b join app.venues v on v.id = b.venue_id where v.slug = 'damdi' order by b.created_at limit 1");
    A = b.id; venueId = b.venue_id;
    await q("update app.branches set is_247 = true, address = 'Тәуелсіздік 1' where id = $1", [A]);
    B = (await q("insert into app.branches (venue_id, address, is_247) values ($1, 'Мәңгілік Ел 28', true) returning id", [venueId]))[0].id;
    C = (await q("insert into app.branches (venue_id, address, is_247, closed_until, closed_reason) values ($1, 'Бұқар жырау 5', true, now() + interval '1 day', 'Жөндеу') returning id", [venueId]))[0].id;
    await q("update app.venues set accepts_preorder = true where id = $1", [venueId]);
    await pj("/v1/venue/dev-join", { venueSlug: "damdi" }, OWNER);
    for (const [who, br] of [[CASH_A, A], [CASH_B, B]] as const) {
      await q("insert into app.users (telegram_id, first_name) values ($1, 'К') on conflict do nothing", [who]);
      await q("insert into app.venue_staff (venue_id, user_id, role, branch_id, status) select $1, id, 'cashier', $2, 'active' from app.users where telegram_id = $3", [venueId, br, who]);
    }
    tok = (await pj("/v1/admin/pin", { pin: "582193", setup: true }, ADMIN)).token;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("пакеттің филиалдары: мекенжай, координата, бүгінгі күйі; жабық филиал белгіленеді", async () => {
    const pack = await buy(961);
    expect((await gj(`/v1/packs/${pack}/branches`, 962)).ok).toBe(false); // бөтен пакет
    const j = await gj(`/v1/packs/${pack}/branches`, 961);
    expect(j.branches.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([A, B, C]));
    const c = j.branches.find((x: { id: string }) => x.id === C);
    expect(c).toMatchObject({ open: false, kind: "temp", reason: "Жөндеу" });
    expect(j.branches.find((x: { id: string }) => x.id === B)).toMatchObject({ open: true, today: "24/7", address: "Мәңгілік Ел 28" });
  });

  it("тапсырыс таңдалған филиалға барады; жабық филиалға — 409, бірлік қайтады", async () => {
    const pack = await buy(963);
    const o = await pj("/v1/orders", { packId: pack, type: "now", branchId: B, idempotencyKey: key() }, 963);
    expect(o.ok).toBe(true); expect(o.order.branchId).toBe(B);
    const left = (await q("select units_left from app.packs where id = $1", [pack]))[0].units_left;
    const bad = await pj("/v1/orders", { packId: pack, type: "now", branchId: C, idempotencyKey: key() }, 963);
    expect(bad).toMatchObject({ ok: false, error: "branch_closed", address: "Бұқар жырау 5" });
    expect((await q("select units_left from app.packs where id = $1", [pack]))[0].units_left).toBe(left);
    // Жоспар: слот кезінде филиал әлі жабық (ертеңге дейін) — 409; ашық филиалға — өтеді
    const at = new Date(Date.now() + 3 * 3600_000).toISOString();
    expect((await pj("/v1/orders", { packId: pack, type: "plan", scheduledAt: at, branchId: C, idempotencyKey: key() }, 963)).error).toBe("branch_closed");
    expect((await pj("/v1/orders", { packId: pack, type: "plan", scheduledAt: at, branchId: A, idempotencyKey: key() }, 963)).order.branchId).toBe(A);
  });

  it("кассир тек өз филиалының тапсырысын көреді және береді; иесі — бәрін, филиал сүзгісімен", async () => {
    const pack = await buy(964);
    const o = await pj("/v1/orders", { packId: pack, type: "now", branchId: B, idempotencyKey: key() }, 964);
    const seen = async (who: number, qs = "") => (await gj("/v1/venue/orders" + qs, who)).orders.map((x: { id: string }) => x.id) as string[];
    expect(await seen(CASH_B)).toContain(o.order.id);
    expect(await seen(CASH_A)).not.toContain(o.order.id);
    expect(await seen(OWNER)).toContain(o.order.id);
    expect(await seen(OWNER, `?branch=${A}`)).not.toContain(o.order.id);
    expect((await post(`/v1/venue/orders/${o.order.id}/status`, { status: "accepted" }, CASH_A)).status).toBe(404);
    expect((await pj("/v1/venue/orders/verify", { code: o.order.code }, CASH_A)).error).toBe("code_not_found");
    expect((await pj("/v1/venue/orders/verify", { code: o.order.code }, CASH_B)).ok).toBe(true);
  });

  it("ақша алушы: франчайзиге филиал бөлінеді → есеп пен аударым алушы бойынша", async () => {
    // Негізгі алушы (сид мекемесінде өтінім жоқ — Басқару қосады), сосын франчайзи B филиалымен
    const bad = await pj(`/v1/admin/venues/${venueId}/payees`, { legalName: "ЖШС Dämdi", iban: "KZ00123", branchIds: [], pin: "582193" }, ADMIN, ADM());
    expect(bad.error).toBe("bad_iban");
    const main = await pj(`/v1/admin/venues/${venueId}/payees`, { legalName: "ЖШС Dämdi", branchIds: [], pin: "582193" }, ADMIN, ADM());
    expect(main.ok).toBe(true);
    const fr = await pj(`/v1/admin/venues/${venueId}/payees`, { legalName: "ЖК Франчайзи", contractNo: "АГ-7", branchIds: [B], pin: "582193" }, ADMIN, ADM());
    expect(fr.ok).toBe(true);
    const ps = await gj(`/v1/admin/venues/${venueId}/payees`, ADMIN, ADM());
    expect(ps.payees.find((p: { id: string }) => p.id === main.id).isMain).toBe(true);
    expect(ps.branches.find((b: { id: string }) => b.id === B).payeeId).toBe(fr.id);

    const g = await gj(`/v1/admin/venues/${venueId}/payouts`, ADMIN, ADM());
    const gm = g.groups.find((x: { payee: { id: string } | null }) => x.payee?.id === main.id), gf = g.groups.find((x: { payee: { id: string } | null }) => x.payee?.id === fr.id);
    expect(gf.branches.map((b: { id: string }) => b.id)).toEqual([B]);
    expect(gm.branches.map((b: { id: string }) => b.id)).toEqual(expect.arrayContaining([A, C]));
    expect(gf.earned).toBeGreaterThan(0); expect(gm.earned).toBeGreaterThan(0); // B-да және A-да тапсырыстар болды
    expect(gm.earned + gf.earned).toBe(g.balance.earned);

    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const body = { amount: gf.earned, from: "2026-01-01", to: today, paidAt: today, pin: "582193" };
    expect((await post(`/v1/admin/venues/${venueId}/payouts`, body, ADMIN, ADM())).status).toBe(400); // алушы көрсетілмеді
    expect((await pj(`/v1/admin/venues/${venueId}/payouts`, { ...body, payeeId: fr.id }, ADMIN, ADM())).ok).toBe(true);
    // Басқа алушыға сол кезең — қабаттасу емес
    expect((await pj(`/v1/admin/venues/${venueId}/payouts`, { ...body, amount: gm.earned, payeeId: main.id, from: today }, ADMIN, ADM())).ok).toBe(true);
    expect((await post(`/v1/admin/venues/${venueId}/payouts`, { ...body, payeeId: fr.id, from: today }, ADMIN, ADM())).status).toBe(409);

    const rep = (await gj(`/v1/venue/${venueId}/report?period=week`, OWNER)).report;
    expect(rep.payees).toHaveLength(2);
    expect(rep.payees.every((p: { due: number }) => p.due === 0)).toBe(true);
    expect(rep.days[0].status).toBe("paid");
    // Аударымы бар алушыны жоюға болмайды, негізгісін де
    expect((await post(`/v1/admin/venues/${venueId}/payees/${fr.id}/delete`, { pin: "582193" }, ADMIN, ADM())).status).toBe(409);
    expect((await post(`/v1/admin/venues/${venueId}/payees/${main.id}/delete`, { pin: "582193" }, ADMIN, ADM())).status).toBe(409);
  });
});
