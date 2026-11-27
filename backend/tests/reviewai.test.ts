// Пікірлердің Gemini тексерісі (src/reviewAi.ts) және сайттағы сүзгі (TEST_DATABASE_URL). Gemini — жалған fetch.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { loadConfig } from "../src/config.js";
import { moderatePending } from "../src/reviewAi.js";

const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

d("пікірдің Gemini тексерісі", () => {
  const base = { DATABASE_URL: URL, BOT_TOKEN: "123456:TEST-token-not-real", DB_SSL: "disable", NODE_ENV: "test" };
  const cfg = loadConfig({ ...base, GEMINI_API_KEY: "test-gemini-key-not-real-000" });
  let dbh: ReturnType<typeof createDb>;
  const q = (s: string, p: unknown[] = []) => dbh.pool.query(s, p).then((r) => r.rows);
  const sent: string[] = [];
  // Жалған Gemini: «нашар» сөзі бар — negative, «сілтеме» — unsafe, «күмән» — ok, бірақ сенімділік төмен, қалғаны — ok 0.95
  const fake: typeof fetch = async (_u, init) => {
    const body = JSON.parse(String(init?.body)); const input = JSON.parse(body.input) as { review: string };
    sent.push(body.input);
    const t = input.review;
    if (t.includes("қате500")) return new Response("boom", { status: 500 });
    const choice = t.includes("нашар") ? "negative" : t.includes("сілтеме") ? "unsafe" : "ok";
    const confidence = t.includes("күмән") ? 0.6 : 0.95;
    return new Response(JSON.stringify({ answers: { verdict: { type: "choice", choice, confidence } } }), { status: 200 });
  };
  const rate = async (stars: number, text: string | null) => {
    const [u] = await q("insert into app.users (telegram_id, first_name, last_name) values ($1, 'Айгерім', 'Сапарова') returning id", [Math.floor(Math.random() * 1e9)]);
    const [v] = await q("select id from app.venues limit 1");
    const [r] = await q("insert into app.ratings (user_id, venue_id, stars, text) values ($1, $2, $3, $4) returning id", [u.id, v.id, stars, text]);
    return r.id as string;
  };

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("шешімдер сақталады; мәтінсіз не 1–3 жұлдыз Gemini-ге жіберілмейді; клиенттің аты жіберілмейді", async () => {
    const good = await rate(5, "Өте дәмді, кезексіз алдым, рахмет!");
    const bad = await rate(4, "Тамақ нашар болды, ұзақ күттім");
    const spam = await rate(5, "Жеңілдік керек болса сілтеме бойынша жазыңыз");
    const unsure = await rate(5, "Жақсы сияқты, бірақ күмән бар");
    const low = await rate(2, "Мүлде ұнамады, қайтып келмеймін");
    const short = await rate(5, "Жақсы");
    const r = await moderatePending(dbh.db, cfg, fake);
    expect(r.checked).toBe(4);
    const st = Object.fromEntries((await q("select id, ai_status, ai_confidence from app.ratings")).map((x) => [x.id, x]));
    expect(st[good].ai_status).toBe("ok"); expect(st[bad].ai_status).toBe("negative"); expect(st[spam].ai_status).toBe("unsafe");
    expect(st[unsure]).toMatchObject({ ai_status: "ok" }); expect(st[unsure].ai_confidence).toBeCloseTo(0.6);
    expect(st[low].ai_status).toBe("skip"); expect(st[short].ai_status).toBe("skip");
    expect(sent.join(" ")).not.toMatch(/Айгерім|Сапарова/);
    expect(sent.every((s) => Object.keys(JSON.parse(s)).sort().join() === "review,stars")).toBe(true);
  });

  it("сайт: Gemini қосулы — тек ok және сенімділік ≥ 0,8; жалпы баға — бәрінің орташасы", async () => {
    const app = createApp(cfg, dbh.db);
    const s = await (await app.request("/v1/catalog/site-reviews")).json();
    expect(s.reviews.map((x: { text: string }) => x.text)).toEqual(["Өте дәмді, кезексіз алдым, рахмет!"]);
    expect(s.count).toBe(6);
  });

  it("Gemini қатесі — error, келесі жолы қайталанады; 5 әрекеттен кейін тоқтайды", async () => {
    const id = await rate(5, "Керемет орын қате500 болса да");
    await moderatePending(dbh.db, cfg, fake);
    expect((await q("select ai_status, ai_attempts from app.ratings where id = $1", [id]))[0]).toMatchObject({ ai_status: "error", ai_attempts: 1 });
    for (let i = 0; i < 6; i++) await moderatePending(dbh.db, cfg, fake);
    expect((await q("select ai_attempts from app.ratings where id = $1", [id]))[0].ai_attempts).toBe(5);
  });

  it("Gemini өшірулі — сайт бұрынғы ереже бойынша (4–5 жұлдыз, мәтін ≥ 10)", async () => {
    const off = loadConfig(base);
    const s = await (await createApp(off, dbh.db).request("/v1/catalog/site-reviews")).json();
    expect(s.reviews.length).toBeGreaterThanOrEqual(3);
  });
});
