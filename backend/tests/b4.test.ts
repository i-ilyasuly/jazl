// B4 · бағалау, ұзарту, қайта алу + көшіру, сыйлық, қайтару (TEST_DATABASE_URL)
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

d("B4", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let damdi = "";
  const h = (id = 701) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "К" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (path: string, body: object, id = 701) => app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const get = async (path: string, id = 701) => (await app.request(path, { headers: h(id) })).json();
  let n = 0; const key = () => "b4-" + Date.now() + "-" + n++;
  const buy = async (extra: object = {}, id = 701) => (await post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key(), ...extra }, id)).json();
  const q = (sql: string, p: unknown[] = []) => dbh.pool.query(sql, p).then((r) => r.rows);

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    damdi = (await q("select b.id from app.branches b join app.venues v on v.id=b.venue_id where v.slug='damdi'"))[0].id;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("бағалау: мекеме рейтингі жаңарады, жұлдыз соңғы қолдану чегіне жазылады", async () => {
    const p = (await buy()).pack.id;
    const rd = await (await post("/v1/redeem", { packId: p, qr: makeDynamicQr(TOKEN, damdi, 1).payload, units: 1, idempotencyKey: key() })).json();
    const r = await (await post("/v1/ratings", { packId: p, stars: 4, tags: ["Дәмді"], text: "Жақсы" })).json();
    expect(r.ok).toBe(true);
    expect((await q("select internal->'rating'->>'stars' s from app.receipts where id=$1", [rd.receipt.id]))[0].s).toBe("4");
    expect((await q("select reviews_count n from app.venues where slug='damdi'"))[0].n).toBe(1);
  });
  it("ұзарту: 7 күн тегін бір рет; екінші тегін — 409; 14 күн ақылы — чек 1000 ₸", async () => {
    const p = (await buy()).pack.id;
    const before = (await q("select valid_until v from app.packs where id=$1", [p]))[0].v.getTime();
    expect((await post(`/v1/packs/${p}/extend`, { days: 7, idempotencyKey: key() })).status).toBe(200);
    expect((await q("select valid_until v from app.packs where id=$1", [p]))[0].v.getTime() - before).toBe(7 * 86400_000);
    expect((await (await post(`/v1/packs/${p}/extend`, { days: 7, idempotencyKey: key() })).json()).error).toBe("free_used");
    const paid = await (await post(`/v1/packs/${p}/extend`, { days: 14, idempotencyKey: key() })).json();
    expect((await q("select total from app.receipts where id=$1", [paid.receipt.id]))[0].total).toBe(1000);
  });
  it("қайта алу: мерзімі 2 күн бұрын өткен пакеттің 3 бірлігі жаңасына көшеді (4+3=7); 5 күн өтсе — көшпейді", async () => {
    const a = (await buy()).pack.id;
    await q("update app.packs set units_left=3, valid_until=now()-interval '2 days' where id=$1", [a]);
    const r = await buy({ fromPackId: a });
    expect(r.carried).toBe(3);
    expect(r.pack).toMatchObject({ unitsTotal: 7, unitsLeft: 7 });
    expect((await q("select units_left, status from app.packs where id=$1", [a]))[0]).toEqual({ units_left: 0, status: "used" });
    const b = (await buy()).pack.id;
    await q("update app.packs set units_left=2, valid_until=now()-interval '5 days' where id=$1", [b]);
    expect((await buy({ fromPackId: b })).carried).toBe(0);
  });
  it("сыйлық: алушы қабылдайды — пакет соныкі, мерзім 30 күн қабылдаған сәттен; өзі қабылдай алмайды; екінші рет — 409", async () => {
    const g = await buy({ gift: { message: "Туған күніңмен!", anonymous: false } });
    expect(g.gift.link).toContain("startapp=gift_");
    expect((await q("select status from app.packs where id=$1", [g.pack.id]))[0].status).toBe("gifted");
    expect((await post(`/v1/gifts/${g.gift.code}/accept`, {})).status).toBe(409); // өз сыйлығы
    const info = await get(`/v1/gifts/${g.gift.code}`, 702);
    expect(info.gift).toMatchObject({ status: "sent", message: "Туған күніңмен!", from: "К701" });
    expect((await post(`/v1/gifts/${g.gift.code}/accept`, {}, 702)).status).toBe(200);
    const owner = await q("select u.telegram_id t, p.status from app.packs p join app.users u on u.id=p.user_id where p.id=$1", [g.pack.id]);
    expect(owner[0]).toEqual({ t: "702", status: "active" });
    expect((await post(`/v1/gifts/${g.gift.code}/accept`, {}, 703)).status).toBe(409);
  });
  it("сыйлық 7 күн қабылданбаса — жіберушіге қайтады; жіберуші қабылданбаған сыйлықтан бас тарта алады", async () => {
    const g = await buy({ gift: {} });
    await q("update app.gifts set expires_at=now()-interval '1 minute' where code=$1", [g.gift.code]);
    expect((await get(`/v1/gifts/${g.gift.code}`, 702)).gift.status).toBe("returned");
    expect((await q("select status from app.packs where id=$1", [g.pack.id]))[0].status).toBe("active");
    const g2 = await buy({ gift: {} });
    expect((await post(`/v1/gifts/${g2.gift.code}/cancel`, {})).status).toBe(200);
    expect((await post(`/v1/gifts/${g2.gift.code}/accept`, {}, 702)).status).toBe(409);
  });
  it("қайтару: қолданылмаған пакет — толық; бірлік жұмсалса — 409", async () => {
    const a = (await buy()).pack.id;
    const r = await (await post(`/v1/packs/${a}/refund`, {})).json();
    expect(r).toMatchObject({ ok: true, refunded: 6000 });
    expect((await q("select status from app.packs where id=$1", [a]))[0].status).toBe("refunded");
    const b = (await buy()).pack.id;
    await post("/v1/redeem", { packId: b, qr: makeDynamicQr(TOKEN, damdi, 1).payload, units: 1, idempotencyKey: key() });
    expect((await (await post(`/v1/packs/${b}/refund`, {})).json()).error).toBe("units_used");
  });
});
