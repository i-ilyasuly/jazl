// Патша ұсыныстарын қабылдады (2026-11-18): бос сағат жеңілдігі, автожаңарту, корпоративтік сыйлық, сенімділік белгісі, комиссия деңгейлері
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeDynamicQr } from "../src/qr.js";
import { makeTestCryptogram } from "../src/payments/test.js";
import { autoRenewTick } from "../src/autoRenew.js";
import { refreshVenueScores, tierFee } from "../src/venueScore.js";
import { inOffPeak, offPeakPrice } from "../src/offpeak.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;
/** Алматы уақытымен ертеңгі күн, HH:MM */
const almatyAt = (hm: string, days = 1) => { const d = new Date(Date.now() + days * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }); return new Date(`${d}T${hm}:00+05:00`); };

describe("offpeak.ts", () => {
  it("терезе Алматы уақытымен, баға 10 ₸-ге дөңгелектенеді", () => {
    const w = { days: [1, 2, 3, 4, 5, 6, 7], from: "10:00", to: "12:00" };
    expect(inOffPeak(w, almatyAt("11:00"))).toBe(true);
    expect(inOffPeak(w, almatyAt("12:00"))).toBe(false);
    expect(inOffPeak(w, almatyAt("09:59"))).toBe(false);
    expect(offPeakPrice(6000, 10)).toBe(5400);
    expect(offPeakPrice(1999, 15)).toBe(1700);
  });
  it("комиссия деңгейі: 4,7★ + 20 пікір → 9%, 4,9★ + 50 → 8%, аз пікір → жоқ", () => {
    const t = [{ rating: 4.7, reviews: 20, minus: 1 }, { rating: 4.9, reviews: 50, minus: 2 }];
    expect(tierFee(10, 4.8, 25, t)).toBe(9);
    expect(tierFee(10, 4.95, 60, t)).toBe(8);
    expect(tierFee(10, 4.95, 10, t)).toBe(null);
    expect(tierFee(10, null, 100, t)).toBe(null);
  });
});

d("Жаңа мүмкіндіктер", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let damdi = "";
  const h = (id = 901) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "К" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (path: string, body: object, id = 901) => app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const pj = async (path: string, body: object, id = 901) => (await post(path, body, id)).json();
  let n = 0; const key = () => "f-" + Date.now() + "-" + n++;
  const buy = async (extra: object = {}, id = 901, slug = "doner") => pj("/v1/purchases", { offerSlug: slug, idempotencyKey: key(), ...extra }, id);
  const q = (sql: string, p: unknown[] = []) => dbh.pool.query(sql, p).then((r) => r.rows);
  const card = async (last4: string, id: number) => (await pj("/v1/cards", { cryptogram: makeTestCryptogram(last4) }, id)).card.id as string;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    damdi = (await q("select b.id from app.branches b join app.venues v on v.id=b.venue_id where v.slug='damdi'"))[0].id;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("бос сағат: 10% арзан, тек терезедегі жоспар; QR мен терезеден тыс — жабық; каталогта терезе", async () => {
    await q(`update app.offers set rules = coalesce(rules, '{}'::jsonb) || '{"planOnly": true, "preorder": true, "offPeak": {"days": [1,2,3,4,5,6,7], "from": "10:00", "to": "12:00", "pct": 10}}'::jsonb where slug = 'doner'`);
    const r = await buy({ offPeak: true });
    expect(r.ok).toBe(true);
    expect((await q("select price_paid, off_peak->>'pct' pct from app.packs where id=$1", [r.pack.id]))[0]).toEqual({ price_paid: 5400, pct: "10" });
    const out = await pj("/v1/orders", { packId: r.pack.id, type: "plan", scheduledAt: almatyAt("15:00").toISOString(), idempotencyKey: key() });
    expect(out.error).toBe("off_peak_slot");
    const ok = await post("/v1/orders", { packId: r.pack.id, type: "plan", scheduledAt: almatyAt("11:00").toISOString(), idempotencyKey: key() });
    expect(ok.status).toBe(200);
    expect((await pj("/v1/redeem", { packId: r.pack.id, qr: makeDynamicQr(TOKEN, damdi, 1).payload, units: 1, idempotencyKey: key() })).error).toBe("plan_only");
    const cat = await (await app.request("/v1/catalog")).json();
    expect(cat.offers.find((o: { slug: string }) => o.slug === "doner").rules.offPeak).toMatchObject({ from: "10:00", to: "12:00", pct: 10 });
    // Бос сағат пакетін қайта алса — жаңасы да бос сағатпен (арзан бірлік шектеусіз пакетке өтпейді)
    await q("update app.packs set units_left = 2 where id=$1", [r.pack.id]);
    const rb = await buy({ fromPackId: r.pack.id });
    expect((await q("select price_paid, off_peak->>'pct' pct, units_total from app.packs where id=$1", [rb.pack.id]))[0]).toEqual({ price_paid: 5400, pct: "10", units_total: 6 });
    // Терезе жоқ ұсыныста бос сағатпен алу — 409
    expect((await buy({ offPeak: true }, 901, "latte")).error).toBe("no_off_peak");
    await q(`update app.offers set rules = rules - 'planOnly' - 'offPeak' where slug = 'doner'`);
  });

  it("корпоративтік сыйлық: бір төлем — 3 пакет, 3 жеке код (30 күн), 3 чек; біреуін қайтару — тек сол үлес", async () => {
    const r = await buy({ gift: { anonymous: false, message: "Компаниядан", count: 3 } }, 902);
    expect(r.ok).toBe(true);
    expect(r.gifts).toHaveLength(3);
    const pay = (await q("select id, amount, meta->'packIds' ids from app.payments where id=$1", [r.paymentId]))[0];
    expect(pay.amount).toBe(18000); expect(pay.ids).toHaveLength(3);
    expect((await q("select count(*)::int n from app.packs where id = any($1::uuid[]) and status='gifted'", [pay.ids]))[0].n).toBe(3);
    expect((await q("select count(*)::int n from app.receipts where payment_id=$1 and kind='purchase'", [pay.id]))[0].n).toBe(3);
    const days = (new Date(r.gifts[0].expiresAt).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29);
    const x = await pj(`/v1/packs/${pay.ids[1]}/refund`, {}, 902);
    expect(x).toMatchObject({ ok: true, cash: 6000 });
    expect((await q("select status, refunded from app.payments where id=$1", [pay.id]))[0]).toEqual({ status: "paid", refunded: 6000 });
    // Көп сыйлыққа @username қосылмайды
    expect((await post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key(), gift: { anonymous: false, count: 2, toUsername: "someone" } }, 902)).status).toBe(400);
  });

  it("автожаңарту: пакет біткенде сақталған картадан бір рет қана; қайта іске қосылса — екінші рет алынбайды", async () => {
    const p = (await buy({}, 903)).pack.id;
    expect((await post(`/v1/packs/${p}/auto-renew`, { on: true }, 903)).status).toBe(400); // картасыз — болмайды
    // Соңғы бірлік жоспарға жазылған болса — қызмет көрсетілгенше ақша алынбайды
    const cid = await card("4242", 903);
    expect((await pj(`/v1/packs/${p}/auto-renew`, { on: true, cardId: cid }, 903))).toMatchObject({ ok: true, autoRenew: true });
    expect(await autoRenewTick(dbh.db, cfg)).toBe(0); // әлі біткен жоқ
    const branch = (await q("select b.id from app.branches b join app.venues v on v.id=b.venue_id where v.slug='damdi'"))[0].id;
    await q("update app.packs set units_left = 0 where id=$1", [p]);
    const od = (await q("insert into app.orders (type, pack_id, user_id, branch_id, scheduled_at, code, status) select 'plan', id, user_id, $2, now() + interval '1 day', '1234', 'accepted' from app.packs where id=$1 returning id", [p, branch]))[0].id;
    expect(await autoRenewTick(dbh.db, cfg)).toBe(0); // жазылған келу әлі орындалмады
    await q("update app.orders set status = 'done' where id=$1", [od]);
    await q("update app.packs set units_left = 1, valid_until = now() - interval '1 day' where id=$1", [p]);
    expect(await autoRenewTick(dbh.db, cfg)).toBe(1);
    const old = (await q("select renewed_to, units_left from app.packs where id=$1", [p]))[0];
    expect(old.units_left).toBe(0);
    const np = (await q("select status, units_total, value_total, auto_renew, source from app.packs where id=$1", [old.renewed_to]))[0];
    expect(np).toEqual({ status: "active", units_total: 5, value_total: 6000 + 1500, auto_renew: true, source: "rebuy" });
    expect((await q("select provider, amount from app.payments where idempotency_key like $1", ["renew_" + p + "_%"]))[0]).toEqual({ provider: "test", amount: 6000 });
    expect(await autoRenewTick(dbh.db, cfg)).toBe(0); // екінші рет — жоқ
    expect((await q("select count(*)::int n from app.payments where idempotency_key like 'renew_%' and user_id = (select user_id from app.packs where id=$1)", [p]))[0].n).toBe(1);
  });

  it("автожаңарту сату лимитіне тірелсе: ақша алынбайды, автожаңарту өшпейді — келесі айдың 1-іне шегеріледі", async () => {
    const a = (await buy({}, 905)).pack.id;
    await pj(`/v1/packs/${a}/auto-renew`, { on: true, cardId: await card("4242", 905) }, 905);
    await q(`update app.offers set rules = coalesce(rules, '{}'::jsonb) || '{"perUserLimit":1}'::jsonb where slug = 'doner'`);
    await q("update app.packs set units_left = 0, status = 'used' where id=$1", [a]);
    expect(await autoRenewTick(dbh.db, cfg)).toBe(0);
    const x = (await q("select auto_renew, renewed_to, renew_retry_at > now() + interval '1 hour' as later from app.packs where id=$1", [a]))[0];
    expect(x).toEqual({ auto_renew: true, renewed_to: null, later: true });
    expect((await q("select count(*)::int n from app.payments where idempotency_key like $1", ["renew_" + a + "_%"]))[0].n).toBe(0);
    expect(await autoRenewTick(dbh.db, cfg)).toBe(0); // келесі айға дейін қайта әрекет жоқ
    await q(`update app.offers set rules = rules - 'perUserLimit' where slug = 'doner'`);
    await q("update app.packs set renew_retry_at = now() - interval '1 minute' where id=$1", [a]);
    expect(await autoRenewTick(dbh.db, cfg)).toBe(1); // 1-і келді, шек жоқ — жаңарды
  });

  it("кері байланыс: автожаңартуды өшіру себебі сақталады (бөтен пакет байланбайды)", async () => {
    const a = (await buy({}, 906)).pack.id;
    expect((await post("/v1/feedback", { kind: "renew_off", reason: "price", packId: a }, 906)).status).toBe(200);
    expect((await post("/v1/feedback", { kind: "renew_off", reason: "other", packId: a }, 907)).status).toBe(200);
    expect((await post("/v1/feedback", { kind: "renew_off", reason: "hack" }, 906)).status).toBe(400);
    const rows = await q("select reason, pack_id from app.feedback order by created_at");
    expect(rows.map((r: { reason: string; pack_id: string | null }) => [r.reason, r.pack_id])).toEqual([["price", a], ["other", null]]);
  });

  it("автожаңарту тоқтайды: банк бас тартса не баға көтерілсе — ақша алынбайды, автожаңарту өшеді", async () => {
    const a = (await buy({}, 904)).pack.id;
    await pj(`/v1/packs/${a}/auto-renew`, { on: true, cardId: await card("0002", 904) }, 904);
    await q("update app.packs set units_left = 0, status = 'used' where id=$1", [a]);
    expect(await autoRenewTick(dbh.db, cfg)).toBe(0);
    expect((await q("select auto_renew, renewed_to from app.packs where id=$1", [a]))[0]).toEqual({ auto_renew: false, renewed_to: null });
    // Біткен пакетте қосуға болмайды; белсенді пакетте басқа картамен қайта қосса — жаңа келісім, жаңа әрекет (бұрынғы сәтсіз кілт кедергі емес)
    expect((await pj(`/v1/packs/${a}/auto-renew`, { on: true, cardId: await card("4242", 904) }, 904)).error).toBe("pack_finished");
    await q("update app.packs set units_left = 1, status = 'active' where id=$1", [a]);
    await new Promise((r) => setTimeout(r, 1100)); // келісім уақыты (секунд) өзгерсін
    expect((await pj(`/v1/packs/${a}/auto-renew`, { on: true, cardId: await card("4242", 904) }, 904)).ok).toBe(true);
    await q("update app.packs set units_left = 0, status = 'used' where id=$1", [a]);
    expect(await autoRenewTick(dbh.db, cfg)).toBe(1);
    const b = (await buy({}, 905)).pack.id;
    await pj(`/v1/packs/${b}/auto-renew`, { on: true, cardId: await card("4242", 905) }, 905);
    await q("update app.packs set units_left = 0, status = 'used' where id=$1", [b]);
    await q("update app.offers set price = price + 500 where slug='doner'");
    expect(await autoRenewTick(dbh.db, cfg)).toBe(0);
    expect((await q("select auto_renew from app.packs where id=$1", [b]))[0].auto_renew).toBe(false);
    expect((await q("select count(*)::int n from app.payments where idempotency_key like $1", ["renew_" + b + "_%"]))[0].n).toBe(0);
    await q("update app.offers set price = price - 500 where slug='doner'");
  });

  it("комиссия деңгейі: рейтинг 4,8 + 25 пікір → 9%; жаңа қолдану 9%-бен, ескісі өзгермейді; Басқару қойғаны басым", async () => {
    const p = (await buy({}, 906)).pack.id;
    await pj("/v1/redeem", { packId: p, qr: makeDynamicQr(TOKEN, damdi, 1).payload, units: 1, idempotencyKey: key() }, 906);
    await q("update app.venues set rating = 4.8, reviews_count = 25, fee_pct = null where slug='damdi'");
    await refreshVenueScores(dbh.db, cfg);
    expect((await q("select auto_fee_pct from app.venues where slug='damdi'"))[0].auto_fee_pct).toBe(9);
    await pj("/v1/redeem", { packId: p, qr: makeDynamicQr(TOKEN, damdi, 1).payload, units: 1, idempotencyKey: key() }, 906);
    expect((await q("select fee_pct from app.redemptions where pack_id=$1 order by created_at", [p])).map((x) => x.fee_pct)).toEqual([10, 9]);
    await q("update app.venues set fee_pct = 7 where slug='damdi'");
    await pj("/v1/redeem", { packId: p, qr: makeDynamicQr(TOKEN, damdi, 1).payload, units: 1, idempotencyKey: key() }, 906);
    expect((await q("select fee_pct from app.redemptions where pack_id=$1 order by created_at desc limit 1", [p]))[0].fee_pct).toBe(7);
    await q("update app.venues set fee_pct = null, rating = null, reviews_count = 0, auto_fee_pct = null where slug='damdi'");
  });

  it("сенімділік: 20-дан аз жағдай — белгі жоқ; 20+ шағымсыз — 100%, каталогта trust", async () => {
    const cat0 = await (await app.request("/v1/catalog")).json();
    expect(cat0.venues.find((v: { slug: string }) => v.slug === "damdi").trust).toBe(null);
    const p = (await buy({}, 907)).pack.id;
    await q("insert into app.redemptions (pack_id, branch_id, units, amount, fee_pct) select $1, $2, 1, 1500, 10 from generate_series(1, 25)", [p, damdi]);
    await refreshVenueScores(dbh.db, cfg);
    const v = (await q("select reliability, reliability_n from app.venues where slug='damdi'"))[0];
    expect(v.reliability).toBe(100); expect(v.reliability_n).toBeGreaterThanOrEqual(25);
    const cat = await (await app.request("/v1/catalog")).json();
    expect(cat.venues.find((x: { slug: string }) => x.slug === "damdi").trust).toBe(100);
  });
});
