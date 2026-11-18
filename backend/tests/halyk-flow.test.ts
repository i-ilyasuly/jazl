// Halyk ePay толық ағын API арқылы (банк жауаптары жасанды): банк беті → күйді банктен тексеру → пакет, сақталған карта → бір басумен төлем → қайтару
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

d("Halyk ePay ағыны", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", HALYK_ENV: "test", HALYK_CLIENT_ID: "cid", HALYK_CLIENT_SECRET: "sec", HALYK_TERMINAL_ID: "term", PUBLIC_URL: "https://api.example.com" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  const bank: { tx: Record<string, { status: string; amount: number; cardID?: string }>; calls: string[] } = { tx: {}, calls: [] };
  const realFetch = globalThis.fetch;
  const h = (id = 1301) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "К" }) }, TOKEN), "Content-Type": "application/json" });
  const post = (p: string, body: object) => app.request(p, { method: "POST", headers: h(), body: JSON.stringify(body) });
  const get = (p: string) => app.request(p, { headers: h() });
  let n = 0; const key = () => "hk-" + Date.now() + "-" + n++;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    vi.stubGlobal("fetch", (async (input: string | URL, init?: RequestInit) => {
      const u = String(input);
      if (!u.includes("epayment.kz")) return realFetch(input, init);
      bank.calls.push(u);
      const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
      if (u.includes("/oauth2/token")) return json({ access_token: "T", expires_in: 1200 });
      const inv = u.split("/").pop()!;
      if (u.includes("/check-status/")) { const t = bank.tx[inv]; return json(t ? { resultCode: "100", transaction: { id: "tx-" + inv, invoiceID: inv, amount: t.amount, statusName: t.status, cardID: t.cardID, cardMask: "440563...5096", cardType: "VISA" } } : { resultCode: "102", transaction: null }); }
      const op = u.match(/operation\/tx-(\d+)\/(\w+)/);
      if (op) { bank.tx[op[1]].status = op[2] === "charge" ? "CHARGE" : op[2] === "refund" ? "REFUND" : "CANCEL"; return json({ code: 0 }); }
      if (u.endsWith("/payments/cards/auth")) { const b = JSON.parse(String(init?.body)); bank.tx[b.invoiceId] = { status: "CHARGE", amount: b.amount }; return json({ status: "CHARGE", code: 0 }); }
      return new Response("{}", { status: 404 });
    }) as typeof fetch);
  });
  afterAll(async () => { vi.unstubAllGlobals(); await dbh?.pool.end(); });

  it("мини аппқа тәсіл көрінеді (сынақ режимі белгісімен)", async () => {
    expect(await (await get("/v1/payments/config")).json()).toMatchObject({ hosted: [{ id: "halyk", test: true }] });
  });

  it("банк беті → клиент төлейді → күту беті банктен сұрайды → пакет белсенді, карта сақталды; сақталған картамен бір басумен; қайтару банк арқылы", async () => {
    const r = await post("/v1/purchases", { offerSlug: "doner", method: "card", card: { hosted: true, save: true }, idempotencyKey: key() });
    expect(r.status).toBe(202);
    const j = await r.json();
    expect(j.confirmUrl).toMatch(/^https:\/\/test-epay\.epayment\.kz\/payform\/\?params=/);
    const pay = (await dbh.pool.query("select no, provider, external_id, status from app.payments where id = $1", [j.paymentId])).rows[0];
    expect(pay).toMatchObject({ provider: "halyk", status: "pending" });
    expect(pay.external_id).toMatch(/^\d{12}$/); // сынақ ортасы: бірегей нөмір
    const inv = pay.external_id as string;
    // Клиент әлі төлемеген — күтуде
    expect((await (await get(`/v1/payments/${j.paymentId}`)).json()).status).toBe("action_required");
    // Клиент банк бетінде төледі (сынақ терминалы: AUTH) — біз банктен сұраймыз, charge жасаймыз
    bank.tx[inv] = { status: "AUTH", amount: 6000, cardID: "card-xyz" };
    const done = await (await get(`/v1/payments/${j.paymentId}`)).json();
    expect(done.status).toBe("paid");
    expect(bank.tx[inv].status).toBe("CHARGE");
    const cards = (await (await get("/v1/cards")).json()).cards;
    expect(cards).toEqual([expect.objectContaining({ brand: "VISA", last4: "5096", exp: "" })]);
    // Сақталған Halyk картасымен — клиентсіз, бірден
    const r2 = await (await post("/v1/purchases", { offerSlug: "doner", method: "card", card: { id: cards[0].id }, idempotencyKey: key() })).json();
    expect(r2.status).toBe("paid");
    expect(bank.calls.some((u) => u.endsWith("/payments/cards/auth"))).toBe(true);
    // Қайтару — сол төлемнің банкі арқылы
    const ref = await (await post(`/v1/packs/${done.pack.id}/refund`, {})).json();
    expect(ref).toMatchObject({ ok: true, cash: 6000, refundStatus: "done" });
    expect(bank.tx[inv].status).toBe("REFUND");
  });
});
