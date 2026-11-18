// Ақша есебінің түзетулері (Патша, 2026-11-18): тиын жоғалмайды, көшірілген бірлік толық бағасымен, қайтару нақты және бонус бонусқа,
// сыйлықты тек беруші қайтарады, бір пакетке бір баға, ұзарту шегі 60 күн (TEST_DATABASE_URL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeDynamicQr } from "../src/qr.js";
import { leftValue, takeValue } from "../src/value.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

describe("value.ts: бірлікке бөлу", () => {
  it("10 000 ₸ / 3 → 3333 + 3333 + 3334, қосындысы дәл 10 000", () => {
    const parts = [takeValue(10000, 3, 3, 1), takeValue(10000, 3, 2, 1), takeValue(10000, 3, 1, 1)];
    expect(parts).toEqual([3333, 3333, 3334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(leftValue(10000, 3, 1)).toBe(3334);
  });
  it("кез келген бөлу ретінде: жұмсалғаны + қалғаны = толық құн", () => {
    for (const [V, T] of [[13500, 15], [999, 7], [6000, 4], [1, 3]]) {
      let left = T, spent = 0;
      while (left > 0) { const n = Math.min(left, 1 + (left % 2)); spent += takeValue(V, T, left, n); left -= n; expect(spent + leftValue(V, T, left)).toBe(V); }
      expect(spent).toBe(V);
    }
  });
});

d("Ақша есебі", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let damdi = "";
  const h = (id = 801, username?: string) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "К" + id, ...(username ? { username } : {}) }) }, TOKEN), "Content-Type": "application/json" });
  const post = (path: string, body: object, id = 801) => app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const pj = async (path: string, body: object, id = 801) => (await post(path, body, id)).json();
  let n = 0; const key = () => "m-" + Date.now() + "-" + n++;
  const buy = async (extra: object = {}, id = 801) => pj("/v1/purchases", { offerSlug: "doner", idempotencyKey: key(), ...extra }, id);
  const redeem = (packId: string, units = 1, id = 801) => pj("/v1/redeem", { packId, qr: makeDynamicQr(TOKEN, damdi, units).payload, units, idempotencyKey: key() }, id);
  const q = (sql: string, p: unknown[] = []) => dbh.pool.query(sql, p).then((r) => r.rows);
  const userId = async (tg: number) => (await q("select id from app.users where telegram_id=$1", [tg]))[0].id as string;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    damdi = (await q("select b.id from app.branches b join app.venues v on v.id=b.venue_id where v.slug='damdi'"))[0].id;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("тиын жоғалмайды: 10 000 ₸ / 3 бірлік — қолданулар 3333 + 3333 + 3334", async () => {
    const p = (await buy()).pack.id;
    await q("update app.packs set value_total=10000, units_total=3, units_left=3 where id=$1", [p]);
    for (let i = 0; i < 3; i++) expect((await redeem(p)).ok).toBe(true);
    const a = (await q("select amount from app.redemptions where pack_id=$1 order by created_at", [p])).map((x) => x.amount);
    expect(a).toEqual([3333, 3333, 3334]);
  });

  it("қайта алу: көшірілген 3 бірлік ескі бағасымен — мекеме әр бірліктен 1 500 ₸ алады (бұрын 857 ₸)", async () => {
    const a = (await buy()).pack.id;
    await q("update app.packs set units_left=3, valid_until=now()-interval '1 day' where id=$1", [a]);
    const r = await buy({ fromPackId: a });
    expect(r.carried).toBe(3);
    const np = (await q("select value_total, units_total from app.packs where id=$1", [r.pack.id]))[0];
    expect(np).toEqual({ value_total: 6000 + 4500, units_total: 7 });
    let total = 0;
    for (let i = 0; i < 7; i++) { const x = await redeem(r.pack.id); expect(x.ok).toBe(true); }
    for (const x of await q("select amount from app.redemptions where pack_id=$1", [r.pack.id])) { expect(x.amount).toBe(1500); total += x.amount; }
    expect(total).toBe(10500);
  });

  it("бонус: күйген қалдық толық құнмен (көшірілген бірлік ескеріледі)", async () => {
    const a = (await buy()).pack.id;
    await q("update app.packs set units_left=2, valid_until=now()-interval '1 day' where id=$1", [a]);
    const r = await buy({ fromPackId: a });
    await q("update app.packs set units_left=1, valid_until=now()-interval '10 days' where id=$1", [r.pack.id]);
    const { creditBreakage } = await import("../src/bonus.js");
    await creditBreakage(dbh.db);
    // 6000 + 3000 = 9000 / 6 бірлік = 1500; 1 бірлік қалды → 1500 ₸ бонус
    expect((await q("select amount from app.bonuses where pack_id=$1", [r.pack.id]))[0].amount).toBe(1500);
  });

  it("қайтару: бонус бөлігі бонусқа, карта бөлігі провайдер арқылы (refund_status done)", async () => {
    await buy({}, 808); // пайдаланушы жасалсын
    const uid = await userId(808);
    await q("insert into app.bonuses (user_id, kind, amount, \"left\", units, expires_at) values ($1, 'manual', 1000, 1000, 0, now() + interval '1 month')", [uid]);
    const r = await buy({ useBonus: true }, 808);
    const pay = (await q("select id, amount from app.payments where pack_id=$1", [r.pack.id]))[0];
    expect(pay.amount).toBe(5000);
    const bonusAfterBuy = (await q("select coalesce(sum(\"left\"),0)::int s from app.bonuses where user_id=$1 and kind='manual'", [uid]))[0].s;
    const x = await pj(`/v1/packs/${r.pack.id}/refund`, {}, 808);
    expect(x).toMatchObject({ ok: true, refunded: 6000, cash: 5000, bonus: 1000, refundStatus: "done" });
    expect((await q("select status, refunded, refund_status from app.payments where id=$1", [pay.id]))[0]).toEqual({ status: "refunded", refunded: 5000, refund_status: "done" });
    expect((await q("select coalesce(sum(\"left\"),0)::int s from app.bonuses where user_id=$1 and kind='manual'", [uid]))[0].s).toBe(bonusAfterBuy + 1000);
  });

  it("қайтару: провайдер қабылдамаса — failed, Басқару қайта жібере алады", async () => {
    const r = await buy({}, 802);
    await q("update app.payments set external_id = 'test_fail_' || id where pack_id=$1", [r.pack.id]);
    const x = await pj(`/v1/packs/${r.pack.id}/refund`, {}, 802);
    expect(x).toMatchObject({ ok: true, cash: 6000, refundStatus: "failed" });
    expect((await q("select refund_status, refund_failure from app.payments where pack_id=$1", [r.pack.id]))[0]).toEqual({ refund_status: "failed", refund_failure: "declined" });
    const { pushRefund } = await import("../src/refund.js");
    const pid = (await q("select id from app.payments where pack_id=$1", [r.pack.id]))[0].id;
    await q("update app.payments set external_id = 'test_ok_' || id where id=$1", [pid]);
    expect(await pushRefund(dbh.db, cfg, pid)).toBe("done");
  });

  it("қайта алынған пакетті қайтарса — көшірілген бірліктер ескі пакетке оралады", async () => {
    const a = (await buy({}, 803)).pack.id;
    await q("update app.packs set units_left=2 where id=$1", [a]);
    const r = await buy({ fromPackId: a }, 803);
    expect(r.carried).toBe(2);
    const x = await pj(`/v1/packs/${r.pack.id}/refund`, {}, 803);
    expect(x).toMatchObject({ ok: true, cash: 6000, carriedBack: 2 });
    expect((await q("select units_left, status from app.packs where id=$1", [a]))[0]).toEqual({ units_left: 2, status: "active" });
  });

  it("сыйлық: алушы қайтара алмайды; беруші — тек қабылданбай тұрып (код жойылады)", async () => {
    const g = await buy({ gift: { anonymous: false } }, 804);
    const code = g.gift.code as string;
    expect((await pj(`/v1/gifts/${code}/accept`, {}, 805)).ok).toBe(true);
    expect((await pj(`/v1/packs/${g.pack.id}/refund`, {}, 805)).error).toBe("gift_refund_giver");
    expect((await pj(`/v1/packs/${g.pack.id}/refund`, {}, 804)).error).toBe("gift_accepted");
    const g2 = await buy({ gift: { anonymous: false } }, 804);
    const x = await pj(`/v1/packs/${g2.pack.id}/refund`, {}, 804);
    expect(x).toMatchObject({ ok: true, cash: 6000 });
    expect((await post(`/v1/gifts/${g2.gift.code}/accept`, {}, 805)).status).toBe(409);
    // Беруші сыйлықты болдырмаса — пакет өзіне оралады, сонда өзі қайтара алады
    const g3 = await buy({ gift: { anonymous: false } }, 804);
    expect((await post(`/v1/gifts/${g3.gift.code}/cancel`, {}, 804)).status).toBe(200);
    expect((await pj(`/v1/packs/${g3.pack.id}/refund`, {}, 804))).toMatchObject({ ok: true, cash: 6000 });
  });

  it("бағалау: қолданбай тұрып — 409; бір пакетке бір баға (қайта бағаласа ауысады)", async () => {
    const p = (await buy({}, 806)).pack.id;
    expect((await post("/v1/ratings", { packId: p, stars: 1, tags: [] }, 806)).status).toBe(409);
    await redeem(p, 1, 806);
    for (const stars of [1, 1, 1, 5]) expect((await post("/v1/ratings", { packId: p, stars, tags: [] }, 806)).status).toBe(200);
    expect(await q("select stars from app.ratings where pack_id=$1", [p])).toEqual([{ stars: 5 }]);
  });

  it("ұзарту шегі 60 күн: 7 (тегін) + 30 + 14 = 51; тағы 14 — 409 extend_limit, ақша алынбайды", async () => {
    const p = (await buy({}, 807)).pack.id;
    for (const days of [7, 30, 14]) expect((await post(`/v1/packs/${p}/extend`, { days, idempotencyKey: key() }, 807)).status).toBe(200);
    const before = (await q("select count(*)::int n from app.payments where pack_id=$1", [p]))[0].n;
    const x = await pj(`/v1/packs/${p}/extend`, { days: 14, idempotencyKey: key() }, 807);
    expect(x).toMatchObject({ ok: false, error: "extend_limit", left: 9, max: 60 });
    expect((await q("select count(*)::int n from app.payments where pack_id=$1", [p]))[0].n).toBe(before);
    const packs = await (await app.request("/v1/packs", { headers: h(807) })).json();
    expect(packs.packs.find((x: { id: string }) => x.id === p).extendLeft).toBe(9);
  });
});
