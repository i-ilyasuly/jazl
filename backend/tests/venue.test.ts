// C1 · мекеме бөлімі: /venue/me, шақыру (рөл шектеулері, бір рет, мерзім), шығару, бүгінгі қорытынды, сынақ режиміндегі кіру (TEST_DATABASE_URL)
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

d("C1 мекеме бөлімі", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  let venueId = ""; let branchId = "";
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Адам" + id, username: "u" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (path: string, body: object, id: number) => app.request(path, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  const get = async (path: string, id: number) => app.request(path, { headers: h(id) });
  const userId = async (tg: number) => (await dbh.pool.query("select id from app.users where telegram_id = $1", [tg])).rows[0].id as string;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    const r = (await dbh.pool.query("select v.id as v, b.id as b from app.venues v join app.branches b on b.venue_id = v.id where v.slug='damdi' limit 1")).rows[0];
    venueId = r.v; branchId = r.b;
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("клиент: /venue/me бос тізім; басқа мекеме маршруттары — 403", async () => {
    expect(await (await get("/v1/venue/me", 700)).json()).toEqual({ ok: true, staff: [] });
    expect((await get(`/v1/venue/${venueId}/today`, 700)).status).toBe(403);
    expect((await post(`/v1/venue/${venueId}/invites`, { role: "cashier" }, 700)).status).toBe(403);
  });

  it("сынақ режимі: dev-join → иесі; /venue/me мекеме мен филиалдарды береді", async () => {
    expect((await post("/v1/venue/dev-join", { venueSlug: "damdi" }, 701)).status).toBe(200);
    const me = await (await get("/v1/venue/me", 701)).json();
    expect(me.staff[0]).toMatchObject({ role: "owner", venue: { slug: "damdi" } });
    expect(me.staff[0].branches.length).toBeGreaterThan(0);
  });

  it("шақыру: иесі кассир шақырады → бір рет қабылданады; кассир шақыра алмайды", async () => {
    const inv = await (await post(`/v1/venue/${venueId}/invites`, { role: "cashier", branchId }, 701)).json();
    expect(inv.link).toBe(`https://t.me/oylarbot?startapp=staff_${inv.code}`);
    expect((await (await get(`/v1/venue/invites/${inv.code}`, 702)).json()).invite).toMatchObject({ role: "cashier", state: "open" });
    expect(await (await post(`/v1/venue/invites/${inv.code}/accept`, {}, 702)).json()).toMatchObject({ ok: true, role: "cashier" });
    expect((await post(`/v1/venue/invites/${inv.code}/accept`, {}, 703)).status).toBe(409); // екінші адамға жарамайды
    const me = await (await get("/v1/venue/me", 702)).json();
    expect(me.staff[0]).toMatchObject({ role: "cashier", branchId });
    expect(me.staff[0].branches).toHaveLength(1);
    expect((await post(`/v1/venue/${venueId}/invites`, { role: "cashier" }, 702)).status).toBe(403);
    expect((await get(`/v1/venue/${venueId}/staff`, 702)).status).toBe(403);
  });

  it("менеджер тек кассир шақырады; иесін шығара алмайды; иесі менеджерді шығарады", async () => {
    const inv = await (await post(`/v1/venue/${venueId}/invites`, { role: "manager" }, 701)).json();
    await post(`/v1/venue/invites/${inv.code}/accept`, {}, 704);
    expect((await post(`/v1/venue/${venueId}/invites`, { role: "manager" }, 704)).status).toBe(403);
    expect((await post(`/v1/venue/${venueId}/invites`, { role: "cashier" }, 704)).status).toBe(200);
    expect((await post(`/v1/venue/${venueId}/staff/${await userId(701)}/remove`, {}, 704)).status).toBe(403);
    const list = await (await get(`/v1/venue/${venueId}/staff`, 701)).json();
    expect(list.staff.map((x: { role: string }) => x.role).sort()).toEqual(["cashier", "manager", "owner"]);
    expect(list.invites).toHaveLength(1);
    expect((await post(`/v1/venue/${venueId}/staff/${await userId(704)}/remove`, {}, 701)).status).toBe(200);
    expect((await (await get("/v1/venue/me", 704)).json()).staff).toEqual([]);
  });

  it("иесі өз кассир сілтемесін ашса — иесі болып қалады; мерзімі өткен шақыру — 409", async () => {
    const inv = await (await post(`/v1/venue/${venueId}/invites`, { role: "cashier" }, 701)).json();
    expect(await (await post(`/v1/venue/invites/${inv.code}/accept`, {}, 701)).json()).toMatchObject({ role: "owner" });
    const old = await (await post(`/v1/venue/${venueId}/invites`, { role: "cashier" }, 701)).json();
    await dbh.pool.query("update app.staff_invites set expires_at = now() - interval '1 minute' where code = $1", [old.code]);
    expect((await post(`/v1/venue/invites/${old.code}/accept`, {}, 705)).status).toBe(409);
  });

  it("бүгінгі қорытынды: QR-мен қолдану санағы", async () => {
    const before = (await (await get(`/v1/venue/${venueId}/today`, 702)).json()).today;
    const pack = (await (await post("/v1/purchases", { offerSlug: "doner", idempotencyKey: "t-" + Date.now() }, 710)).json()).pack.id;
    expect((await post("/v1/redeem", { packId: pack, qr: "JZB1:" + branchId, idempotencyKey: "r-" + Date.now() }, 710)).status).toBe(200);
    const after = (await (await get(`/v1/venue/${venueId}/today`, 702)).json()).today;
    expect(after.scans).toBe(before.scans + 1);
    expect(after.units).toBe(before.units + 1);
  });
});
