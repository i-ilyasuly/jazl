// Мекеме бөлімі (Figma «Medeo Мекеме», 13986:7998): серверге сұраулар және «мен қай мекеменің қызметкерімін» күйі.
// Бір мини апп: Профильде «Мекеме бөлімі» → мекеме режимі (өз төменгі мәзірі: Басты · Кассир · Ұсыныстар · Есеп; кассирде Кассир · Тарих).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../api";
import { kv } from "../telegram";
import type { OfferKind } from "../mocks/offers";

export type Role = "owner" | "manager" | "cashier";
export interface StaffOf {
  venue: { id: string; slug: string; name: string; kind: OfferKind; status?: string; statusNote?: string | null; city: string; logoUrl: string | null; coverUrl: string | null; rating: number | null; reviews: number; branchesTotal: number;
    /** Комиссия деңгейі (сервер: venueScore.ts) және сенімділік (90 күн, % — жеткілікті дерек болса) */
    fee?: { pct: number; base: number; custom: boolean; tiers: { rating: number; reviews: number; pct: number }[]; next: { rating: number; reviews: number; pct: number } | null };
    reliability?: number | null; reliabilityN?: number };
  role: Role; status: "active" | "pending"; branchId: string | null; branches: { id: string; address: string }[];
}
export interface Use { id: string; kind: "scan" | "order"; at: string; units: number; title: string; slug: string; customer: string; branch: string; branchId: string; orderNo: number | null; amount: number; venueAmount: number; cancelled: boolean; canCancel: boolean }
export interface Dashboard { total?: number; record?: number; offers?: number; cashiers?: number; complaints?: number; today: number; yesterday: number; series: number[]; revenueToday: number; revenueYesterday: number; cashierToday: number; cashierRevenue: number; activePacks: number; unitsLeft: number; recent: Use[] }
export interface VOrder { id: string; no: number; type: "now" | "plan"; status: string; scheduledAt: string | null; courier: boolean; title: string; customer: string; branch: string; branchId: string; createdAt: string; code: string; slug: string; doneAt: string | null }
export interface VOffer { id: string; slug: string; title: string; photo?: string | null; kind: OfferKind; unitName: string; status: "active" | "paused" | "draft" | "review" | "ended"; sold: number; validDays: number; sizes: number[]; fromPrice: number; unitPrice: number; /** айлық сату лимиті (жоқ — null) және осы айда сатылғаны */ limit?: number | null; soldMonth: number }
export interface StaffRow { userId: string; name: string; username: string | null; photoUrl: string | null; role: Role; status: "active" | "pending"; branch: string | null; branchId: string | null; since: string; lastSeen: string }
export interface Paid { redemptionId: string; customer: string; title: string; units: number; left: number; total: number; amount: number; venueAmount: number; extra: number; at: string; ref: string | null; receiptId: string | null; cancelled: boolean }
export type QrState = { status: "waiting"; code: string; codeExp: string; expiresAt: string; payload: string; exp: number; ttl: number; units: number; extra: number; title: string | null; unitName: string | null } | { status: "paid"; paid: Paid } | { status: "expired" } | { status: "cancelled" };

export const roleName: Record<Role, string> = { owner: "Иесі", manager: "Басқарушы", cashier: "Кассир" };

let staff: StaffOf[] | null = null; // null — әлі тексерілмеді
let pick = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useStaff = () => useSyncExternalStore(subscribe, () => staff);
export const usePick = () => useSyncExternalStore(subscribe, () => pick);
/** Таңдалған мекеме (бірнешеу болса — «Мекемені таңда» бетінде таңдалады) */
export const current = (): StaffOf | null => {
  const act = staff?.filter((x) => x.status === "active") ?? [];
  return act.length ? act[Math.min(pick, act.length - 1)] : null;
};
export const useCurrent = () => { useStaff(); usePick(); return current(); };
export function setPick(i: number) { pick = i; emit(); kv.set("medeo_v_pick", String(i)); }

export async function loadStaff() {
  try {
    const r = await api<{ staff: StaffOf[] }>("/v1/venue/me");
    staff = r.staff;
    const saved = Number(await kv.get("medeo_v_pick"));
    if (saved > 0) pick = saved;
  } catch { staff = staff ?? []; }
  emit();
}

const post = <T,>(path: string, body: object = {}) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const err = (e: unknown) => (e as { body?: { error?: string } }).body?.error ?? "network";

export const V = {
  dashboard: (vid: string, branch?: string) => api<{ dashboard: Dashboard }>(`/v1/venue/${vid}/dashboard${branch ? "?branch=" + branch : ""}`).then((r) => r.dashboard),
  history: (vid: string, days: number, branch?: string) => api<{ summary: { count: number; amount: number; refunds: number }; items: Use[] }>(`/v1/venue/${vid}/history?days=${days}${branch ? "&branch=" + branch : ""}`),
  orders: () => api<{ orders: VOrder[] }>("/v1/venue/orders").then((r) => r.orders),
  order: (vid: string, id: string) => api<{ order: VOrder & { amount: number; venueAmount: number } }>(`/v1/venue/${vid}/orders/${id}`).then((r) => r.order),
  setStatus: (id: string, status: "accepted" | "ready" | "missed") => post(`/v1/venue/orders/${id}/status`, { status }),
  verify: (code: string) => post<{ order: { no: number; title: string; customer: string } }>("/v1/venue/orders/verify", { code }),
  offers: (vid: string) => api<{ offers: VOffer[] }>(`/v1/venue/${vid}/offers`).then((r) => r.offers),
  offerStatus: (vid: string, id: string, status: "active" | "paused") => post(`/v1/venue/${vid}/offers/${id}/status`, { status }),
  report: (vid: string, period: "week" | "month" | "all") => api<{ report: VReportData }>(`/v1/venue/${vid}/report?period=${period}`).then((r) => r.report),
  insights: (vid: string, period: "week" | "month" | "all") => api<{ insights: VInsights }>(`/v1/venue/${vid}/insights?period=${period}`).then((r) => r.insights),
  qr: (branchId: string, offerId: string, units: number, extra: number) => post<{ session: { id: string; code: string; codeExp: string; expiresAt: string; payload: string; exp: number } }>("/v1/venue/qr", { branchId, offerId, units, extra }).then((r) => r.session),
  qrState: (id: string) => api<QrState>(`/v1/venue/qr/${id}`),
  qrCancel: (id: string) => post(`/v1/venue/qr/${id}/cancel`),
  cancelUse: (id: string) => post<{ returned: number }>(`/v1/venue/redemptions/${id}/cancel`),
  staff: (vid: string) => api<{ me: string; staff: StaffRow[] }>(`/v1/venue/${vid}/staff`),
  staffOne: (vid: string, uid: string) => api<{ staff: StaffRow & { today: { count: number; amount: number }; days: { date: string; count: number; amount: number }[] } }>(`/v1/venue/${vid}/staff/${uid}`).then((r) => r.staff),
  approve: (vid: string, uid: string) => post(`/v1/venue/${vid}/staff/${uid}/approve`),
  remove: (vid: string, uid: string) => post(`/v1/venue/${vid}/staff/${uid}/remove`),
  moveBranch: (vid: string, uid: string, branchId: string | null) => post(`/v1/venue/${vid}/staff/${uid}/branch`, { branchId }),
  invite: (vid: string) => api<{ invite: { code: string; expiresAt: string; link: string } | null }>(`/v1/venue/${vid}/invite`).then((r) => r.invite),
  newInvite: (vid: string) => post<{ code: string; expiresAt: string; link: string }>(`/v1/venue/${vid}/invites`, { role: "cashier" }),
  join: (code: string) => post<{ venue: string; role: Role; status: "active" | "pending" }>("/v1/venue/join", { code }),
  devJoin: (venueSlug: string, leave = false) => post<{ venue: string }>("/v1/venue/dev-join", leave ? { venueSlug, leave } : { venueSlug }),
};

// ── Беттер арасындағы кэш (Патша, 2026-11-17: «әр бетке өткен сайын қайта жүктеледі») ──
// Таб ауысқанда бет бұрын алынған деректі бірден көрсетеді, жаңасы фонда келіп, үнсіз ауыстырады (stale-while-revalidate).
const cache = new Map<string, unknown>();
export function useCached<T>(key: string | null, fetcher: () => Promise<T>, fallback?: T): [T | null, (v: T | ((p: T | null) => T)) => void, () => Promise<void>] {
  const [data, setData] = useState<T | null>(() => (key && cache.has(key) ? (cache.get(key) as T) : null));
  const keyRef = useRef(key); keyRef.current = key;
  const fRef = useRef(fetcher); fRef.current = fetcher;
  const set = useCallback((v: T | ((p: T | null) => T)) => {
    setData((p) => { const n = typeof v === "function" ? (v as (p: T | null) => T)(p) : v; if (keyRef.current) cache.set(keyRef.current, n); return n; });
  }, []);
  const reload = useCallback(async () => {
    const k = keyRef.current; if (!k) return;
    try { const v = await fRef.current(); cache.set(k, v); if (keyRef.current === k) setData(v); }
    catch { if (fallback !== undefined && !cache.has(k) && keyRef.current === k) setData(fallback); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!key) return; setData(cache.has(key) ? (cache.get(key) as T) : null); void reload(); }, [key, reload]);
  return [data, set, reload];
}

// ── Пішімдеу ──
export const money = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " ₸";
const tz = { timeZone: "Asia/Almaty" } as const;
export const hm = (d: string) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", ...tz });
const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
export const dayMonth = (d: string | Date) => { const x = new Date(new Date(d).toLocaleString("en-US", tz)); return `${x.getDate()} ${MON[x.getMonth()]}`; };
export const isToday = (d: string) => new Date(d).toLocaleDateString("ru-RU", tz) === new Date().toLocaleDateString("ru-RU", tz);
export const dayKey = (d: string) => new Date(d).toLocaleDateString("sv-SE", tz);

export interface VReportData {
  today: number; total: number; prevTotal: number | null; feePct: number; testMode: boolean;
  bars: { label: string; amount: number }[];
  days: { date: string; count: number; amount: number; status: "paid" | "pending" }[];
  money: { earned: number; paid: number; due: number; paidThrough: string | null };
  payouts: { id: string; amount: number; from: string; to: string; paidAt: string; ref: string | null }[];
  /** Бірнеше ақша алушы (франшиза, 0034): әр заңды тұлғаның қалдығы */
  payees?: { name: string | null; iban4: string | null; branches: string[]; earned: number; paid: number; due: number; paidThrough: string | null }[];
}
export interface VInsights {
  period: string; days: number; feePct: number;
  customers: { buyers: number; buyersPrev: number | null; newBuyers: number; newPrev: number | null; returning: number; visitors: number; visitorsPrev: number | null; everBuyers: number; repeatRate: number | null };
  money: { packs: number; packsPrev: number | null; prepaid: number; prepaidPrev: number | null; liability: number; unitsLeft: number; activePacks: number; expiredUnits: number; expiredValue: number };
  rating: { all: number | null; reviews: number; period: number | null; periodReviews: number };
  offers: { id: string; title: string; packs: number; prepaid: number; uses: number; utilization: number | null; repeatRate: number | null }[];
  load: { hours: number[]; weekdays: number[]; total: number };
}
