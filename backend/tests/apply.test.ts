// 02 · Мекемені тіркеу: қадамдарды сақтау, БСН/IBAN тексеру, құжаттар (жабық), толық тексеру → review → (сынақта) мақұлдау
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { validBin, validIban } from "../src/routes/apply.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

/** Бақылау саны дұрыс БСН жасау */
function makeBin(base = "05074000451") { for (let x = 0; x < 10; x++) { const v = base + x; if (validBin(v)) return v; } return ""; }
/** KZ IBAN: бақылау санын есептеу */
function makeIban(bban = "601A861000123456") { const n = (bban + "KZ00").replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55)); let r = 0; for (const ch of n) r = (r * 10 + Number(ch)) % 97; return "KZ" + String(98 - r).padStart(2, "0") + bban; }

d("02 мекемені тіркеу", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Нұрлан", username: "nurlan" + id }) }, TOKEN), "Content-Type": "application/json" });
  const req = (method: string, path: string, id: number, body?: object) => app.request(path, { method, headers: h(id), body: body ? JSON.stringify(body) : undefined });
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("БСН және IBAN бақылау саны", async () => {
    const bin = makeBin(); expect(bin).toHaveLength(12);
    expect(validBin(bin)).toBe(true); expect(validBin(bin.slice(0, 11) + ((Number(bin[11]) + 1) % 10))).toBe(false);
    const iban = makeIban(); expect(validIban(iban)).toBe(true); expect(validIban(iban.replace(/.$/, "7"))).toBe(iban.endsWith("7"));
    const r = await (await req("GET", `/v1/venue/check/iban/${iban}`, 900)).json();
    expect(r).toMatchObject({ valid: true, bank: "Halyk Bank", bik: "HSBKKZKX" });
  });

  it("қадамдар сақталады; толық емес өтінім жіберілмейді; құжаттар; жіберу → review → мақұлдау → иесі", async () => {
    expect((await (await req("GET", "/v1/venue/application", 900)).json()).application).toBeNull();
    let a = (await (await req("PUT", "/v1/venue/application", 900, { data: { kind: "food", name: "Дала Донер", about: "Үй донері, лаваш, фирмалық соустар — тез әрі дәмді" } })).json()).application;
    expect(a.status).toBe("draft"); expect(a.missing).toContain("legal");
    const sub = await req("POST", "/v1/venue/application/submit", 900);
    expect(sub.status).toBe(409); expect((await sub.json()).missing).toEqual(expect.arrayContaining(["legal", "contact", "branches", "photos", "bank", "docs", "terms"]));
    a = (await (await req("PUT", "/v1/venue/application", 900, { data: {
      bin: makeBin(), legalName: "ТОО «Дала Донер»", director: "Бекенов Нұрлан", authorized: true, contactName: "Бекенов Нұрлан", phone: "+7 701 234 56 78", email: "info@dala.kz",
      branches: [{ address: "Бұхар-Жырау, 52", open: "09:00", close: "23:00" }], logoUrl: "https://example.com/l.webp", coverUrl: "https://example.com/c.webp",
      gallery: ["https://example.com/1.webp", "https://example.com/2.webp", "https://example.com/3.webp"], iban: makeIban(), ownAccount: true, agreeTerms: true, agreePrivacy: true } })).json()).application;
    expect(a.missing).toEqual(["docs"]);
    const up = (kind: string, type = "application/pdf") => app.request(`/v1/venue/application/docs?kind=${kind}`, { method: "POST", headers: { ...h(900), "Content-Type": type, "X-File-Name": encodeURIComponent("құжат.pdf") }, body: new TextEncoder().encode("%PDF-1.4 test") });
    expect((await up("bin", "text/plain")).status).toBe(415);
    for (const k of ["bin", "id", "halal"]) expect((await up(k)).status).toBe(200);
    a = (await (await req("GET", "/v1/venue/application", 900)).json()).application;
    expect(a.missing).toEqual([]); expect(a.docs.map((x: { kind: string }) => x.kind).sort()).toEqual(["bin", "halal", "id"]);
    expect(JSON.stringify(a)).not.toContain("PDF-1.4"); // құжаттың мазмұны ешқашан жауапта қайтпайды
    expect((await req("POST", "/v1/venue/application/submit", 900)).status).toBe(200);
    expect((await req("PUT", "/v1/venue/application", 900, { data: { name: "Басқа" } })).status).toBe(409); // қаралуда — өзгертуге болмайды
    const ok = await (await req("POST", "/v1/venue/application/dev-approve", 900)).json();
    expect(ok.venueId).toBeTruthy();
    const me = await (await req("GET", "/v1/venue/me", 900)).json();
    expect(me.staff[0]).toMatchObject({ role: "owner", status: "active", venue: { name: "Дала Донер", kind: "food" } });
    expect(me.staff[0].branches[0].address).toBe("Бұхар-Жырау, 52");
    expect((await (await req("GET", "/v1/venue/application", 900)).json()).application.status).toBe("approved");
  });
});
