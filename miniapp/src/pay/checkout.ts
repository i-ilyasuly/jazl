// Карта арқылы сатып алу (бэкенд: POST /v1/purchases, method=card). Нәтиже: төленді / банк растауы (3-D Secure) керек / өтпеді.
import { api } from "../api";
import { openExternal, tg } from "../telegram";

export type CheckoutCard = { id: string } | { cryptogram: string; save?: boolean } | { hosted: true; provider: string; save?: boolean } | { hosted: true; provider: string; qr: true };
/** Төлем тәсілінен серверге жіберілетін карта: сақталған / бір реттік криптограмма / банк беті (картаны сақтаймыз — келесіде бір басумен) */
export const cardOf = (m: { cardId?: string; cryptogram?: string; hosted?: string; qr?: boolean }): CheckoutCard | null =>
  m.cardId ? { id: m.cardId } : m.hosted && m.qr ? { hosted: true, provider: m.hosted, qr: true } : m.hosted ? { hosted: true, provider: m.hosted, save: true } : m.cryptogram ? { cryptogram: m.cryptogram, save: false } : null;
export interface SrvPurchase { id: string; offerSlug: string; unitsTotal: number; unitsLeft: number; validUntil: string; status: string; receipt: { id: string; no: string } | null }
export type CheckoutResult =
  | { status: "paid"; paymentId: string; pack: SrvPurchase; gift?: { code: string } | null; gifts?: { code: string }[]; carried?: number }
  | { status: "action_required"; paymentId: string; confirmUrl: string; /** «Halyk арқылы төлеу»: компьютерде көрсетілетін QR */ qr?: string }
  | { status: "failed"; paymentId?: string; reason: string };

const newKey = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now());

async function call(path: string, init: RequestInit): Promise<CheckoutResult> {
  try {
    const j = await api<{ status: string; paymentId: string; pack?: SrvPurchase; confirmUrl?: string; qr?: string; gift?: { code: string } | null; gifts?: { code: string }[]; carried?: number }>(path, init, 20000);
    if (j.status === "paid" && j.pack) return { status: "paid", paymentId: j.paymentId, pack: j.pack, gift: j.gift ?? null, gifts: j.gifts, carried: j.carried };
    return { status: "action_required", paymentId: j.paymentId, confirmUrl: j.confirmUrl ?? "", ...(j.qr ? { qr: j.qr } : {}) };
  } catch (e) {
    const b = (e as { body?: { error?: string; reason?: string; paymentId?: string } }).body;
    return { status: "failed", paymentId: b?.paymentId, reason: b?.reason ?? b?.error ?? "network" };
  }
}
/** Ескерту: 202 (action_required) api()-де ok саналады — жауап денесінен статусты оқимыз */
export const checkoutCard = (offerSlug: string, card: CheckoutCard, extra: object = {}) =>
  call("/v1/purchases", { method: "POST", body: JSON.stringify({ offerSlug, method: "card", card, idempotencyKey: newKey(), ...extra }) });
/** Бонус бағаны толық жапса — картасыз (сервер карта не Kaspi сұрамайды) */
export const checkoutBonus = (offerSlug: string, extra: object = {}) =>
  call("/v1/purchases", { method: "POST", body: JSON.stringify({ offerSlug, method: "test", useBonus: true, idempotencyKey: newKey(), ...extra }) });
export const paymentStatus = (id: string) => call(`/v1/payments/${id}`, {});
export const testConfirm = (id: string, approve: boolean) => call(`/v1/payments/${id}/test-3ds`, { method: "POST", body: JSON.stringify({ approve }) });

/** Сервер бар ма (Telegram initData не жергілікті dev) — болмаса, мини апп бұрынғыдай үлгі режимде жұмыс істейді */
export const hasServer = () => {
  const w = window as unknown as { Telegram?: { WebApp?: { initData?: string } } };
  if (w.Telegram?.WebApp?.initData) return true;
  try { return import.meta.env.DEV && Boolean(localStorage.getItem("medeo_dev_init")); } catch { return false; }
};
/** Қате себебі → клиентке түсінікті мәтін (Figma «Төлем өтпеді») */
export const failText: Record<string, string> = {
  declined: "Банк төлемді қабылдамады.", insufficient_funds: "Картада қаражат жеткіліксіз.", expired_card: "Картаның мерзімі өтіп кеткен.",
  "3ds_failed": "Банк растауы өтпеді.", limit: "Карта лимиті асып кетті.", fraud: "Банк қауіпсіздік үшін төлемді тоқтатты.",
  provider_error: "Төлем жүйесі уақытша жауап бермеді.", network: "Желі үзілді. Қайталап көр.", card_not_found: "Карта табылмады. Басқа картаны таңда.",
  sold_out: "Осы айдың пакеттері таусылып қалды. Келесі айдың 1-інде қайта ашылады. Ақша алынған жоқ.", user_limit: "Бұл ұсыныстан осы айға шегіңе жеттің: мекеме бір адамға айына шектеулі пакет береді. Ақша алынған жоқ.",
};

/** Ақылы ұзарту картамен (бэкенд: POST /v1/packs/:id/extend) — жауап сатып алумен бірдей: төленді / банк растауы / өтпеді */
export const extendCard = (packId: string, days: number, card: CheckoutCard) =>
  call(`/v1/packs/${packId}/extend`, { method: "POST", body: JSON.stringify({ days, card, idempotencyKey: newKey() }) });

/** Банк растауы бетінен (/pay/3ds) оралғанда — қайта алу, сыйлық, ұзарту өз ісін жалғастырады (сатып алу бетінің өз жолы бар) */
export const pendingPay = new Map<string, (r: Extract<CheckoutResult, { status: "paid" }>) => void>();

/** Компьютердегі Telegram: Homebank сол құрылғыда жоқ — сілтеме ашылмайды, оның орнына күту бетінде QR көрсетеміз */
export const isDesktop = () => {
  const p = tg?.platform ?? "";
  if (["tdesktop", "macos", "weba", "webk", "web", "unigram"].includes(p)) return true;
  if (p === "ios" || p === "android" || p === "android_x") return false;
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent); // Telegram-нан тыс («unknown») — браузерге қарап
};
/** Банк растауын ашу: банк беті не Homebank. QR төлемі компьютерде — ештеңе ашпаймыз (күту бетіндегі QR-ды телефонмен сканерлейді) */
export function openBank(r: { confirmUrl: string; qr?: string }) {
  if (r.qr && isDesktop()) return;
  try { openExternal(r.confirmUrl); } catch { /* ашылмаса да күту беті ашылады: онда «Homebank-ті қайта ашу» мен күй тексеру бар */ }
}

/** Банктің төлем QR-ы (EMV: Halyk, Kaspi т.б.) — біздің касса QR-ы емес */
export const isBankQr = (s: string) => /^000201/.test(s) || /KZ\.HALYKBANK|homebank\.kz\/payments/i.test(s);
/** Банк QR-ы сканерленді: компьютерде бастаған өз төлеміміз болса — Homebank-ті ашып, күту бетіне өтеміз; әйтпесе — түсіндірме */
export async function openBankQr(go: (to: string, dir?: "up", opts?: { replace?: boolean }) => void, qr: string, replace = false) {
  try {
    const j = await api<{ paymentId: string; confirmUrl: string }>("/v1/payments/qr-lookup", { method: "POST", body: JSON.stringify({ qr }) });
    try { openExternal(j.confirmUrl); } catch { /* күту бетінде «Homebank-ті қайта ашу» бар */ }
    go(`/pay/3ds/${j.paymentId}?label=${encodeURIComponent("Halyk арқылы төлеу")}&wait=1`, "up", { replace });
  } catch { go("/scan/state/bankqr", "up", { replace }); }
}
