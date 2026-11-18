// Medeo бонусы (Патша, 2026-11-17): күйген бірлік → клиентке 12 ай бонус; бонуспен төлеу; «Мекеме қабылдамады» шағымы; жеңілдік шегі 30% (TEST_DATABASE_URL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeTestCryptogram } from "../src/payments/test.js";
import { creditBreakage } from "../src/bonus.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Medeo бонусы", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  let venueId = "";
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (p: string, body: object, id: number) => app.request(p, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const get = (p: string, id: number) => app.request(p, { headers: h(id) });
  const json = async (r: Response | Promise<Response>) => (await r).json();
  let n = 0; const key = () => "k-" + Date.now() + "-" + n++;
  const q = (s: string, a: unknown[] = []) => dbh.pool.query(s, a);

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    venueId = (await q("select id from app.venues where slug='damdi'")).rows[0].id;
    await post("/v1/venue/dev-join", { venueSlug: "damdi" }, 801);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  let packId = ""; let unit = 0; let left = 0;
  it("күту кезеңі біткен пакеттің қалған бірлігі → клиентке бонус (бірлік бағасы × қалдық), бір рет қана; мекемеге үлес жоқ", async () => {
    const j = await json(post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, 810));
    packId = j.pack.id; unit = Math.floor(j.pack.pricePaid / j.pack.unitsTotal);
    await q("update app.packs set units_left = units_left - 2, valid_until = now() - interval '2 days' where id = $1", [packId]);
    expect(await creditBreakage(dbh.db)).toEqual([]); // әлі 3 күн күту кезеңі
    await q("update app.packs set valid_until = now() - interval '4 days' where id = $1", [packId]);
    left = (await q("select units_left from app.packs where id = $1", [packId])).rows[0].units_left;
    const out = await creditBreakage(dbh.db);
    expect(out).toEqual([expect.objectContaining({ packId, amount: unit * left, units: left })]);
    expect(await creditBreakage(dbh.db)).toEqual([]); // қайталанбайды
    expect((await q("select status, units_left from app.packs where id = $1", [packId])).rows[0]).toEqual({ status: "expired", units_left: 0 });
    const b = await json(get("/v1/bonus", 810));
    expect(b.balance).toBe(unit * left);
    const days = (new Date(b.nextExpiry).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(360); expect(days).toBeLessThan(370); // 12 ай
    // Мекеме бетінде: «клиентке бонус», мекемеге сома жоқ
    const ex = await json(get(`/v1/venue/${venueId}/expired`, 801));
    expect(ex.items.find((x: { id: string }) => x.id === packId)).toMatchObject({ state: "bonus", units: left, amount: unit * left });
    expect(ex.summary.bonusMonth).toBe(unit * left);
    expect(JSON.stringify(ex)).not.toMatch(/venueAmount|credited/);
  });

  it("бонуспен төлеу: бағадан шегеріледі, төлем сомасы азаяды; чекте бонус көрсетіледі", async () => {
    const bal = (await json(get("/v1/bonus", 810))).balance as number;
    const j = await json(post("/v1/purchases", { offerSlug: "doner", useBonus: true, idempotencyKey: key() }, 810));
    expect(j.status).toBe("paid");
    const pay = (await q("select amount, meta from app.payments where id = $1", [j.paymentId])).rows[0];
    expect(pay.amount).toBe(j.pack.pricePaid - bal);
    expect(j.pack.pricePaid).toBeGreaterThan(bal); // пакет толық бағамен (мекеме есебі өзгермейді)
    expect(j.receipt.payment).toMatchObject({ bonus: bal, charged: j.pack.pricePaid - bal });
    expect((await json(get("/v1/bonus", 810))).balance).toBe(0);
  });

  it("карта өтпесе — ұсталған бонус қайтарылады; бонус толық жапса — картасыз төленеді", async () => {
    await q("insert into app.bonuses (user_id, amount, \"left\", expires_at, kind) select id, 1000, 1000, now() + interval '1 year', 'manual' from app.users where telegram_id = 810");
    const r = await post("/v1/purchases", { offerSlug: "doner", method: "card", card: { cryptogram: makeTestCryptogram("0002") }, useBonus: true, idempotencyKey: key() }, 810);
    expect(r.status).toBe(402);
    expect((await json(get("/v1/bonus", 810))).balance).toBe(1000);
    const price = (await q("select price from app.offers where slug = 'doner'")).rows[0].price as number;
    await q(`update app.bonuses set "left" = $1, amount = $1 where kind = 'manual'`, [price]);
    const j = await json(post("/v1/purchases", { offerSlug: "doner", method: "card", card: { cryptogram: makeTestCryptogram("0002") }, useBonus: true, idempotencyKey: key() }, 810));
    expect(j.status).toBe("paid"); // карта қолданылмады (0002 болса да)
    expect((await q("select amount, method, provider from app.payments where id = $1", [j.paymentId])).rows[0]).toEqual({ amount: 0, method: "bonus", provider: "bonus" });
    expect(j.receipt.payment.label).toBe("Medeo бонусы");
  });

  it("мерзімі өткен бонус есептелмейді", async () => {
    await q("insert into app.bonuses (user_id, amount, \"left\", expires_at, kind) select id, 500, 500, now() - interval '1 day', 'manual' from app.users where telegram_id = 810");
    expect((await json(get("/v1/bonus", 810))).balance).toBe(0);
  });

  it("«Мекеме қабылдамады»: пакет бірден 7 күнге ұзарады (пакетке ең көбі 2 рет); 5 түрлі клиент → мекеме тоқтатылады", async () => {
    const users = [821, 822, 823, 824, 825];
    let first = "";
    for (const [i, u] of users.entries()) {
      const pk = (await json(post("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, u))).pack.id as string;
      if (!i) first = pk;
      const before = new Date((await q("select valid_until from app.packs where id = $1", [pk])).rows[0].valid_until).getTime();
      const r = await json(post("/v1/complaints", { packId: pk, reason: "refused", text: "Мекеме жабық деді, бірақ ашық тұрды" }, u));
      expect(r.extended).toBe(7);
      const after = new Date((await q("select valid_until from app.packs where id = $1", [pk])).rows[0].valid_until).getTime();
      expect(Math.round((after - before) / 86400_000)).toBe(7);
      expect(r.venuePaused).toBe(i === 4);
    }
    expect((await q("select status from app.venues where id = $1", [venueId])).rows[0].status).toBe("paused");
    // Бір пакет: 2 реттен кейін ұзармайды
    await q("update app.complaints set status = 'rejected' where pack_id = $1", [first]);
    expect((await json(post("/v1/complaints", { packId: first, reason: "refused", text: "Тағы да жабық" }, 821))).extended).toBe(7);
    await q("update app.complaints set status = 'rejected' where pack_id = $1", [first]);
    expect((await json(post("/v1/complaints", { packId: first, reason: "refused", text: "Үшінші рет" }, 821))).extended).toBe(0);
    await q("update app.venues set status = 'active' where id = $1", [venueId]);
  });

  it("жеңілдік шегі 30%: одан арзан ұсыныс жарияланбайды (жоба ретінде сақталады)", async () => {
    const body = { title: "Арзан донер", titleRu: "Дешёвый донер", category: "Донер", about: "Сынақ", aboutRu: "Описание на русском языке для клиентов", regularUnitPrice: 2000, validDays: 30, photos: [], rules: { carry: true, extend: true, preorder: true, branches: null } };
    const r = await post(`/v1/venue/${venueId}/offers`, { ...body, sizes: [{ units: 10, price: 13000 }], publish: true }, 801); // 35%
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "big_discount", max: 30 });
    expect((await post(`/v1/venue/${venueId}/offers`, { ...body, sizes: [{ units: 10, price: 14000 }], publish: true }, 801)).status).toBe(200); // дәл 30%
    expect((await post(`/v1/venue/${venueId}/offers`, { ...body, sizes: [{ units: 10, price: 13000 }], publish: false }, 801)).status).toBe(200); // жоба
  });
});
