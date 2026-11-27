// Сайттың өтінім формасы: POST /v1/site/lead (кірусіз) → app.site_leads (TEST_DATABASE_URL)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { loadConfig } from "../src/config.js";

const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

d("сайт өтінімі", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: "123456:TEST-token-not-real", DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  const post = (body: object) => app.request("/v1/site/lead", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.7" }, body: JSON.stringify(body) });
  const ok = { venue: "Qala Coffee", kind: "coffee", name: "Айгерім", phone: "+7 701 123 45 67", pos: "iiko", consent: true, lang: "kk" };

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); app = createApp(cfg, dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("дұрыс өтінім сақталады, нөмірі қайтарылады", async () => {
    const r = await (await post(ok)).json();
    expect(r).toMatchObject({ ok: true, no: 1 });
    const [row] = (await dbh.pool.query("select venue, kind, name, phone, pos, lang, status, ip from app.site_leads")).rows;
    expect(row).toMatchObject({ venue: "Qala Coffee", kind: "coffee", name: "Айгерім", pos: "iiko", lang: "kk", status: "new", ip: "203.0.113.7" });
  });
  it("келісімсіз, қате телефонмен, бос атаумен — 400 және қай өріс екені", async () => {
    const a = await post({ ...ok, consent: false });
    expect(a.status).toBe(400); expect((await a.json()).fields).toContain("consent");
    expect((await (await post({ ...ok, phone: "12" })).json()).fields).toContain("phone");
    expect((await (await post({ ...ok, venue: "" })).json()).fields).toContain("venue");
  });
  it("тұзақ-өріс (website) толтырылса — қабылданбайды", async () => {
    expect((await post({ ...ok, website: "http://spam" })).status).toBe(400);
    expect((await dbh.pool.query("select count(*)::int n from app.site_leads")).rows[0].n).toBe(1);
  });
});
