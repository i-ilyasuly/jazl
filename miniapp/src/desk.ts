// C2 · Мекеме бөлімі (кассир / менеджер / иесі): серверге сұраулар және «мен қызметкермін бе» күйі.
// Бір мини апп: кім кіргеніне қарай Профильде «Мекеме бөлімі» жолы шығады (Патша мақұлдаған шешім, 03-құжат).
import { useSyncExternalStore } from "react";
import { api } from "./api";
import { kv } from "./telegram";

export type Role = "owner" | "manager" | "cashier";
export interface StaffOf { venue: { id: string; slug: string; name: string; kind: string; logoUrl: string | null }; role: Role; branchId: string | null; branches: { id: string; address: string }[] }
export interface DeskOrder { id: string; no: number; type: "now" | "plan"; status: "sent" | "accepted" | "ready"; scheduledAt: string | null; courier: boolean; title: string; customer: string; username: string | null; branch: string; branchId: string; createdAt: string }
export interface DeskUse { id: string; units: number; title: string; customer: string; username: string | null; branchId: string; at: string; cancelled: boolean; canCancel: boolean }
export interface Today { scans: number; units: number; done: number; open: number; plans: number }
export interface StaffRow { userId: string; name: string; username: string | null; photoUrl: string | null; role: Role; branch: string | null; since: string }
export interface InviteRow { code: string; role: Role; expiresAt: string; link: string }

export const roleName: Record<Role, string> = { owner: "Иесі", manager: "Менеджер", cashier: "Кассир" };

let staff: StaffOf[] | null = null; // null — әлі тексерілмеді
let pick = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useStaff = () => useSyncExternalStore(subscribe, () => staff);
export const useDeskPick = () => useSyncExternalStore(subscribe, () => pick);
export const currentStaff = () => (staff && staff.length ? staff[Math.min(pick, staff.length - 1)] : null);
export function setDeskPick(i: number) { pick = i; emit(); kv.set("jazl_desk_pick", String(i)); }

/** Қолданба ашылғанда бір рет: сервер жоқ не клиент болса — бос тізім, Профильде жол шықпайды. */
export async function loadStaff() {
  try {
    const r = await api<{ staff: StaffOf[] }>("/v1/venue/me");
    staff = r.staff;
    const saved = Number(await kv.get("jazl_desk_pick"));
    if (saved > 0 && saved < staff.length) pick = saved;
  } catch { staff = staff ?? []; }
  emit();
}

const post = <T,>(path: string, body: object = {}) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const err = (e: unknown) => (e as { body?: { error?: string } }).body?.error ?? "network";

export const desk = {
  today: (venueId: string) => api<{ today: Today }>(`/v1/venue/${venueId}/today`).then((r) => r.today),
  orders: () => api<{ orders: DeskOrder[] }>("/v1/venue/orders").then((r) => r.orders),
  setStatus: (id: string, status: "accepted" | "ready" | "missed") => post(`/v1/venue/orders/${id}/status`, { status }),
  verify: (code: string) => post<{ order: { no: number; title: string; customer: string; type: "now" | "plan" } }>("/v1/venue/orders/verify", { code }).then((r) => r.order),
  qr: (branchId: string, units: number) => post<{ payload: string; exp: number; ttl: number }>("/v1/venue/qr", { branchId, units }),
  uses: () => api<{ redemptions: DeskUse[] }>("/v1/venue/redemptions").then((r) => r.redemptions),
  cancelUse: (id: string) => post<{ returned: number }>(`/v1/venue/redemptions/${id}/cancel`),
  staff: (venueId: string) => api<{ me: string; staff: StaffRow[]; invites: InviteRow[] }>(`/v1/venue/${venueId}/staff`),
  invite: (venueId: string, role: "manager" | "cashier", branchId?: string) => post<{ code: string; link: string; expiresAt: string }>(`/v1/venue/${venueId}/invites`, branchId ? { role, branchId } : { role }),
  revoke: (venueId: string, code: string) => post(`/v1/venue/${venueId}/invites/${code}/revoke`),
  remove: (venueId: string, userId: string) => post(`/v1/venue/${venueId}/staff/${userId}/remove`),
  inviteInfo: (code: string) => api<{ invite: { venue: string; role: Role; state: "open" | "used" | "expired"; expiresAt: string } }>(`/v1/venue/invites/${code}`).then((r) => r.invite),
  accept: (code: string) => post<{ venue: string; role: Role }>(`/v1/venue/invites/${code}/accept`),
  devJoin: (venueSlug: string, leave = false) => post<{ venue: string }>("/v1/venue/dev-join", leave ? { venueSlug, leave } : { venueSlug }),
};

const T = (d: string) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
const D = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "2-digit", timeZone: "Asia/Almaty" });
const sameDay = (a: Date, b: Date) => a.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" }) === b.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
export const timeOf = T;
export function whenOf(o: DeskOrder) {
  if (o.type === "now") return "Қазір · " + T(o.createdAt) + " келді";
  const at = new Date(o.scheduledAt!);
  return (sameDay(at, new Date()) ? "Бүгін " : D(o.scheduledAt!) + " · ") + T(o.scheduledAt!);
}
export const ago = (d: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return m < 1 ? "жаңа ғана" : m + " мин бұрын"; };
