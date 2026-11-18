// Halyk ePay адаптері (src/payments/halyk.ts): банк жауаптары жасанды fetch арқылы. Нақты сынақ ортасымен тексеріс — 07 журналда.
import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import { encodeParams, halykProvider } from "../src/payments/halyk.js";

type Call = { url: string; method: string; body: string };
function fakeBank(state: { status: string; amount: number; cardID?: string }) {
  const calls: Call[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input); const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
    calls.push({ url, method: init?.method ?? "GET", body });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/oauth2/token")) return json({ access_token: "TOKEN_" + calls.length, expires_in: 1200, scope: "payment", token_type: "Bearer" });
    if (url.includes("/check-status/payment/transaction/")) return json({ resultCode: "100", transaction: { id: "tx-1", invoiceID: url.split("/").pop(), amount: state.amount, statusName: state.status, cardID: state.cardID, cardMask: "440563...5096", cardType: "VISA", reasonCode: "0" } });
    if (url.includes("/charge")) { state.status = "CHARGE"; return json({ code: 0, message: "success" }); }
    if (url.includes("/cancel")) { state.status = "CANCEL"; return json({ code: 0 }); }
    if (url.includes("/refund")) { state.status = "REFUND"; return json({ code: 0, message: "success" }); }
    if (url.includes("/payments/cards/auth")) return json({ status: "CHARGE", code: 0 });
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls };
}
const cfg = (f: typeof fetch, env: "test" | "prod" = "prod") => ({ env, clientId: "cid", clientSecret: "csecret", terminalId: "term-1", publicUrl: "https://api.example.com", hashKey: "k", fetch: f });
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
});
