// B2 · сатып алу, пакеттер, чектер (жергілікті PostgreSQL: TEST_DATABASE_URL)
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

d("B2 сатып алу", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", JAZL_FEE_PCT: "10" });
  let dbh: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createApp>;
  const h = (id = 501) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Сатып алушы" }) }, TOKEN), "Content-Type": "application/json", "X-Tg-Platform": "android", "User-Agent": "vitest" });
  const buy = (body: object, id = 501) => app.request("/v1/purchases", { method: "POST", headers: h(id), body: JSON.stringify(body) });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable");
    dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("пакет сатып алу: баға серверде, пакет белсенді, чек толық", async () => {
    const res = await buy({ offerSlug: "doner", method: "kaspi", methodLabel: "Kaspi Pay", idempotencyKey: "key-0001-abcdef" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.pack).toMatchObject({ offerSlug: "doner", unitsTotal: 4, unitsLeft: 4, pricePaid: 6000, status: "active" });
    expect(j.receipt.no).toMatch(/^JZ-1000\d\d$/);
    expect(j.receipt).toMatchObject({ total: 6000, status: "Төленді", seller: { name: "Dämdi Doner", address: "Нұркен Әбдіров, 24" }, item: { units: 4, pricePerUnit: 1500, regularPricePerUnit: 2000, saving: 2000, discountPct: 25 }, payment: { label: "Kaspi Pay", mode: "test" } });
    expect(j.receipt.internal).toBeUndefined(); // ішкі бөлік клиентке берілмейді
    const r = await dbh.pool.query("select internal from app.receipts where id = $1", [j.receipt.id]);
    expect(r.rows[0].internal.money).toMatchObject({ jazlFee: 600, venuePayout: 5400 });
    expect(r.rows[0].internal.client).toMatchObject({ platform: "android", userAgent: "vitest" });
  });
  it("сол кілтпен қайта жіберсе — екінші төлем жоқ", async () => {
    const a = await (await buy({ offerSlug: "doner", idempotencyKey: "key-0002-abcdef" })).json();
    const b = await (await buy({ offerSlug: "doner", idempotencyKey: "key-0002-abcdef" })).json();
    expect(b.repeated).toBe(true);
    expect(b.pack.id).toBe(a.pack.id);
    const n = await dbh.pool.query("select count(*)::int n from app.payments where idempotency_key = 'key-0002-abcdef'");
    expect(n.rows[0].n).toBe(1);
  });
  it("басқа көлем: 8 дана — 11 000 ₸; жоқ көлем — 400", async () => {
    const ok = await (await buy({ offerSlug: "doner", units: 8, idempotencyKey: "key-0003-abcdef" })).json();
    expect(ok.pack).toMatchObject({ unitsTotal: 8, pricePaid: 11000 });
    expect((await buy({ offerSlug: "doner", units: 5, idempotencyKey: "key-0004-abcdef" })).status).toBe(400);
  });
  it("аяқталған ұсыныс — 409; клиент бағасы қабылданбайды — 400", async () => {
    expect((await buy({ offerSlug: "burger", idempotencyKey: "key-0005-abcdef" })).status).toBe(409);
    expect((await buy({ offerSlug: "doner", price: 1, idempotencyKey: "key-0006-abcdef" })).status).toBe(400);
  });
  it("пакеттер тізімі және бөтен чекті көру мүмкін емес", async () => {
    const list = await (await app.request("/v1/packs", { headers: h() })).json();
    expect(list.packs.length).toBe(3);
    expect(list.packs[0].receipt.no).toMatch(/^JZ-/);
    const rid = list.packs[0].receipt.id;
    expect((await app.request("/v1/receipts/" + rid, { headers: h() })).status).toBe(200);
    expect((await app.request("/v1/receipts/" + rid, { headers: h(999) })).status).toBe(404);
  });
});
