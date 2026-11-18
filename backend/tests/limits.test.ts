// Сату лимиті (айлық + бір адамға) және «Қайта шыққанда хабарла» (жергілікті PostgreSQL: TEST_DATABASE_URL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import type { Msg } from "../src/notify.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Сату лимиті", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", CRON_KEY: "cron-test-key-123" });
  let dbh: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createApp>;
  const sent: Msg[] = [];
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" + id }) }, TOKEN), "Content-Type": "application/json" });
  let k = 0;
  const buy = (id: number, extra: object = {}) => app.request("/v1/purchases", { method: "POST", headers: h(id), body: JSON.stringify({ offerSlug: "latte", idempotencyKey: `lim-key-${++k}-abcdef`, ...extra }) });
  const setRules = (r: object) => dbh.pool.query(`update app.offers set rules = coalesce(rules, '{}'::jsonb) || $1::jsonb where slug = 'latte'`, [JSON.stringify(r)]);
  const catalogLatte = async () => (await (await app.request("/v1/catalog")).json()).offers.find((o: { slug: string }) => o.slug === "latte");

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable");
    dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db, { send: async (m) => { sent.push(m); } });
    await setRules({ monthlyLimit: 3, perUserLimit: 2 });
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("каталог: қалғаны мен шегі көрінеді", async () => {
    expect((await catalogLatte()).limit).toEqual({ monthly: 3, left: 3, perUser: 2 });
  });
  it("бір адамға шек: 2-ден кейін — user_limit", async () => {
    expect((await buy(701)).status).toBe(200);
    expect((await buy(701)).status).toBe(200);
    const r = await buy(701);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "user_limit", left: 0, limit: 2 });
  });
  it("сыйлық та бір адамның шегіне кіреді; корпоративтік сыйлық қалғаннан көп болса — sold_out", async () => {
    const r = await buy(702, { gift: { count: 2 } });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "sold_out", left: 1 });
  });
  it("айлық лимит: 3-ші сатылымнан кейін — sold_out, каталогта 0", async () => {
    expect((await buy(702)).status).toBe(200);
    const r = await buy(703);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "sold_out", left: 0, limit: 3 });
    expect((await catalogLatte()).limit.left).toBe(0);
  });
  it("қайтарылған пакет орынды босатады", async () => {
    await dbh.pool.query(`update app.packs set status = 'refunded' where id = (select p.id from app.packs p join app.offers o on o.id = p.offer_id where o.slug = 'latte' order by p.created_at desc limit 1)`);
    expect((await buy(703)).status).toBe(200);
    expect((await buy(704)).status).toBe(409);
  });
  it("өткен айдағы сатылым санға кірмейді", async () => {
    await dbh.pool.query(`update app.packs set created_at = now() - interval '40 days' where offer_id = (select id from app.offers where slug = 'latte')`);
    expect((await catalogLatte()).limit.left).toBe(3);
    await buy(704); await buy(705); await buy(706);
    expect((await catalogLatte()).limit.left).toBe(0);
  });
  it("«Хабарла»: тізімге жазылады; лимит көбейгенде бот хабарлайды, жазба өшеді; мекемеге «таусылды» бір рет", async () => {
    expect((await app.request("/v1/offers/latte/wait", { method: "POST", headers: h(707), body: JSON.stringify({ on: true }) })).status).toBe(200);
    expect((await (await app.request("/v1/waits", { headers: h(707) })).json()).slugs).toEqual(["latte"]);
    const tick = () => app.request("/cron/tick", { method: "POST", headers: { "X-Cron-Key": "cron-test-key-123" } });
    sent.length = 0;
    await tick();
    expect(sent.filter((m) => m.chatId === 707)).toHaveLength(0); // әлі таусылған
    await setRules({ monthlyLimit: 5 });
    await tick();
    const mine = sent.filter((m) => m.chatId === 707);
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain("қайта сатылымда");
    expect(mine[0].button?.start).toBe("offer_latte");
    expect((await (await app.request("/v1/waits", { headers: h(707) })).json()).slugs).toEqual([]);
    await tick();
    expect(sent.filter((m) => m.chatId === 707)).toHaveLength(1); // екінші рет жоқ
  });
  it("лимитсіз ұсыныс бұрынғыдай", async () => {
    await setRules({ monthlyLimit: null, perUserLimit: null });
    expect((await catalogLatte()).limit).toBeNull();
    expect((await buy(701)).status).toBe(200);
  });
});
