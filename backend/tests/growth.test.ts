// Клиентті ұстау хабарлары (Хормози): соңғы бірлік → қайта алу, 48 сағат қолданылмаса → еске салу, айлық жеке үнем; сатылым соңы (жергілікті PostgreSQL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { makeNotifier, type Msg } from "../src/notify.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Клиентті ұстау хабарлары және сатылым соңы", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createApp>;
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Клиент" }) }, TOKEN), "Content-Type": "application/json" });
  let k = 0;
  const buy = async (id: number, slug = "doner") => (await app.request("/v1/purchases", { method: "POST", headers: h(id), body: JSON.stringify({ offerSlug: slug, idempotencyKey: `gr-key-${++k}-abcdef` }) })).json();
  const q = (s: string, p: unknown[] = []) => dbh.pool.query(s, p);
  // Сағат 12:00 (Алматы) — хабар жіберу уақыты
  const noon = (date: string) => new Date(`${date}T12:00:00+05:00`);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
  const tick = async (now: Date) => { const sent: Msg[] = []; await makeNotifier(dbh.db, async (m) => { sent.push(m); }).tick(now); return sent; };

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable");
    dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("соңғы бірлік қолданылды → «Қайта алу» бір рет; автожаңарту қосулыда — жоқ", async () => {
    const j = await buy(901);
    await q("update app.packs set units_left = 0 where id = $1", [j.pack.id]);
    await q("insert into app.pack_events (pack_id, type, units_delta) values ($1, 'use', -1)", [j.pack.id]);
    const s1 = (await tick(noon(today))).filter((m) => m.chatId === 901);
    expect(s1).toHaveLength(1);
    expect(s1[0].text).toContain("соңғы бірлігі");
    expect(s1[0].button?.start).toBe("offer_doner");
    expect((await tick(noon(today))).filter((m) => m.chatId === 901)).toHaveLength(0);
    const j2 = await buy(902);
    await q("update app.packs set units_left = 0, auto_renew = true where id = $1", [j2.pack.id]);
    await q("insert into app.pack_events (pack_id, type, units_delta) values ($1, 'use', -1)", [j2.pack.id]);
    expect((await tick(noon(today))).filter((m) => m.chatId === 902)).toHaveLength(0);
  });
  it("2 күн бойы қолданылмаған пакет → еске салу бір рет; жаңа пакетке — жоқ", async () => {
    const j = await buy(903);
    expect((await tick(noon(today))).filter((m) => m.chatId === 903)).toHaveLength(0);
    await q("update app.packs set created_at = now() - interval '50 hours' where id = $1", [j.pack.id]);
    const s = (await tick(noon(today))).filter((m) => m.chatId === 903);
    expect(s).toHaveLength(1);
    expect(s[0].button?.start).toBe(`pk_${j.pack.id}`);
    expect((await tick(noon(today))).filter((m) => m.chatId === 903)).toHaveLength(0);
  });
  it("айдың 1-інде өткен айдағы жеке үнем (тек 1-інде, бір рет)", async () => {
    const j = await buy(904); // донер: бірлік 1 500, бөлек 2 000 → бірлігіне 500 үнем
    const br = (await q("select b.id from app.branches b join app.venues v on v.id = b.venue_id where v.slug = 'damdi' limit 1")).rows[0].id;
    await q("insert into app.redemptions (pack_id, branch_id, units, amount) values ($1, $2, 2, 3000)", [j.pack.id, br]);
    const next = new Date(new Date(`${today.slice(0, 7)}-15T12:00:00+05:00`).getTime() + 20 * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }).slice(0, 7) + "-01";
    expect((await tick(noon(today === `${today.slice(0, 7)}-01` ? `${today.slice(0, 7)}-02` : today))).filter((m) => m.chatId === 904 && m.text.includes("үнемдедің"))).toHaveLength(0);
    const s = (await tick(noon(next))).filter((m) => m.chatId === 904 && m.text.includes("үнемдедің"));
    expect(s).toHaveLength(1);
    expect(s[0].text).toContain("1 000 ₸");
    expect(s[0].button?.start).toBe("p_savings");
    expect((await tick(noon(next))).filter((m) => m.chatId === 904 && m.text.includes("үнемдедің"))).toHaveLength(0);
  });
  it("сатылым соңы өтсе: сатып алу жабық, tick ұсынысты аяқтайды; каталогта saleUntil көрінеді", async () => {
    await q(`update app.offers set rules = coalesce(rules, '{}'::jsonb) || '{"saleUntil":"2099-12-31"}'::jsonb where slug = 'latte'`);
    expect((await (await app.request("/v1/catalog")).json()).offers.find((o: { slug: string }) => o.slug === "latte").saleUntil).toBe("2099-12-31");
    await q(`update app.offers set rules = rules || '{"saleUntil":"2020-01-01"}'::jsonb where slug = 'latte'`);
    const r = await app.request("/v1/purchases", { method: "POST", headers: h(905), body: JSON.stringify({ offerSlug: "latte", idempotencyKey: "gr-key-latte-abcdef" }) });
    expect((await r.json()).error).toBe("offer_unavailable");
    await tick(noon(today));
    expect((await q("select status from app.offers where slug = 'latte'")).rows[0].status).toBe("ended");
  });
});
