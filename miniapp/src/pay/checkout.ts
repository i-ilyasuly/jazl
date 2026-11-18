// Карта арқылы сатып алу (бэкенд: POST /v1/purchases, method=card). Нәтиже: төленді / банк растауы (3-D Secure) керек / өтпеді.
import { api } from "../api";

export type CheckoutCard = { id: string } | { cryptogram: string; save?: boolean } | { hosted: true; provider: string; save?: boolean };
/** Төлем тәсілінен серверге жіберілетін карта: сақталған / бір реттік криптограмма / банк беті (картаны сақтаймыз — келесіде бір басумен) */
export const cardOf = (m: { cardId?: string; cryptogram?: string; hosted?: string }): CheckoutCard | null =>
  m.cardId ? { id: m.cardId } : m.hosted ? { hosted: true, provider: m.hosted, save: true } : m.cryptogram ? { cryptogram: m.cryptogram, save: false } : null;
export interface SrvPurchase { id: string; offerSlug: string; unitsTotal: number; unitsLeft: number; validUntil: string; status: string; receipt: { id: string; no: string } | null }
export type CheckoutResult =
  | { status: "paid"; paymentId: string; pack: SrvPurchase; gift?: { code: string } | null; gifts?: { code: string }[]; carried?: number }
  | { status: "action_required"; paymentId: string; confirmUrl: string }
  | { status: "failed"; paymentId?: string; reason: string };

const newKey = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now());

async function call(path: string, init: RequestInit): Promise<CheckoutResult> {
  try {
    const j = await api<{ status: string; paymentId: string; pack?: SrvPurchase; confirmUrl?: string; gift?: { code: string } | null; gifts?: { code: string }[]; carried?: number }>(path, init, 20000);
    if (j.status === "paid" && j.pack) return { status: "paid", paymentId: j.paymentId, pack: j.pack, gift: j.gift ?? null, gifts: j.gifts, carried: j.carried };
    return { status: "action_required", paymentId: j.paymentId, confirmUrl: j.confirmUrl ?? "" };
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
};

/** Ақылы ұзарту картамен (бэкенд: POST /v1/packs/:id/extend) — жауап сатып алумен бірдей: төленді / банк растауы / өтпеді */
export const extendCard = (packId: string, days: number, card: CheckoutCard) =>
  call(`/v1/packs/${packId}/extend`, { method: "POST", body: JSON.stringify({ days, card, idempotencyKey: newKey() }) });

/** Банк растауы бетінен (/pay/3ds) оралғанда — қайта алу, сыйлық, ұзарту өз ісін жалғастырады (сатып алу бетінің өз жолы бар) */
export const pendingPay = new Map<string, (r: Extract<CheckoutResult, { status: "paid" }>) => void>();
