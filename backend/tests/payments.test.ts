// Карта төлемі (src/payments, сынақ провайдері): криптограмма (карта нөмірінсіз), сақталған карта, 3-D Secure, бас тарту, вебхук (TEST_DATABASE_URL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeTestCryptogram } from "../src/payments/test.js";
import { paymentProvider } from "../src/payments/index.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Карта төлемі", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  const U = 1101;
  const h = (id = U) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (p: string, body: object, id = U) => app.request(p, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const get = (p: string, id = U) => app.request(p, { headers: h(id) });
  let n = 0; const key = () => "k-" + Date.now() + "-" + n++;
  const buy = (card: object, k = key()) => post("/v1/purchases", { offerSlug: "doner", method: "card", card, idempotencyKey: k });
  const packsCount = async () => (await (await get("/v1/packs")).json()).packs.length as number;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("•• 4242 + сақтау: бірден өтеді, карта сақталады (тек бренд, соңғы 4, мерзім), чекте карта атауы", async () => {
    const r = await buy({ cryptogram: makeTestCryptogram("4242"), save: true });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ status: "paid", pack: { status: "active" } });
    const cards = (await (await get("/v1/cards")).json()).cards;
    expect(cards).toEqual([expect.objectContaining({ brand: "Visa", last4: "4242", exp: "08/28" })]);
    expect(JSON.stringify(cards)).not.toMatch(/tok_/); // токен клиентке көрінбейді
    const row = (await dbh.pool.query("select token from app.payment_cards")).rows[0];
    expect(row.token).toMatch(/^tok_/);
  });

  it("сақталған картамен: 3-D Secure-сіз өтеді, төлем әдісі «Visa •• 4242»", async () => {
    const card = (await (await get("/v1/cards")).json()).cards[0];
    const j = await (await buy({ id: card.id })).json();
    expect(j.status).toBe("paid");
    expect(j.receipt.payment.label).toBe("Visa •• 4242");
    expect((await buy({ id: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });

  it("жаңа карта: банк растауы (3-D Secure) → расталса пакет беріледі; қайталанған сұрау — сол нәтиже", async () => {
    const before = await packsCount();
    const k = key();
    const r = await buy({ cryptogram: makeTestCryptogram("1111") }, k);
    expect(r.status).toBe(202);
    const j = await r.json();
    expect(j).toMatchObject({ status: "action_required", confirmUrl: `app:/pay/3ds/${j.paymentId}` });
    expect(await packsCount()).toBe(before); // әлі берілмеді
    expect((await get(`/v1/payments/${j.paymentId}`)).status).toBe(202);
    expect((await buy({ cryptogram: makeTestCryptogram("1111") }, k)).status).toBe(202); // қайталанса — екінші төлем жоқ
    const ok = await (await post(`/v1/payments/${j.paymentId}/test-3ds`, { approve: true })).json();
    expect(ok).toMatchObject({ status: "paid", pack: { status: "active" } });
    expect(await packsCount()).toBe(before + 1);
    expect((await (await buy({ cryptogram: makeTestCryptogram("1111") }, k)).json())).toMatchObject({ status: "paid", repeated: true });
    expect((await dbh.pool.query("select count(*)::int as n from app.payments where idempotency_key = $1", [k])).rows[0].n).toBe(1);
  });

  it("3-D Secure-ден бас тартса, банк қабылдамаса, қаражат жетпесе — 402, пакет берілмейді", async () => {
    const before = await packsCount();
    const j = await (await buy({ cryptogram: makeTestCryptogram("1234") })).json();
    const no = await post(`/v1/payments/${j.paymentId}/test-3ds`, { approve: false });
    expect(no.status).toBe(402); expect((await no.json()).reason).toBe("3ds_failed");
    const dec = await buy({ cryptogram: makeTestCryptogram("0002") });
    expect(dec.status).toBe(402); expect((await dec.json()).reason).toBe("declined");
    expect((await (await buy({ cryptogram: makeTestCryptogram("9995") })).json()).reason).toBe("insufficient_funds");
    expect((await (await buy({ cryptogram: makeTestCryptogram("4242", "01/20") })).json()).reason).toBe("expired_card");
    expect((await buy({ cryptogram: "4400430123456789" })).status).toBe(402); // карта нөмірі (криптограмма емес) — қабылданбайды
    expect(await packsCount()).toBe(before);
  });

  it("вебхук: қолтаңбасыз — 401; дұрыс — пакет беріледі; қайталанса — екі рет берілмейді", async () => {
    const j = await (await buy({ cryptogram: makeTestCryptogram("5555") })).json();
    const ext = (await dbh.pool.query("select external_id from app.payments where id = $1", [j.paymentId])).rows[0].external_id;
    const body = JSON.stringify({ externalId: ext, status: "paid" });
    expect((await app.request("/payments/webhook/test", { method: "POST", body, headers: { "x-test-signature": "wrong" } })).status).toBe(401);
    const sig = (paymentProvider(cfg) as unknown as { sign: (b: string) => string }).sign(body);
    for (let i = 0; i < 2; i++) expect((await app.request("/payments/webhook/test", { method: "POST", body, headers: { "x-test-signature": sig } })).status).toBe(200);
    expect((await (await get(`/v1/payments/${j.paymentId}`)).json()).status).toBe("paid");
    expect((await dbh.pool.query("select count(*)::int as n from app.receipts where payment_id = $1", [j.paymentId])).rows[0].n).toBe(1);
  });

  it("вебхук: сома сәйкес келмесе — 409, төлем расталмайды; белгісіз провайдер — 404", async () => {
    const j = await (await buy({ cryptogram: makeTestCryptogram("5556") })).json();
    const ext = (await dbh.pool.query("select external_id from app.payments where id = $1", [j.paymentId])).rows[0].external_id;
    const body = JSON.stringify({ externalId: ext, status: "paid", amount: 1 });
    const sig = (paymentProvider(cfg) as unknown as { sign: (b: string) => string }).sign(body);
    expect((await app.request("/payments/webhook/test", { method: "POST", body, headers: { "x-test-signature": sig } })).status).toBe(409);
    expect((await (await get(`/v1/payments/${j.paymentId}`)).json()).status).not.toBe("paid");
    expect((await app.request("/payments/webhook/nobank", { method: "POST", body, headers: {} })).status).toBe(404);
  });

  it("қайтару: провайдерден жауап келмесе — «белгісіз» (pending), «сәтсіз» емес: Басқару қайта жібере алмайды", async () => {
    const { pushRefund } = await import("../src/refund.js");
    const p = paymentProvider(cfg); const orig = p.refund;
    const pid = (await dbh.pool.query("select id from app.payments where status = 'paid' and provider = 'test' order by created_at desc limit 1")).rows[0].id;
    await dbh.pool.query("update app.payments set refund_status = 'pending', refunded = 100, meta = coalesce(meta, '{}'::jsonb) || '{\"lastRefund\": 100}'::jsonb where id = $1", [pid]);
    p.refund = async () => { throw new Error("timeout"); };
    try { expect(await pushRefund(dbh.db, cfg, pid)).toBe("unknown"); } finally { p.refund = orig; }
    expect((await dbh.pool.query("select refund_status, refund_failure from app.payments where id = $1", [pid])).rows[0]).toEqual({ refund_status: "pending", refund_failure: "provider_no_answer" });
  });

  it("карта өшіру; басқа адамның төлемі мен картасы көрінбейді", async () => {
    const card = (await (await get("/v1/cards")).json()).cards[0];
    expect((await get("/v1/cards", 1102).then((r) => r.json())).cards).toEqual([]);
    await post(`/v1/cards/${card.id}/remove`, {}, 1102); // бөтен адам — әсері жоқ
    expect((await (await get("/v1/cards")).json()).cards).toHaveLength(1);
    await post(`/v1/cards/${card.id}/remove`, {});
    expect((await (await get("/v1/cards")).json()).cards).toEqual([]);
    const added = await (await post("/v1/cards", { cryptogram: makeTestCryptogram("4444", "12/29", "Mastercard") })).json();
    expect(added.card).toMatchObject({ brand: "Mastercard", last4: "4444", exp: "12/29" });
  });

  it("ұзарту картамен: жаңа карта — банк растауы → мерзім жылжиды, «extend» чегі; сақталған карта — бірден; бас тарту — мерзім өзгермейді", async () => {
    const pack = (await (await buy({ cryptogram: makeTestCryptogram("4242"), save: true })).json()).pack;
    const until0 = new Date(pack.validUntil).getTime();
    const ext = (card: object, days = 14) => post(`/v1/packs/${pack.id}/extend`, { days, card, idempotencyKey: key() });
    const r = await ext({ cryptogram: makeTestCryptogram("1111") });
    expect(r.status).toBe(202);
    const j = await r.json();
    const ok = await (await post(`/v1/payments/${j.paymentId}/test-3ds`, { approve: true })).json();
    expect(ok).toMatchObject({ status: "paid", kind: "extend" });
    expect(new Date(ok.pack.validUntil).getTime() - until0).toBeGreaterThanOrEqual(14 * 86400_000 - 5000);
    expect((await dbh.pool.query("select count(*)::int as n from app.receipts where payment_id = $1 and kind = 'extend'", [j.paymentId])).rows[0].n).toBe(1);
    const card = (await (await get("/v1/cards")).json()).cards.find((x: { last4: string }) => x.last4 === "4242");
    const saved = await (await ext({ id: card.id }, 30)).json();
    expect(saved.status).toBe("paid");
    const before = (await dbh.pool.query("select valid_until from app.packs where id = $1", [pack.id])).rows[0].valid_until.getTime();
    expect((await ext({ cryptogram: makeTestCryptogram("0002") })).status).toBe(402);
    expect((await dbh.pool.query("select valid_until from app.packs where id = $1", [pack.id])).rows[0].valid_until.getTime()).toBe(before);
  });

  it("сыйлық пен қайта алу картамен: 3-D Secure-ден кейін сыйлық коды мен көшкен бірлік беріледі", async () => {
    const g = await (await post("/v1/purchases", { offerSlug: "doner", method: "card", card: { cryptogram: makeTestCryptogram("1111") }, gift: { message: "Құтты болсын" }, idempotencyKey: key() })).json();
    expect(g.status).toBe("action_required");
    const gd = await (await post(`/v1/payments/${g.paymentId}/test-3ds`, { approve: true })).json();
    expect(gd.gift.code).toMatch(/^[0-9a-f]{10}$/);
    expect(gd.pack.status).toBe("gifted");
    const old = (await (await buy({ cryptogram: makeTestCryptogram("4242") })).json()).pack;
    const rb = await (await post("/v1/purchases", { offerSlug: "doner", method: "card", card: { cryptogram: makeTestCryptogram("4242") }, fromPackId: old.id, idempotencyKey: key() })).json();
    expect(rb.status).toBe("paid"); expect(rb.carried).toBe(old.unitsLeft);
  });
});
