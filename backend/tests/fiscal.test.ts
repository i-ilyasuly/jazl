// Фискалдық чек (re:Kassa, src/fiscal): клиент жасанды fetch арқылы; кезек — дерекқормен (TEST_DATABASE_URL). Нақты re:Kassa-ға сұрау жоқ.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { classify, money, rekassaClient, RekassaError, type RekassaClient, type TicketInput } from "../src/fiscal/rekassa.js";
import { processFiscal, syncFiscalQueue } from "../src/fiscal/index.js";
import { getSettings, setSetting } from "../src/settings.js";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function fakeKassa(opts: { expireOnce?: boolean; unauthorizeOnce?: boolean; noCrPassword?: boolean } = {}) {
  const calls: Call[] = []; let logins = 0; let shift = 7; let expired = Boolean(opts.expireOnce); let unauth = Boolean(opts.unauthorizeOnce); let drop = false;
  const tickets: Record<string, unknown>[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input); const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = init?.body ? JSON.parse(String(init.body)) : null; calls.push({ url, method: init?.method ?? "GET", headers, body });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "Content-Type": "application/json" } });
    const path = url.replace("https://kassa.test/partner", "");
    if (path.startsWith("/api/auth/login")) { logins++; return json({ id: 1101, serialNumber: "ZNM-1", token: "T" + logins, ...(opts.noCrPassword ? {} : { cashRegisterPassword: "0000" }) }); }
    if (headers.Authorization !== "Bearer T" + logins) return json({ code: "PERMISSION_ERROR" }, 401);
    if (path === "/api/crs/1101") return json({ id: 1101, shiftNumber: shift, shiftOpen: true });
    if (path === `/api/crs/1101/shifts/${shift}/close`) { shift++; expired = false; return json({ shiftNumber: shift - 1, open: false }); }
    if (path.startsWith("/api/crs/1101/shifts?")) return json({ _embedded: { shifts: [{ shiftNumber: shift }, { shiftNumber: shift - 1 }] } });
    const st = path.match(/^\/api\/crs\/1101\/shifts\/(\d+)\/tickets/);
    if (st) return json({ _embedded: { tickets: tickets.filter((t) => t.shiftNumber === Number(st[1])) }, page: { totalPages: 1 } });
    if (/^\/api\/crs\/1101\/tickets\/\d+\/receipts$/.test(path)) return json({ id: Number(path.split("/")[4]), extra: { receipts: [body] } });
    if (path === "/api/crs/1101/tickets") {
      if (unauth) { unauth = false; return json({ code: "PERMISSION_ERROR" }, 401); }
      if (expired) return json({ code: "CASH_REGISTER_SHIFT_PERIOD_EXPIRED", meta: {} }, 400);
      const t = { id: 5000 + tickets.length, ticketNumber: "TN" + tickets.length, qrCode: "https://test.4ek.kz/?i=" + tickets.length, shiftNumber: shift, offline: false, externalId: headers["X-Request-ID"] };
      tickets.push(t);
      if (drop) { drop = false; throw new TypeError("fetch failed"); } // чек шықты, жауап жоғалды
      return json(t);
    }
    return json({ code: "NOT_FOUND" }, 404);
  }) as typeof fetch;
  return { f, calls, tickets, logins: () => logins, dropNext: () => { drop = true; }, rollShift: () => { shift++; } };
}
const opts = (f: typeof fetch) => ({ url: "https://kassa.test/partner/", apiKey: "key-123456", number: "ZNM-1", password: "pass", fetch: f, now: () => new Date("2026-11-27T06:00:00Z") });
const sale: TicketInput = { requestId: "md-100001-sell", kind: "sell", title: "Американо · 10 бірлік", amount: 10400 };

describe("re:Kassa клиенті", () => {
  it("кіру (apiKey параметрде, ЗНМ мен пароль денеде) → чек: Bearer, X-Request-ID, сатылым, карта, сома 10 400 ₸, Алматы уақыты", async () => {
    const k = fakeKassa();
    const r = await rekassaClient(opts(k.f)).ticket(sale);
    expect(r).toMatchObject({ ticketId: 5000, ticketNumber: "TN0", shiftNumber: 7, offline: false });
    const [login, t] = k.calls;
    expect(login.url).toBe("https://kassa.test/partner/api/auth/login?apiKey=key-123456&format=json");
    expect(login.body).toEqual({ number: "ZNM-1", password: "pass" });
    expect(t.headers["X-Request-ID"]).toBe("md-100001-sell"); expect(t.headers.Authorization).toBe("Bearer T1");
    const b = t.body as { operation: string; dateTime: { time: { hour: string } }; payments: { type: string; sum: unknown }[]; amounts: { total: unknown; change: unknown }; items: { commodity: { quantity: number; sum: unknown } }[] };
    expect(b.operation).toBe("OPERATION_SELL"); expect(b.payments[0]).toEqual({ type: "PAYMENT_CARD", sum: { bills: "10400", coins: 0 } });
    expect(b.items[0].commodity.quantity).toBe(1000); expect(b.amounts.change).toEqual({ bills: "0", coins: 0 });
    expect(b.dateTime.time.hour).toBe("11"); // 06:00 UTC → 11:00 Алматы
  });
  it("қайтару чегі — OPERATION_SELL_RETURN", async () => {
    const k = fakeKassa();
    await rekassaClient(opts(k.f)).ticket({ ...sale, kind: "sell_return", requestId: "md-100001-ret-1" });
    expect((k.calls[1].body as { operation: string }).operation).toBe("OPERATION_SELL_RETURN");
  });
  it("401 → бір рет қайта кіріп, сол X-Request-ID-мен қайта жібереді", async () => {
    const k = fakeKassa({ unauthorizeOnce: true });
    await rekassaClient(opts(k.f)).ticket(sale);
    expect(k.logins()).toBe(2); expect(k.tickets).toHaveLength(1);
  });
  it("ауысым мерзімі өтсе: ауысым кассаның паролімен жабылады, чек жаңа ауысымда шығады", async () => {
    const k = fakeKassa({ expireOnce: true });
    const r = await rekassaClient(opts(k.f)).ticket(sale);
    const close = k.calls.find((c) => c.url.endsWith("/shifts/7/close"))!;
    expect(close.headers["cash-register-password"]).toBe("0000"); expect(close.headers["X-Request-ID"]).toBe("close-7");
    expect(r.shiftNumber).toBe(8);
  });
  it("жоғалған жауап: соңғы екі ауысымнан externalId бойынша табады (ауысым ауысса да)", async () => {
    const k = fakeKassa(); const c = rekassaClient(opts(k.f));
    await c.ticket(sale); k.rollShift();
    expect(await c.findTicket("md-100001-sell")).toMatchObject({ ticketId: 5000, shiftNumber: 7 });
    expect(await c.findTicket("md-999-sell")).toBeNull();
    expect(await c.currentShift()).toBe(8);
  });
  it("чектің берілгенін тіркеу (3-қадам): POST /tickets/{id}/receipts {type: QR}", async () => {
    const k = fakeKassa(); const c = rekassaClient(opts(k.f));
    const r = await c.ticket(sale); await c.registerReceipt(r.ticketId);
    const call = k.calls.at(-1)!; expect(call.url).toBe("https://kassa.test/partner/api/crs/1101/tickets/5000/receipts"); expect(call.body).toEqual({ type: "QR" });
  });
  it("ауысымды жабуға касса паролі жоқ болса — касса деңгейіндегі қате (block), бос пароль жіберілмейді", async () => {
    const k = fakeKassa({ expireOnce: true, noCrPassword: true });
    await expect(rekassaClient(opts(k.f)).ticket(sale)).rejects.toMatchObject({ code: "NO_CASH_REGISTER_PASSWORD", cls: "block" });
    expect(k.calls.some((c) => c.url.endsWith("/close"))).toBe(false);
  });
  it("кіру сәтсіз (қате кілт/пароль) — auth класы (жол бойынша емес, касса деңгейінде өңделеді)", async () => {
    const bad = (async () => new Response(JSON.stringify({ code: "ACCESS_DENIED" }), { status: 400 })) as unknown as typeof fetch;
    await expect(rekassaClient(opts(bad)).ticket(sale)).rejects.toMatchObject({ code: "ACCESS_DENIED", cls: "auth" });
  });
  it("қате кластары (errors.html) және ақша пішімі", () => {
    expect(classify(400, "SERVICE_TEMPORARILY_UNAVAILABLE")).toBe("retry"); expect(classify(503, null)).toBe("retry");
    expect(classify(400, "NOT_ENOUGH_CASH")).toBe("fix"); expect(classify(400, "CASH_REGISTER_BLOCKED")).toBe("block");
    expect(classify(401, null)).toBe("auth"); expect(classify(400, "OPEN_SHIFT_TIMEOUT_EXPIRED")).toBe("shift");
    expect(money(2203)).toEqual({ bills: "2203", coins: 0 });
  });
});

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;

d("Фискалдық чек кезегі", () => {
  // Қолданба FISCAL=off (төлемнен кейінгі түрткі нақты желіге шықпауы үшін); кезек өңдеуші жасанды клиентпен шақырылады
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test" });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>;
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "К" + id }) }, TOKEN), "Content-Type": "application/json" });
  const q = (s: string, a: unknown[] = []) => dbh.pool.query(s, a);
  const sent: TicketInput[] = []; const receipts: number[] = [];
  let mode: "ok" | "retry" | "fix" | "lost" | "block" = "ok"; let shift = 1; const issued = new Map<string, number>();
  const client = {
    currentShift: async () => shift,
    ticket: async (t: TicketInput) => {
      if (mode === "retry") throw new RekassaError("SERVICE_TEMPORARILY_UNAVAILABLE", 400, "retry");
      if (mode === "fix") throw new RekassaError("INCORRECT_REQUEST_DATA", 400, "fix");
      if (mode === "block") throw new RekassaError("CASH_REGISTER_BLOCKED", 400, "block");
      sent.push(t); issued.set(t.requestId, shift);
      if (mode === "lost") throw new RekassaError("NETWORK", 0, "retry", true); // чек шықты, жауап жоғалды
      return { ticketId: 7000 + sent.length, ticketNumber: "N" + sent.length, qrUrl: "https://4ek.kz/x", shiftNumber: shift, offline: false };
    },
    // Нақты касса сияқты: тек соңғы екі ауысымнан іздейді
    findTicket: async (id: string) => { const sh = issued.get(id); return sh !== undefined && sh >= shift - 1 && sh === shift ? { ticketId: 9999, ticketNumber: "F", qrUrl: null, shiftNumber: sh, offline: false } : null; },
    registerReceipt: async (id: number) => { receipts.push(id); },
    login: async () => ({}), closeShift: async () => false,
  } as unknown as RekassaClient;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("fiscalSince-тен бұрынғы төлемге чек шықпайды; кейінгі сатып алуға — бір сатылым чегі (қайта синхрондау қосарламайды)", async () => {
    const buy = async (n: number) => (await (await app.request("/v1/purchases", { method: "POST", headers: h(n), body: JSON.stringify({ offerSlug: "doner", idempotencyKey: "fk-" + n + "-" + Date.now() }) })).json());
    await buy(901); // fiscalSince-тен бұрын
    await setSetting(dbh.db, "fiscalSince", new Date().toISOString());
    await syncFiscalQueue(dbh.db, cfg);
    expect((await q("select count(*)::int n from app.fiscal_receipts")).rows[0].n).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    const j = await buy(902); expect(j.ok).toBe(true);
    await syncFiscalQueue(dbh.db, cfg); await syncFiscalQueue(dbh.db, cfg);
    const rows = (await q("select kind, amount, title, request_id, status from app.fiscal_receipts")).rows;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ kind: "sell", status: "pending" });
    expect(rows[0].request_id).toMatch(/^md-\d+-sell$/); expect(rows[0].title).toContain("бірлік");
  });

  it("уақытша қате → кейін қайталау (failed емес); дерек қатесі → failed; сәтті → ok, чек нөмірі мен QR сақталады", async () => {
    mode = "retry"; await processFiscal(dbh.db, cfg, client);
    let r = (await q("select status, attempts, error_code, next_try_at > now() as later from app.fiscal_receipts")).rows[0];
    expect(r).toMatchObject({ status: "pending", attempts: 1, error_code: "SERVICE_TEMPORARILY_UNAVAILABLE", later: true });
    await q("update app.fiscal_receipts set next_try_at = now()");
    mode = "ok"; const out = await processFiscal(dbh.db, cfg, client);
    expect(out).toMatchObject({ taken: 1, ok: 1 });
    r = (await q("select status, ticket_number, qr_url, error_code from app.fiscal_receipts")).rows[0];
    expect(r).toMatchObject({ status: "ok", ticket_number: "N1", qr_url: "https://4ek.kz/x", error_code: null });
    expect(receipts).toEqual([7001]); // чектің берілгені тіркелді
  });

  it("клиент чегінде фискалдық чек: QR сілтемесі мен нөмірі (API), PDF-те екінші QR; кезекте болса — «pending»", async () => {
    const rc = (await q("select r.id from app.receipts r join app.fiscal_receipts f on f.payment_id = r.payment_id where r.kind = 'purchase'")).rows[0];
    const j = await (await app.request("/v1/receipts/" + rc.id, { headers: h(902) })).json();
    expect(j.receipt.fiscal).toEqual({ status: "ok", qrUrl: "https://4ek.kz/x", number: "N1", offline: false });
    const { receiptPdf } = await import("../src/receipt/pdf.js");
    const pdf = await receiptPdf(j.receipt); expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await q("update app.fiscal_receipts set status = 'pending'");
    expect((await (await app.request("/v1/receipts/" + rc.id, { headers: h(902) })).json()).receipt.fiscal).toEqual({ status: "pending" });
    await q("update app.fiscal_receipts set status = 'failed'");
    expect((await (await app.request("/v1/receipts/" + rc.id, { headers: h(902) })).json()).receipt.fiscal).toBeNull();
    await q("update app.fiscal_receipts set status = 'ok'");
  });

  it("ақша қайтарылса (refund_status = done) — қайтару чегі, сатылым атауымен және қайтарылған сомамен", async () => {
    const pay = (await q("select p.id, p.amount from app.payments p join app.fiscal_receipts f on f.payment_id = p.id")).rows[0];
    await q("update app.payments set refunded = $2, refund_status = 'done' where id = $1", [pay.id, pay.amount]);
    await syncFiscalQueue(dbh.db, cfg); await syncFiscalQueue(dbh.db, cfg);
    await processFiscal(dbh.db, cfg, client);
    const ret = (await q("select kind, amount, status, request_id from app.fiscal_receipts where kind = 'sell_return'")).rows;
    expect(ret).toHaveLength(1); expect(ret[0]).toMatchObject({ amount: pay.amount, status: "ok" }); expect(ret[0].request_id).toMatch(/-ret-1$/);
    expect(sent.at(-1)!.kind).toBe("sell_return");
  });

  it("клиент мини апптан «Ақшаны қайтару» басса — қайтару чегі кезекке түсіп, кассаға кетеді", async () => {
    const buy = await (await app.request("/v1/purchases", { method: "POST", headers: h(903), body: JSON.stringify({ offerSlug: "doner", idempotencyKey: "fk-903-" + Date.now() }) })).json();
    expect(buy.ok).toBe(true);
    mode = "ok"; await syncFiscalQueue(dbh.db, cfg); await processFiscal(dbh.db, cfg, client);
    const packId = buy.pack?.id ?? buy.packs?.[0]?.id ?? (await q("select p.id from app.packs p join app.users u on u.id = p.user_id where u.telegram_id = 903")).rows[0].id;
    const rr = await (await app.request(`/v1/packs/${packId}/refund`, { method: "POST", headers: h(903) })).json();
    expect(rr).toMatchObject({ ok: true, refundStatus: "done" });
    await syncFiscalQueue(dbh.db, cfg); await processFiscal(dbh.db, cfg, client);
    const fr = (await q("select f.kind, f.status, f.amount from app.fiscal_receipts f join app.payments p on p.id = f.payment_id join app.users u on u.id = p.user_id where u.telegram_id = 903 order by f.created_at")).rows;
    expect(fr).toEqual([{ kind: "sell", status: "ok", amount: rr.cash }, { kind: "sell_return", status: "ok", amount: rr.cash }]);
    expect(sent.at(-1)).toMatchObject({ kind: "sell_return", amount: rr.cash });
  });

  it("дерек қатесі — қайталанбайды, failed (Басқару қарайды)", async () => {
    await q("insert into app.fiscal_receipts (payment_id, kind, amount, title, request_id) select id, 'sell', 100, 'x', 'md-test-fix' from app.payments limit 1");
    await q("update app.fiscal_receipts set status = 'ok' where request_id <> 'md-test-fix'");
    mode = "fix"; await processFiscal(dbh.db, cfg, client);
    expect((await q("select status, error_code from app.fiscal_receipts where request_id = 'md-test-fix'")).rows[0]).toMatchObject({ status: "failed", error_code: "INCORRECT_REQUEST_DATA" });
  });

  const fresh = async (rid: string) => { await q("update app.fiscal_receipts set status = 'ok' where status <> 'ok'"); await q("insert into app.fiscal_receipts (payment_id, kind, amount, title, request_id) select id, 'sell', 500, 'Сынақ', $1 from app.payments limit 1", [rid]); };

  it("жауап жоғалды, ауысым сол — келесі әрекетте чек табылады, қайта жіберілмейді (қос чек жоқ)", async () => {
    await fresh("md-lost-same"); mode = "lost"; const before = sent.length;
    await processFiscal(dbh.db, cfg, client);
    expect((await q("select status, last_unknown from app.fiscal_receipts where request_id = 'md-lost-same'")).rows[0]).toMatchObject({ status: "pending", last_unknown: true });
    await q("update app.fiscal_receipts set next_try_at = now()"); mode = "ok";
    await processFiscal(dbh.db, cfg, client);
    expect((await q("select status, ticket_number from app.fiscal_receipts where request_id = 'md-lost-same'")).rows[0]).toMatchObject({ status: "ok", ticket_number: "F" });
    expect(sent.length - before).toBe(1); // бір рет қана жіберілді
  });

  it("жауап жоғалды, ауысым ауысты, чек табылмады — қайта жіберілмейді, reconcile (қолмен салыстыру)", async () => {
    await fresh("md-lost-roll"); mode = "lost"; const before = sent.length;
    await processFiscal(dbh.db, cfg, client);
    shift += 2; // ұзақ үзіліс: екі ауысым өтті
    await q("update app.fiscal_receipts set next_try_at = now()"); mode = "ok";
    await processFiscal(dbh.db, cfg, client);
    expect((await q("select status, error_code from app.fiscal_receipts where request_id = 'md-lost-roll'")).rows[0]).toMatchObject({ status: "reconcile", error_code: "LOST_ACROSS_SHIFT" });
    expect(sent.length - before).toBe(1);
  });

  it("касса бұғатталса — чектер failed болмайды, партия тоқтайды, 30 минутқа қалады, Басқаруда fiscalAlert", async () => {
    await q("update app.fiscal_receipts set status = 'ok' where status <> 'ok'");
    for (const id of ["md-b1", "md-b2", "md-b3"]) await q("insert into app.fiscal_receipts (payment_id, kind, amount, title, request_id) select id, 'sell', 500, 'Сынақ', $1 from app.payments limit 1", [id]);
    mode = "block"; const out = await processFiscal(dbh.db, cfg, client);
    expect(out).toMatchObject({ stopped: "CASH_REGISTER_BLOCKED", failed: 0 });
    const rows = (await q("select request_id, status, attempts, next_try_at > now() + interval '20 minutes' as later from app.fiscal_receipts where request_id like 'md-b%' order by request_id")).rows;
    expect(rows.every((x) => x.status === "pending" && x.later)).toBe(true);
    expect(rows.map((x) => x.attempts)).toEqual([1, 0, 0]); // тек біріншісі шын әрекет болды
    expect((await getSettings(dbh.db, true)).fiscalAlert).toContain("CASH_REGISTER_BLOCKED");
    await q("update app.fiscal_receipts set next_try_at = now() where request_id like 'md-b%'"); mode = "ok";
    await processFiscal(dbh.db, cfg, client);
    expect((await getSettings(dbh.db, true)).fiscalAlert).toBe(""); // касса қайта жұмыс істеді — белгі тазаланды
  });
});
