// B3 · пакетті қолдану: QR, тапсырыс, жоспар, бас тарту, кассир растауы, қатар сұраулар (TEST_DATABASE_URL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeDynamicQr } from "../src/qr.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("B3 қолдану", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  let damdiBranch = ""; let kebabBranch = "";
  const h = (id = 601) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (path: string, body: object, id = 601) => app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  let n = 0; const key = () => "k-" + Date.now() + "-" + n++;
  const buy = async (id = 601) => (await (await post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, id)).json()).pack.id as string;
  const left = async (packId: string) => (await dbh.pool.query("select units_left, status from app.packs where id = $1", [packId])).rows[0];

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    damdiBranch = (await dbh.pool.query("select b.id from app.branches b join app.venues v on v.id=b.venue_id where v.slug='damdi'")).rows[0].id;
    kebabBranch = (await dbh.pool.query("select b.id from app.branches b join app.venues v on v.id=b.venue_id where v.slug='kebab'")).rows[0].id;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("QR: бір бірлік шегеріледі, «use» чегі жазылады", async () => {
    const p = await buy();
    const r = await (await post("/v1/redeem", { packId: p, qr: `https://t.me/oylarbot?startapp=br_${damdiBranch}`, idempotencyKey: key() })).json();
    expect(r).toMatchObject({ ok: true, left: 3 });
    const rc = (await dbh.pool.query("select internal from app.receipts where id = $1", [r.receipt.id])).rows[0].internal;
    expect(rc.fulfillment).toMatchObject({ type: "scan", branchId: damdiBranch });
    expect(rc.customer.fullName).toBe("Клиент601");
  });
  it("бөтен мекеменің QR-ы — 409, бірлік орнында; Jazl QR емес — 400", async () => {
    const p = await buy();
    expect((await post("/v1/redeem", { packId: p, qr: "JZB1:" + kebabBranch, idempotencyKey: key() })).status).toBe(409);
    expect((await left(p)).units_left).toBe(4);
    expect((await post("/v1/redeem", { packId: p, qr: "https://kaspi.kz/pay/123", idempotencyKey: key() })).status).toBe(400);
  });
  it("қатар 6 сұрау, 4 бірлік: дәл 4-еуі өтеді, бірлік екі рет жұмсалмайды", async () => {
    const p = await buy();
    const res = await Promise.all(Array.from({ length: 6 }, () => post("/v1/redeem", { packId: p, qr: "JZB1:" + damdiBranch, idempotencyKey: key() })));
    const codes = res.map((r) => r.status).sort();
    expect(codes).toEqual([200, 200, 200, 200, 409, 409]);
    expect(await left(p)).toEqual({ units_left: 0, status: "used" });
  });
  it("сол кілтпен қайталанған QR — екінші рет шегерілмейді", async () => {
    const p = await buy(); const k = key();
    await post("/v1/redeem", { packId: p, qr: "JZB1:" + damdiBranch, idempotencyKey: k });
    const again = await (await post("/v1/redeem", { packId: p, qr: "JZB1:" + damdiBranch, idempotencyKey: k })).json();
    expect(again.repeated).toBe(true);
    expect((await left(p)).units_left).toBe(3);
  });
  it("динамикалық QR: кассир 2 дана енгізді — клиент 1 жіберсе 409 (expectedUnits 2), 2 жіберсе өтеді", async () => {
    const p = await buy();
    const qr = makeDynamicQr(TOKEN, damdiBranch, 2).payload;
    const res = await (await post("/v1/qr/resolve", { qr })).json();
    expect(res).toMatchObject({ ok: true, kind: "dynamic", units: 2, venue: { name: "Dämdi Doner" }, valid: true, expired: false });
    const one = await post("/v1/redeem", { packId: p, qr, units: 1, idempotencyKey: key() });
    expect(one.status).toBe(409); expect(await one.json()).toMatchObject({ error: "units_mismatch", expectedUnits: 2 });
    const two = await (await post("/v1/redeem", { packId: p, qr, units: 2, idempotencyKey: key() })).json();
    expect(two).toMatchObject({ ok: true, units: 2, left: 2 });
  });
  it("динамикалық QR: 45 с өтсе — мерзімі өтті; қолтаңба бұрмаланса — 400", async () => {
    const p = await buy();
    const old = makeDynamicQr(TOKEN, damdiBranch, 1, Math.floor(Date.now() / 1000) - 60).payload;
    expect((await (await post("/v1/redeem", { packId: p, qr: old, idempotencyKey: key() })).json()).error).toBe("qr_expired");
    const bad = makeDynamicQr(TOKEN, damdiBranch, 1).payload.replace(/.$/, (ch) => (ch === "0" ? "1" : "0"));
    expect((await post("/v1/redeem", { packId: p, qr: bad, idempotencyKey: key() })).status).toBe(400);
    expect((await left(p)).units_left).toBe(4);
  });
  it("банк терминалы: 3 000 ₸ = 2 донер — 1 дана жіберсе «+ басыңыз» (expectedUnits 2); 2000 ₸ — сома сәйкес емес", async () => {
    const p = await buy();
    const qr = `https://t.me/oylarbot?startapp=br_${damdiBranch}&amount=3000`;
    const one = await (await post("/v1/redeem", { packId: p, qr, units: 1, idempotencyKey: key() })).json();
    expect(one).toMatchObject({ error: "units_mismatch", expectedUnits: 2, unitPrice: 1500 });
    expect((await (await post("/v1/redeem", { packId: p, qr, units: 2, idempotencyKey: key() })).json()).left).toBe(2);
    const bad = await (await post("/v1/redeem", { packId: p, qr: qr.replace("3000", "2000"), units: 1, idempotencyKey: key() })).json();
    expect(bad.error).toBe("amount_mismatch");
  });
  it("бөтен мекеме: қатеде мекеменің аты қайтады", async () => {
    const p = await buy();
    const r = await (await post("/v1/redeem", { packId: p, qr: makeDynamicQr(TOKEN, kebabBranch, 1).payload, idempotencyKey: key() })).json();
    expect(r).toMatchObject({ error: "other_venue", venue: "Kebab House" });
  });
  it("тапсырыс (қазір): 4 таңбалы код; мекеме қабылдамай тұрып бас тартса — бірлік қайтады", async () => {
    const p = await buy();
    const o = await (await post("/v1/orders", { packId: p, type: "now", idempotencyKey: key() })).json();
    expect(o.order.code).toMatch(/^\d{4}$/);
    expect(o.left).toBe(3);
    expect((await post(`/v1/orders/${o.order.id}/cancel`, {})).status).toBe(200);
    expect((await left(p)).units_left).toBe(4);
  });
  it("жоспар: 3 сағаттан кейін — бас тартуға болады; 1 сағатта — кеш; өткен уақыт — 400", async () => {
    const p = await buy();
    const far = await (await post("/v1/orders", { packId: p, type: "plan", scheduledAt: new Date(Date.now() + 3 * 3600_000).toISOString(), idempotencyKey: key() })).json();
    const near = await (await post("/v1/orders", { packId: p, type: "plan", scheduledAt: new Date(Date.now() + 3600_000).toISOString(), idempotencyKey: key() })).json();
    expect((await post(`/v1/orders/${far.order.id}/cancel`, {})).status).toBe(200);
    const late = await post(`/v1/orders/${near.order.id}/cancel`, {});
    expect(late.status).toBe(409); expect((await late.json()).error).toBe("too_late");
    expect((await post("/v1/orders", { packId: p, type: "plan", scheduledAt: new Date(Date.now() - 60_000).toISOString(), idempotencyKey: key() })).status).toBe(400);
    const rc = (await dbh.pool.query("select internal from app.receipts where internal->>'orderId' = $1", [far.order.id])).rows[0].internal;
    expect(rc.status.current).toBe("cancelled");
    expect(rc.fulfillment.type).toBe("plan");
  });
  it("кассир: персонал емес — 403; дұрыс код — тапсырыс беріледі; қате код — 404", async () => {
    const p = await buy();
    const o = await (await post("/v1/orders", { packId: p, type: "now", idempotencyKey: key() })).json();
    expect((await post("/v1/venue/orders/verify", { code: o.order.code }, 900)).status).toBe(403);
    await app.request("/v1/me", { headers: h(900) }); // кассир тіркелсін
    await dbh.pool.query("insert into app.venue_staff (venue_id, user_id, role) select v.id, u.id, 'cashier' from app.venues v, app.users u where v.slug='damdi' and u.telegram_id=900");
    const list = await (await app.request("/v1/venue/orders", { headers: h(900) })).json();
    expect(list.orders.some((x: { id: string }) => x.id === o.order.id)).toBe(true);
    expect(JSON.stringify(list)).not.toContain(o.order.code); // кассирге код көрсетілмейді
    const wrong = o.order.code === "1111" ? "2222" : "1111";
    expect((await post("/v1/venue/orders/verify", { code: wrong }, 900)).status).toBe(404);
    const ok = await (await post("/v1/venue/orders/verify", { code: o.order.code }, 900)).json();
    expect(ok.order.no).toBe(o.order.no);
    const rc = (await dbh.pool.query("select internal from app.receipts where internal->>'orderId' = $1", [o.order.id])).rows[0].internal;
    expect(rc.status.current).toBe("done");
  });
});
