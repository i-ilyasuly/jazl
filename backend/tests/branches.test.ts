// Көп филиал (Тұран шешімі, 2026-11-18): ұсыныс «тек осы филиалдарда» болса — басқа филиалда QR да, тапсырыс та өтпейді (TEST_DATABASE_URL)
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

d("Көп филиал", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  let main = "", second = "", offerId = "";
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Ф" + id }) }, TOKEN), "Content-Type": "application/json" });
  const pj = async (path: string, body: object, id = 901) => (await app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) })).json();
  let n = 0; const key = () => "b-" + Date.now() + "-" + n++;
  const q = (s: string, p: unknown[] = []) => dbh.pool.query(s, p).then((r) => r.rows);

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    const [b] = await q("select b.id, b.venue_id from app.branches b join app.venues v on v.id = b.venue_id where v.slug = 'damdi' order by b.created_at limit 1");
    main = b.id;
    second = (await q("insert into app.branches (venue_id, address, hours, is_247) select venue_id, 'Екінші филиал, Бұқар жырау 1', hours, true from app.branches where id = $1 returning id", [main]))[0].id;
    await q("update app.branches set is_247 = true where id = $1", [main]);
    offerId = (await q("select id from app.offers where slug = 'doner'"))[0].id;
    await q(`update app.offers set rules = coalesce(rules, '{}'::jsonb) || jsonb_build_object('branches', jsonb_build_array($1::text), 'preorder', true) where id = $2`, [main, offerId]);
    await q("update app.venues set accepts_preorder = true where slug = 'damdi'");
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("QR басқа филиалда — 409 other_branch (жарамды мекенжайлармен), бірлік жұмсалмайды; өз филиалында — өтеді", async () => {
    const pack = (await pj("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() })).pack.id as string;
    const bad = await pj("/v1/redeem", { packId: pack, qr: makeDynamicQr(TOKEN, second, 1).payload, units: 1, idempotencyKey: key() });
    expect(bad).toMatchObject({ ok: false, error: "other_branch" });
    expect(bad.branches.length).toBe(1);
    expect((await q("select units_left, units_total from app.packs where id = $1", [pack]))[0]).toEqual({ units_left: 4, units_total: 4 });
    const ok = await pj("/v1/redeem", { packId: pack, qr: makeDynamicQr(TOKEN, main, 1).payload, units: 1, idempotencyKey: key() });
    expect(ok.ok).toBe(true);
  });

  it("тапсырыс: филиал көрсетілмесе — рұқсат етілген филиал таңдалады; басқа филиал — other_branch", async () => {
    const pack = (await pj("/v1/purchases", { offerSlug: "doner", idempotencyKey: key() }, 902)).pack.id as string;
    const o = await pj("/v1/orders", { packId: pack, type: "now", idempotencyKey: key() }, 902);
    expect(o.ok).toBe(true);
    expect(o.order.branchId).toBe(main);
    const bad = await pj("/v1/orders", { packId: pack, type: "now", branchId: second, idempotencyKey: key() }, 902);
    expect(bad).toMatchObject({ ok: false, error: "other_branch" });
  });
});
