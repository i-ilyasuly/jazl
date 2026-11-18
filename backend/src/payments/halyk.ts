// Halyk ePay (epayment.kz). Карта Halyk-тің қорғалған бетінде енгізіледі — карта деректері бізге ешқашан келмейді (PCI DSS қажет емес).
//
// Ағын (2026-11-18, ашық сынақ ортасында тексерілді):
//   1) OAuth токен (client_credentials, scope payment) — әр төлемге жеке: invoiceID, amount, terminal, secret_hash бірге жіберіледі.
//   2) Төлем беті: payform/?params=LZString(encodeParams({ invoiceId, amount, terminal, auth, backLink, postLink, cardSave … })).
//      Halyk-тің payment-api.js кітапханасы (halyk.pay) дәл осыны жасайды — біз сілтемені серверде құрамыз, клиент оны ашады.
//   3) Нәтиже: postLink (JSON) — қолтаңбасыз, сондықтан ОҒАН СЕНБЕЙМІЗ: secret_hash тексеріліп, күй статус API-ден қайта сұралады.
//      Статус: AUTH (ұсталды) → біз бірден charge жасаймыз; CHARGE — төленді; REFUND — қайтарылған; басқасы — өтпеді.
//   4) Сақталған карта (cardSave → cardID): /payments/cards/auth, paymentType=cardId — клиентсіз (автожаңарту).
//   5) Қайтару: /operation/:id/refund?amount= (жартылай да болады, кемінде 10 ₸); AUTH күйінде — толық болса cancel.
// Ескерту: құжатта көрсетілген testepay.homebank.kz / testoauth.homebank.kz жұмыс істемейді — сынақта test-epay-*.epayment.kz.
import { createHmac } from "node:crypto";
import LZString from "lz-string";
import type { CardInfo, ChargeResult, FailReason, PaymentProvider, WebhookEvent } from "./types.js";
import { PaymentError } from "./types.js";

export interface HalykConfig { env: "test" | "prod"; clientId: string; clientSecret: string; terminalId: string; publicUrl?: string; hashKey: string; fetch?: typeof fetch }
const HOSTS = {
  test: { oauth: "https://test-epay-oauth.epayment.kz/oauth2/token", api: "https://test-epay-api.epayment.kz", page: "https://test-epay.epayment.kz/payform/" },
  prod: { oauth: "https://epay-oauth.homebank.kz/oauth2/token", api: "https://epay-api.homebank.kz", page: "https://epay.homebank.kz/payform/" },
};
const SCOPE = "webapi usermanagement email_send verification statement statistics payment";

/** Halyk payment-api.js-тегі encodeParams-тың дәл көшірмесі (кірістірілген объект те кодталады) */
export function encodeParams(p: unknown): string {
  if (p === undefined || p === null) return "";
  if (typeof p !== "object") return String(p);
  return Object.keys(p as object).filter(Boolean).map((k) => k + "=" + encodeURIComponent(encodeParams((p as Record<string, unknown>)[k]))).join("&");
}
type Tx = { id: string; invoiceID: string; amount: number; statusName: string; accountID?: string; cardID?: string; cardMask?: string; cardType?: string; reason?: string; reasonCode?: string };

export function halykProvider(c: HalykConfig): PaymentProvider {
  const H = HOSTS[c.env];
  const http = c.fetch ?? fetch;
  /** postLink-тегі secret_hash: invoiceId-дің HMAC-ы — хабарлама біздің төлемге қатысты екенін көрсетеді (бірақ күйді бәрібір API-ден аламыз) */
  const hashOf = (invoiceId: string) => createHmac("sha256", c.hashKey).update("halyk:" + invoiceId).digest("hex").slice(0, 32);
  let svc: { token: string; until: number } | null = null;
  async function oauth(extra: Record<string, string>) {
    const r = await http(H.oauth, { method: "POST", body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE, client_id: c.clientId, client_secret: c.clientSecret, terminal: c.terminalId, ...extra }) });
    if (!r.ok) throw new Error("halyk_oauth_" + r.status);
    return (await r.json()) as { access_token: string; expires_in: number; refresh_token?: string; scope: string; token_type: string };
  }
  /** Қызметтік токен (статус, charge, refund, cancel) — уақыты біткенше қайта қолданылады */
  async function serviceToken() {
    if (svc && svc.until > Date.now()) return svc.token;
    const t = await oauth({});
    svc = { token: t.access_token, until: Date.now() + Math.max(60, t.expires_in - 60) * 1000 };
    return svc.token;
  }
  async function api(path: string, init: RequestInit = {}) {
    const r = await http(H.api + path, { ...init, headers: { Authorization: "Bearer " + (await serviceToken()), ...(init.headers ?? {}) } });
    const text = await r.text();
    let body: Record<string, unknown> = {}; try { body = JSON.parse(text); } catch { /* бос жауап */ }
    if (r.status >= 500) throw new Error("halyk_" + r.status); // жауап белгісіз — шақырушы «белгісіз» деп қарайды
    return { ok: r.ok, status: r.status, body };
  }
  async function status(invoiceId: string): Promise<Tx | null> {
    const r = await api("/check-status/payment/transaction/" + encodeURIComponent(invoiceId));
    const { resultCode, transaction: tx } = r.body as { resultCode?: string; transaction?: Tx };
    // 100 — табылды; 101 — банк бас тартты (транзакция бар, күйі REJECT); 102 — әлі жоқ (клиент төлемеген), 107 — өңделуде
    if ((resultCode !== "100" && resultCode !== "101") || !tx?.id) return null;
    return tx;
  }
  const cardOf = (tx: { cardID?: string; cardMask?: string; cardType?: string }): CardInfo | undefined =>
    tx.cardID ? { token: tx.cardID, brand: (tx.cardType || "Карта").slice(0, 20), last4: (tx.cardMask ?? "").replace(/\D/g, "").slice(-4) || "0000", expMonth: 0, expYear: 0 } : undefined;
  const reasonOf = (code?: string | number): FailReason => {
    const n = Number(code);
    return n === 473 || n === 455 ? "3ds_failed" : n === 2001 || n === 51 ? "insufficient_funds" : n === 54 ? "expired_card" : "declined";
  };
  /** Halyk күйі → біздің оқиға. AUTH болса — бірден есептен шығарамыз (charge): Medeo-да бір қадамды төлем. */
  async function settle(invoiceId: string, tx: Tx | null): Promise<WebhookEvent> {
    if (!tx) return { externalId: invoiceId, status: "pending" };
    if (tx.statusName === "AUTH") {
      const r = await api(`/operation/${tx.id}/charge`, { method: "POST" });
      if (!r.ok) return { externalId: invoiceId, status: "pending" }; // келесі тексеруде қайта көреміз
      tx = { ...tx, statusName: "CHARGE" };
    }
    if (tx.statusName === "CHARGE") return { externalId: invoiceId, status: "paid", amount: Number(tx.amount), card: cardOf(tx), accountId: tx.accountID || undefined };
    if (tx.statusName === "NEW" || tx.statusName === "3D") return { externalId: invoiceId, status: "pending" };
    return { externalId: invoiceId, status: "failed", reason: reasonOf(tx.reasonCode), accountId: tx.accountID || undefined };
  }

  return {
    name: "halyk",
    hosted: true,
    testMode: c.env === "test",
    async tokenize() { throw new PaymentError("hosted_only"); }, // карта тек банк бетінде (төлеммен бірге) сақталады
    async charge(i): Promise<ChargeResult> {
      if (!i.orderNo) throw new PaymentError("no_order_no");
      // Нақты терминал Medeo-ның өзінікі — реттік нөмір жеткілікті. Сынақ терминалын бәрі ортақ қолданады (100000026 сияқты нөмір
      // бұрын біреуде болған — банк бас тартады), сондықтан сынақта нөмір уақыт пен кездейсоқ саннан (12 цифр, соңғы 6-сы әр түрлі).
      const invoiceId = c.env === "prod" ? String(i.orderNo) : String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
      // Сақталған картамен — клиентсіз (автожаңарту, бір басумен сатып алу)
      if (i.card.token) {
        const t = await oauth({ invoiceID: invoiceId, amount: String(i.amount), currency: "KZT" });
        const r = await http(H.api + "/payments/cards/auth", { method: "POST", headers: { Authorization: "Bearer " + t.access_token, "Content-Type": "application/json" },
          body: JSON.stringify({ amount: i.amount, currency: "KZT", name: "MEDEO CLIENT", terminalId: c.terminalId, invoiceId, description: i.description.slice(0, 120), accountId: i.user.id,
            backLink: i.returnUrl, failureBackLink: i.returnUrl, postLink: c.publicUrl ? c.publicUrl + "/payments/webhook/halyk" : i.returnUrl, failurePostLink: c.publicUrl ? c.publicUrl + "/payments/webhook/halyk" : i.returnUrl,
            language: "rus", paymentType: "cardId", recurrent: true, cardId: { id: i.card.token } }) });
        if (r.status >= 500) throw new Error("halyk_" + r.status);
        const j = (await r.json().catch(() => ({}))) as { status?: string; code?: number };
        if (j.status === "3D") return { status: "failed", externalId: invoiceId, reason: "3ds_required" };
        if (j.status === "CHARGE" || j.status === "AUTH") {
          const ev = await settle(invoiceId, await status(invoiceId));
          if (ev.status === "paid") return { status: "paid", externalId: invoiceId };
        }
        return { status: "failed", externalId: invoiceId, reason: "declined" };
      }
      if (i.card.cryptogram) throw new PaymentError("bad_card"); // ішкі карта формасы — PCI DSS-сіз мүмкін емес
      // Банктің қорғалған беті
      const t = await oauth({ invoiceID: invoiceId, amount: String(i.amount), currency: "KZT", secret_hash: hashOf(invoiceId),
        ...(c.publicUrl ? { postLink: c.publicUrl + "/payments/webhook/halyk", failurePostLink: c.publicUrl + "/payments/webhook/halyk" } : {}) });
      const params = { invoiceId, backLink: i.returnUrl, failureBackLink: i.returnUrl,
        postLink: c.publicUrl ? c.publicUrl + "/payments/webhook/halyk" : i.returnUrl, failurePostLink: c.publicUrl ? c.publicUrl + "/payments/webhook/halyk" : i.returnUrl,
        language: "RUS", description: i.description.slice(0, 120), accountId: i.user.id, terminal: c.terminalId, amount: i.amount, currency: "KZT", cardSave: Boolean(i.card.save), auth: t };
      return { status: "action_required", externalId: invoiceId, confirmUrl: H.page + "?params=" + LZString.compressToEncodedURIComponent(encodeParams(params)) };
    },
    async webhook(req) {
      let j: { invoiceId?: string; secret_hash?: string };
      try { j = JSON.parse(req.body); } catch { return null; }
      if (!j.invoiceId || !/^\d{6,15}$/.test(j.invoiceId) || j.secret_hash !== hashOf(j.invoiceId)) return null;
      return settle(j.invoiceId, await status(j.invoiceId)); // хабарламаның өзіне емес, банктің API-іне сенеміз
    },
    async check(externalId) { return settle(externalId, await status(externalId)); },
    async refund(externalId, amount) {
      const tx = await status(externalId);
      if (!tx) return { ok: false, reason: "not_found" };
      if (amount < 10) return { ok: false, reason: "min_amount" };
      if (tx.statusName === "AUTH" && amount >= Number(tx.amount)) {
        const r = await api(`/operation/${tx.id}/cancel`, { method: "POST" });
        return r.ok ? { ok: true } : { ok: false, reason: "declined" };
      }
      if (tx.statusName === "AUTH") { const ch = await api(`/operation/${tx.id}/charge`, { method: "POST" }); if (!ch.ok) return { ok: false, reason: "declined" }; }
      const r = await api(`/operation/${tx.id}/refund?amount=${amount}&externalID=${encodeURIComponent("medeo-" + externalId + "-" + Date.now())}`, { method: "POST" });
      return r.ok ? { ok: true } : { ok: false, reason: "declined" };
    },
  };
}
