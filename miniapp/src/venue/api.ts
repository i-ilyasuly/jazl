// Мекеме бөлімі (Figma «Jazl+ Мекеме», 13986:7998): серверге сұраулар және «мен қай мекеменің қызметкерімін» күйі.
// Бір мини апп: Профильде «Мекеме бөлімі» → мекеме режимі (өз төменгі мәзірі: Басты · Кассир · Ұсыныстар · Есеп; кассирде Кассир · Тарих).
import { useSyncExternalStore } from "react";
import { api } from "../api";
import { kv } from "../telegram";
import type { OfferKind } from "../mocks/offers";

export type Role = "owner" | "manager" | "cashier";
export interface StaffOf {
  venue: { id: string; slug: string; name: string; kind: OfferKind; city: string; logoUrl: string | null; coverUrl: string | null; rating: number | null; reviews: number; branchesTotal: number };
  role: Role; status: "active" | "pending"; branchId: string | null; branches: { id: string; address: string }[];
}
export interface Use { id: string; kind: "scan" | "order"; at: string; units: number; title: string; slug: string; customer: string; branch: string; branchId: string; orderNo: number | null; amount: number; venueAmount: number; cancelled: boolean; canCancel: boolean }
export interface Dashboard { today: number; yesterday: number; series: number[]; revenueToday: number; revenueYesterday: number; cashierToday: number; cashierRevenue: number; activePacks: number; unitsLeft: number; recent: Use[] }
export interface VOrder { id: string; no: number; type: "now" | "plan"; status: string; scheduledAt: string | null; courier: boolean; title: string; customer: string; branch: string; branchId: string; createdAt: string; code: string; slug: string; doneAt: string | null }
export interface VOffer { id: string; slug: string; title: string; photo?: string | null; kind: OfferKind; unitName: string; status: "active" | "paused" | "draft" | "review" | "ended"; sold: number; validDays: number; sizes: number[]; fromPrice: number; unitPrice: number }
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
export function setPick(i: number) { pick = i; emit(); kv.set("jazl_v_pick", String(i)); }

export async function loadStaff() {
  try {
    const r = await api<{ staff: StaffOf[] }>("/v1/venue/me");
    staff = r.staff;
    const saved = Number(await kv.get("jazl_v_pick"));
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
  report: (vid: string, period: "week" | "month" | "all") => api<{ report: { today: number; total: number; bars: { label: string; amount: number }[]; days: { date: string; count: number; amount: number; status: string }[]; testMode: boolean } }>(`/v1/venue/${vid}/report?period=${period}`).then((r) => r.report),
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

// ── Пішімдеу ──
export const money = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " ₸";
const tz = { timeZone: "Asia/Almaty" } as const;
export const hm = (d: string) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", ...tz });
const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
export const dayMonth = (d: string | Date) => { const x = new Date(new Date(d).toLocaleString("en-US", tz)); return `${x.getDate()} ${MON[x.getMonth()]}`; };
export const isToday = (d: string) => new Date(d).toLocaleDateString("ru-RU", tz) === new Date().toLocaleDateString("ru-RU", tz);
export const dayKey = (d: string) => new Date(d).toLocaleDateString("sv-SE", tz);
