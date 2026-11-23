// Halyk ePay адаптері (src/payments/halyk.ts): банк жауаптары жасанды fetch арқылы. Нақты сынақ ортасымен тексеріс — 07 журналда.
import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import { encodeParams, halykProvider } from "../src/payments/halyk.js";

type Call = { url: string; method: string; body: string };
function fakeBank(state: { status: string; amount: number; cardID?: string; qrOff?: boolean; qrStatus?: string }) {
  const calls: Call[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input); const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
    calls.push({ url, method: init?.method ?? "GET", body });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/oauth2/token")) return json({ access_token: "TOKEN_" + calls.length, expires_in: 1200, scope: "payment", token_type: "Bearer" });
    // NONE — банкте транзакция әлі жоқ (QR генерацияланған, төленбеген): сынақ ортасында расталды — resultCode 102
    if (url.includes("/check-status/payment/transaction/") && state.status === "NONE") return json({ resultCode: "102", transaction: { id: "" } });
    if (url.includes("/check-status/payment/transaction/")) return json({ resultCode: "100", transaction: { id: "tx-1", invoiceID: url.split("/").pop(), amount: state.amount, statusName: state.status, cardID: state.cardID, cardMask: "440563...5096", cardType: "VISA", reasonCode: "0" } });
    if (url.includes("/charge")) { state.status = "CHARGE"; return json({ code: 0, message: "success" }); }
    if (url.includes("/cancel")) { state.status = "CANCEL"; return json({ code: 0 }); }
    if (url.includes("/refund")) { state.status = "REFUND"; return json({ code: 0, message: "success" }); }
    if (url.includes("/payments/cards/auth")) return json({ status: "CHARGE", code: 0 });
    if (url.endsWith("/payment/qr/generate")) return state.qrOff ? json({ code: 219, message: "pay_qr_local disabled" }, 400) : json({ qrcode: "000201QRDATA", homebankLink: "https://homebank.kz/qr?x=1", onlinebankLink: "", status: "NEW", billNumber: 1 });
    if (url.endsWith("/qr")) return json({ status: state.qrStatus ?? "NEW", amount: state.amount });
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls };
}
const cfg = (f: typeof fetch, env: "test" | "prod" = "prod", qr = false) => ({ env, qr, clientId: "cid", clientSecret: "csecret", terminalId: "term-1", publicUrl: "https://api.example.com", hashKey: "k", fetch: f });
const input = { paymentId: "p1", orderNo: 100000123, amount: 6000, description: "Medeo · Донер", user: { id: "u-uuid", telegramId: 5 }, returnUrl: "https://t.me/bot?startapp=pay_p1" };

describe("Halyk ePay", () => {
  it("encodeParams — payment-api.js-пен бірдей (кірістірілген объект те)", () => {
    expect(encodeParams({ a: 1, auth: { access_token: "x y", expires_in: 5 } })).toBe("a=1&auth=" + encodeURIComponent("access_token=x%20y&expires_in=5"));
  });

  it("банк беті: сілтеме сынақ payform-ға, ішінде тапсырыс нөмірі, сома, терминал, токен; жеке дерек жоқ", async () => {
    const { f, calls } = fakeBank({ status: "NEW", amount: 6000 });
    const r = await halykProvider(cfg(f)).charge({ ...input, card: { hosted: true, save: true } });
    expect(r.status).toBe("action_required");
    if (r.status !== "action_required") return;
    expect(r.externalId).toBe("100000123");
    expect(r.confirmUrl.startsWith("https://epay.homebank.kz/payform/?params=")).toBe(true);
    const decoded = LZString.decompressFromEncodedURIComponent(r.confirmUrl.split("params=")[1])!;
    const q = new URLSearchParams(decoded);
    expect(q.get("invoiceId")).toBe("100000123"); expect(q.get("amount")).toBe("6000"); expect(q.get("terminal")).toBe("term-1"); expect(q.get("cardSave")).toBe("true");
    expect(q.get("accountId")).toBe("u-uuid"); expect(q.get("postLink")).toBe("https://api.example.com/payments/webhook/halyk");
    expect(new URLSearchParams(q.get("auth")!).get("access_token")).toMatch(/^TOKEN_/);
    expect(q.get("phone")).toBeNull(); expect(q.get("email")).toBeNull(); expect(q.get("name")).toBeNull();
    expect(calls[0].body).toContain("invoiceID=100000123"); expect(calls[0].body).toContain("amount=6000");
  });

  it("хабарлама: secret_hash қате — қабылданбайды; дұрыс — күй банктен сұралады, AUTH → charge → төленді, карта сақталады", async () => {
    const state = { status: "AUTH", amount: 6000, cardID: "card-1" };
    const { f, calls } = fakeBank(state);
    const p = halykProvider(cfg(f));
    const r = await p.charge({ ...input, card: { hosted: true } });
    const params = new URLSearchParams(LZString.decompressFromEncodedURIComponent((r as { confirmUrl: string }).confirmUrl.split("params=")[1])!);
    const tokBody = new URLSearchParams(calls[0].body); const hash = tokBody.get("secret_hash")!;
    expect(await p.webhook({ headers: {}, body: JSON.stringify({ invoiceId: "100000123", secret_hash: "wrong", code: "ok" }) })).toBeNull();
    const ev = await p.webhook({ headers: {}, body: JSON.stringify({ invoiceId: params.get("invoiceId"), secret_hash: hash, code: "ok" }) });
    expect(ev).toMatchObject({ externalId: "100000123", status: "paid", amount: 6000, card: { token: "card-1", brand: "VISA", last4: "5096", expMonth: 0 } });
    expect(calls.some((x) => x.url.endsWith("/operation/tx-1/charge"))).toBe(true);
  });

  it("сынақ ортасы: нөмір реттік емес (ортақ терминалда бұрын қолданылған нөмір банкте бас тартылады) — 12 цифр, сынақ payform", async () => {
    const { f } = fakeBank({ status: "NEW", amount: 6000 });
    const r = await halykProvider(cfg(f, "test")).charge({ ...input, card: { hosted: true } });
    expect(r.externalId).toMatch(/^\d{12}$/); expect(r.externalId).not.toBe("100000123");
    expect((r as { confirmUrl: string }).confirmUrl.startsWith("https://test-epay.epayment.kz/payform/?params=")).toBe(true);
  });

  it("күйлер: NEW — күтуде; CANCEL — өтпеді", async () => {
    const s1 = fakeBank({ status: "NEW", amount: 6000 });
    expect((await halykProvider(cfg(s1.f)).check!("100000123"))?.status).toBe("pending");
    const s2 = fakeBank({ status: "CANCEL", amount: 6000 });
    expect((await halykProvider(cfg(s2.f)).check!("100000123"))?.status).toBe("failed");
  });

  it("сақталған карта: клиентсіз төлем (paymentType cardId) → төленді", async () => {
    const state = { status: "CHARGE", amount: 6000 };
    const { f, calls } = fakeBank(state);
    const r = await halykProvider(cfg(f)).charge({ ...input, card: { token: "card-1" } });
    expect(r.status).toBe("paid");
    const auth = calls.find((x) => x.url.endsWith("/payments/cards/auth"))!;
    expect(JSON.parse(auth.body)).toMatchObject({ paymentType: "cardId", cardId: { id: "card-1" }, invoiceId: "100000123", amount: 6000, accountId: "u-uuid" });
  });

  it("қайтару: CHARGE — жартылай refund; AUTH толық — cancel; 10 ₸-дан аз — болмайды", async () => {
    const a = fakeBank({ status: "CHARGE", amount: 6000 });
    expect(await halykProvider(cfg(a.f)).refund!("100000123", 3000)).toEqual({ ok: true });
    expect(a.calls.some((x) => x.url.includes("/operation/tx-1/refund?amount=3000"))).toBe(true);
    const b = fakeBank({ status: "AUTH", amount: 6000 });
    expect(await halykProvider(cfg(b.f)).refund!("100000123", 6000)).toEqual({ ok: true });
    expect(b.calls.some((x) => x.url.endsWith("/operation/tx-1/cancel"))).toBe(true);
    expect((await halykProvider(cfg(fakeBank({ status: "CHARGE", amount: 6000 }).f)).refund!("100000123", 5)).ok).toBe(false);
  });

  it("банк 5xx берсе — қате лақтырылады (қайтару «белгісіз» болып қалады, екі рет жіберілмейді)", async () => {
    const f = (async (u: string | URL) => String(u).includes("oauth2") ? new Response(JSON.stringify({ access_token: "t", expires_in: 100 }), { status: 200 }) : new Response("x", { status: 502 })) as typeof fetch;
    await expect(halykProvider(cfg(f)).refund!("100000123", 3000)).rejects.toThrow();
  });

  it("Halyk QR: өшірулі болса — бас тартады; қосулы — Homebank сілтемесі мен QR, токен invoiceID+amount-пен, күй check-status арқылы", async () => {
    const off = fakeBank({ status: "NEW", amount: 6000 });
    await expect(halykProvider(cfg(off.f)).charge({ ...input, card: { hosted: true, qr: true } })).rejects.toThrow("qr_unavailable");
    const state = { status: "NEW", amount: 6000 };
    const { f, calls } = fakeBank(state);
    const p = halykProvider(cfg(f, "prod", true));
    expect(p.qr).toBe(true);
    const r = await p.charge({ ...input, card: { hosted: true, qr: true } });
    expect(r).toMatchObject({ status: "action_required", externalId: "100000123", confirmUrl: "https://homebank.kz/qr?x=1", qr: "000201QRDATA" });
    const tok = new URLSearchParams(calls[0].body);
    expect(tok.get("invoiceID")).toBe("100000123"); expect(tok.get("amount")).toBe("6000"); expect(tok.get("currency")).toBe("KZT");
    const gen = calls.find((x) => x.url.endsWith("/payment/qr/generate"))!;
    expect(JSON.parse(gen.body)).toMatchObject({ accountId: "u-uuid", language: "ru" });
    expect(JSON.parse(gen.body).postLink).toMatch(/^https:\/\/api\.example\.com\/payments\/webhook\/halyk\?inv=100000123&h=[0-9a-f]{32}$/);
    expect(gen.body).not.toContain("payerPhone"); expect(gen.body).not.toContain("payerEmail");
    expect((await p.check!("100000123"))?.status).toBe("pending");
    state.status = "AUTH"; // Homebank-те расталды → ұсталды → біз charge жасаймыз
    expect(await p.check!("100000123")).toMatchObject({ status: "paid", amount: 6000 });
  });

  it("Halyk QR: банк 219 (pay_qr_local өшірулі) — өтпеді; клиент Homebank-ті жапса (CLOSED) — өтпеді, ақша алынбайды", async () => {
    const a = fakeBank({ status: "NEW", amount: 6000, qrOff: true });
    expect(await halykProvider(cfg(a.f, "prod", true)).charge({ ...input, card: { hosted: true, qr: true } })).toMatchObject({ status: "failed", reason: "provider_error" });
    const st = { status: "NONE", amount: 6000, qrStatus: "SCANNED" };
    const b = fakeBank(st);
    const p = halykProvider(cfg(b.f, "prod", true));
    await p.charge({ ...input, card: { hosted: true, qr: true } });
    expect((await p.check!("100000123"))?.status).toBe("pending");
    st.qrStatus = "CLOSED";
    expect(await p.check!("100000123")).toMatchObject({ status: "failed", reason: "declined" });
    expect(b.calls.some((x) => x.url.includes("/charge"))).toBe(false);
  });

  it("Halyk QR хабарламасы: нөмір мен қолтаңба postLink сілтемесінде — жадсыз (сервер қайта қосылса да) қабылданады; қате/бөтен — жоқ", async () => {
    const { f, calls } = fakeBank({ status: "CHARGE", amount: 6000 });
    await halykProvider(cfg(f, "prod", true)).charge({ ...input, card: { hosted: true, qr: true } });
    const link = new URL(JSON.parse(calls.find((x) => x.url.endsWith("/payment/qr/generate"))!.body).postLink);
    expect(link.origin + link.pathname).toBe("https://api.example.com/payments/webhook/halyk");
    const q = Object.fromEntries(link.searchParams);
    expect(q.inv).toBe("100000123"); expect(q.h).toMatch(/^[0-9a-f]{32}$/);
    const fresh = halykProvider(cfg(f, "prod", true)); // жаңа экземпляр — жадта ештеңе жоқ
    expect(await fresh.webhook({ headers: {}, body: "", query: q })).toMatchObject({ externalId: "100000123", status: "paid" });
    expect(await fresh.webhook({ headers: {}, body: JSON.stringify({ invoiceId: "100000123" }), query: q })).toMatchObject({ status: "paid" });
    expect(await fresh.webhook({ headers: {}, body: JSON.stringify({ invoiceId: "100000999" }), query: q })).toBeNull();
    expect(await fresh.webhook({ headers: {}, body: "", query: { inv: "100000123", h: "0".repeat(32) } })).toBeNull();
    expect(await fresh.webhook({ headers: {}, body: JSON.stringify({ invoiceId: "100000123" }) })).toBeNull();
  });

  it("белгісіз аралық күй (мыс. BLOCKED) — «өтпеді» емес, күтуде; нақты REJECT — өтпеді", async () => {
    expect((await halykProvider(cfg(fakeBank({ status: "BLOCKED", amount: 6000 }).f)).check!("100000123"))?.status).toBe("pending");
    expect((await halykProvider(cfg(fakeBank({ status: "REJECT", amount: 6000 }).f)).check!("100000123"))?.status).toBe("failed");
  });

  it("бөліп төлеу: мекеме қосқан айлар банк бетіне installmentConditions болып кетеді; берілмесе — жоқ", async () => {
    const { f } = fakeBank({ status: "NEW", amount: 6000 });
    const p = halykProvider(cfg(f));
    const q = async (inst?: number[]) => new URLSearchParams(LZString.decompressFromEncodedURIComponent(((await p.charge({ ...input, card: { hosted: true }, installment: inst })) as { confirmUrl: string }).confirmUrl.split("params=")[1])!);
    expect((await q([3, 6, 12])).get("installmentConditions")).toBe(encodeParams([3, 6, 12]));
    expect((await q()).get("installmentConditions")).toBeNull();
  });
});
