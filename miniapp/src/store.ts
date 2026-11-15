// Қосымшаның жергілікті күйі (бэкендсіз): сатып алынған пакеттер және қолдану тарихы.
// Бэкенд қосылғанда осы файлдың ішкі жағы API шақыруларына ауысады, экрандар өзгермейді.
import { kv } from "./telegram";
import { venues } from "./mocks/venues";
import { useSyncExternalStore } from "react";
import { findOffer, fmt, unitPrice, type Offer } from "./mocks/offers";

export interface HistoryItem { emoji: string; title: string; sub: string; right: string }
export interface Pack {
  id: string;
  offerId: string;
  total: number;
  left: number;
  daysLeft: number;
  until: string;
  /** Мерзімі өткен пакет (Figma «Пакет беті / Мерзімі өтті» 13886:29947); endedOn — «2 қарашада». */
  expired?: boolean;
  endedOn?: string;
  history: HistoryItem[];
}
/** Пакеттің күйі: белсенді, мерзімі жақын (≤3 күн), толық пайдаланылды, мерзімі өтті. */
export type PackState = "active" | "soon" | "used" | "expired";
export const packState = (p: Pack): PackState => p.expired ? "expired" : p.left < 1 ? "used" : p.daysLeft <= 3 ? "soon" : "active";

let packs: Pack[] = [
  { id: "p1", offerId: "doner", total: 4, left: 3, daysLeft: 18, until: "8 желтоқсанға дейін",
    history: [
      { emoji: "🍴", title: "1 бірлік пайдаланылды", sub: "бүгін, 13:20 • Dämdi Doner", right: "Қалды: 3" },
      { emoji: "🛒", title: "Пакет сатып алынды", sub: "8 қараша • Kaspi Pay", right: "4 бірлік" },
    ] },
  { id: "p2", offerId: "haircut", total: 4, left: 1, daysLeft: 2, until: "16 қарашаға дейін",
    history: [
      { emoji: "✂️", title: "3 бірлік пайдаланылды", sub: "қазан–қараша • Qala Barber", right: "Қалды: 1" },
      { emoji: "🛒", title: "Пакет сатып алынды", sub: "17 қазан • Kaspi Pay", right: "4 бірлік" },
    ] },
  // Figma «Пакет беті / Толық пайдаланылды» 13886:29723
  { id: "p3", offerId: "burger-combo", total: 4, left: 0, daysLeft: 17, until: "2 желтоқсанға дейін",
    history: [
      { emoji: "🍴", title: "1 бірлік пайдаланылды", sub: "10 қараша, 14:10 • Bahandi", right: "Қалды: 0" },
      { emoji: "🍴", title: "1 бірлік пайдаланылды", sub: "4 қараша, 13:00 • Bahandi", right: "Қалды: 1" },
      { emoji: "🍴", title: "1 бірлік пайдаланылды", sub: "28 қазан, 19:20 • Bahandi", right: "Қалды: 2" },
      { emoji: "🍴", title: "1 бірлік пайдаланылды", sub: "22 қазан, 12:45 • Bahandi", right: "Қалды: 3" },
      { emoji: "🛒", title: "Пакет сатып алынды", sub: "20 қазан • Kaspi Pay", right: "4 бірлік" },
    ] },
  // Figma «Пакет беті / Мерзімі өтті» 13886:29947
  { id: "p4", offerId: "latte", total: 12, left: 1, daysLeft: 0, until: "2 қарашаға дейін", expired: true, endedOn: "2 қарашада",
    history: [
      { emoji: "☕", title: "1 бірлік пайдаланылды", sub: "30 қазан, 09:10 • Coffee Lab", right: "Қалды: 1" },
      { emoji: "☕", title: "10 бірлік пайдаланылды", sub: "қазан • Coffee Lab", right: "Қалды: 2" },
      { emoji: "🛒", title: "Пакет сатып алынды", sub: "2 қазан • Kaspi Pay", right: "12 бірлік" },
    ] },
];

// ── Соңғы әрекеттер (Figma «Пакеттерім / Тарих» 13886:29206) ────────────────
// action: rate — бағалау күтіп тұр, rated — бағаланған (stars), renew — пакет біткен не мерзімі өткен.
export interface Activity { id: string; emoji: string; title: string; sub: string; packId: string; offerId: string; action: "rate" | "rated" | "renew"; stars?: number }
let acts: Activity[] = [
  { id: "a1", emoji: "🍴", title: "Тауық донері · 1 дана", sub: "Dämdi Doner · бүгін, 13:20", packId: "p1", offerId: "doner", action: "rate" },
  { id: "a2", emoji: "✂️", title: "Шаш қию · 1 рет", sub: "Qala Barber · 8 қараша", packId: "p2", offerId: "haircut", action: "rated", stars: 5 },
  { id: "a3", emoji: "☕", title: "Латте · 12 стакан", sub: "Coffee Lab · мерзімі өтті", packId: "p4", offerId: "latte", action: "renew" },
  { id: "a4", emoji: "🍴", title: "Бургер комбо · 4 дана", sub: "Bahandi · толық пайдаланылды", packId: "p3", offerId: "burger-combo", action: "renew" },
  { id: "a5", emoji: "🍴", title: "Тауық донері · 1 дана", sub: "Dämdi Doner · 5 қараша", packId: "p1", offerId: "doner", action: "rated", stars: 4 },
];
export const useActivity = () => useSyncExternalStore(subscribe, () => acts);
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const usePacks = () => useSyncExternalStore(subscribe, () => packs);
export const offerOf = (p: Pack): Offer => findOffer(p.offerId);
export const getPack = (id?: string) => packs.find((p) => p.id === id);

export function buyPack(offerId: string): string {
  const o = findOffer(offerId);
  const id = "p" + (Date.now() % 100000);
  packs = [{ id, offerId, total: o.units, left: o.units, daysLeft: 30, until: "14 желтоқсанға дейін",
    history: [{ emoji: "🛒", title: "Пакет сатып алынды", sub: "бүгін • Kaspi Pay", right: `${o.units} бірлік` }] }, ...packs];
  emit();
  return id;
}

export function redeem(packId: string): boolean {
  const p = getPack(packId);
  if (!p || p.left < 1) return false;
  const o = offerOf(p);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  packs = packs.map((x) => x.id !== packId ? x : { ...x, left: x.left - 1,
    history: [{ emoji: o.kind === "hair" ? "✂️" : "🍴", title: "1 бірлік пайдаланылды", sub: `бүгін, ${hh} • ${o.venue}`, right: `Қалды: ${x.left - 1}` }, ...x.history] });
  acts = [{ id: "a" + Date.now(), emoji: o.kind === "hair" ? "✂️" : o.kind === "coffee" ? "☕" : "🍴", title: o.title.replace(/· \d+/, "· 1"), sub: `${o.venue} · бүгін, ${hh}`, packId, offerId: o.id, action: "rate" }, ...acts];
  emit();
  return true;
}

export const unitLabel = (p: Pack) => fmt(unitPrice(offerOf(p)));

// ── Хабарландырулар ──────────────────────────────────────────────────────────
export interface Notice { id: string; title: string; sub: string; time: string; read: boolean }
export interface NoticePrefs { expiry: boolean; rating: boolean; offers: boolean; promo: boolean }
let notices: Notice[] = [
  { id: "n1", title: "Тауық донерінің мерзімі 2 күнде бітеді", sub: "Қайта алсаң, қалған бірлік келесі айға көшеді", time: "13:20", read: false },
  { id: "n2", title: "Coffee Lab-та жаңа ұсыныс", sub: "Латте · 15 стақан, −14%", time: "Кеше", read: false },
];
let prefs: NoticePrefs = { expiry: true, rating: true, offers: true, promo: false };
let unread = 2;
const count = () => { unread = notices.filter((n) => !n.read).length; };
export const useNotices = () => useSyncExternalStore(subscribe, () => notices);
export const useNoticePrefs = () => useSyncExternalStore(subscribe, () => prefs);
export const useUnread = () => useSyncExternalStore(subscribe, () => unread);
export function readNotice(id: string) {
  notices = notices.map((n) => (n.id === id ? { ...n, read: true } : n)); count(); emit();
  kv.set("jazl_read", notices.filter((n) => n.read).map((n) => n.id).join(","));
}
export function setNoticePref(k: keyof NoticePrefs, v: boolean) {
  prefs = { ...prefs, [k]: v }; emit(); kv.set("jazl_notice_prefs", JSON.stringify(prefs));
}
void kv.get("jazl_notice_prefs").then((v) => { if (v) { try { prefs = { ...prefs, ...JSON.parse(v) }; emit(); } catch { /* бұзылған мән */ } } });
void kv.get("jazl_read").then((v) => { if (v) { const ids = v.split(","); notices = notices.map((n) => ({ ...n, read: ids.includes(n.id) })); count(); emit(); } });

// ── Баптаулар: қауіпсіздік, тіл, қала ───────────────────────────────────────
export interface Settings { lock: boolean; bio: boolean; autolock: string; onCard: boolean; onMethods: boolean; onOpen: boolean; lang: "tg" | "kk" | "ru"; astanaNotify: boolean; geo: "unknown" | "granted" | "denied" }
let settings: Settings = { lock: false, bio: false, autolock: "1", onCard: true, onMethods: true, onOpen: true, lang: "tg", astanaNotify: false, geo: "unknown" };
export const useSettings = () => useSyncExternalStore(subscribe, () => settings);
export function setSettings(patch: Partial<Settings>) { settings = { ...settings, ...patch }; emit(); kv.set("jazl_settings", JSON.stringify(settings)); }
void kv.get("jazl_settings").then((v) => { if (v) { try { settings = { ...settings, ...JSON.parse(v) }; emit(); } catch { /* бұзылған мән */ } } });

// ── Таңдаулы ────────────────────────────────────────────────────────────────
let favs: string[] = ["doner", "burger", "cappuccino"];
let restock: string[] = [];
export const useFavs = () => useSyncExternalStore(subscribe, () => favs);
export const useRestock = () => useSyncExternalStore(subscribe, () => restock);
export function toggleFav(id: string) { favs = favs.includes(id) ? favs.filter((x) => x !== id) : [id, ...favs]; emit(); kv.set("jazl_favs", favs.join(",")); }
export function toggleRestock(id: string) { restock = restock.includes(id) ? restock.filter((x) => x !== id) : [...restock, id]; emit(); }
void kv.get("jazl_favs").then((v) => { if (v !== null) { favs = v ? v.split(",") : []; emit(); } });

// ── Төлем тәсілдері ─────────────────────────────────────────────────────────
export interface PayMethod { id: string; emoji: string; title: string; sub: string; card: boolean }
let methods: PayMethod[] = [
  { id: "kaspi", emoji: "🏦", title: "Kaspi Pay", sub: "Шот Kaspi.kz қосымшасына жіберіледі", card: false },
  { id: "visa4417", emoji: "💳", title: "Visa •• 4417", sub: "Жарамдылық мерзімі 08/28", card: true },
];
let defaultMethod = "kaspi";
export const useMethods = () => useSyncExternalStore(subscribe, () => methods);
export const useDefaultMethod = () => useSyncExternalStore(subscribe, () => defaultMethod);
export function setDefaultMethod(id: string) { defaultMethod = id; emit(); }
export function addMethod(m: PayMethod, makeDefault = true) { methods = [...methods.filter((x) => x.id !== m.id), m]; if (makeDefault) defaultMethod = m.id; emit(); }
// Kaspi Pay шоты жіберілетін нөмір (пайдаланушы «сақта» десе ғана сақталады)
let kaspiPhone = "";
export const useKaspiPhone = () => useSyncExternalStore(subscribe, () => kaspiPhone);
export function setKaspiPhone(v: string) { kaspiPhone = v; emit(); kv.set("jazl_kaspi_phone", v); }
void kv.get("jazl_kaspi_phone").then((v) => { if (v) { kaspiPhone = v; emit(); } });
export function removeMethod(id: string) { methods = methods.filter((m) => m.id !== id); if (defaultMethod === id) defaultMethod = "kaspi"; emit(); }

// ── PIN ─────────────────────────────────────────────────────────────────────
// Ескерту: нағыз жүйеде PIN серверде тексеріледі. Бэкенд қосылғанша тек жадта тұрады.
let pin: string | null = null;
export const hasPin = () => pin !== null;
export const checkPin = (v: string) => pin === v;
export function savePin(v: string) { pin = v; }

// ── Сыйлықтар ───────────────────────────────────────────────────────────────
export type GiftStatus = "wait" | "ok" | "expired" | "open" | "cancelled";
export interface Gift { id: string; dir: "sent" | "got"; name: string; color: string; pack: string; emoji: string; venue: string; status: GiftStatus; label: string; sentAt: string; until: string }
let gifts: Gift[] = [
  { id: "g1", dir: "sent", name: "Айгерім Нұрланова", color: "#e25a7a", pack: "Тауық донері · 4 дана", emoji: "🍔", venue: "Dämdi Doner", status: "wait", label: "Күтілуде · 5 күн", sentAt: "8 қараша, 13:20", until: "15 қараша" },
  { id: "g2", dir: "sent", name: "Ерлан Серіков", color: "#4378ff", pack: "Латте · 15 стақан", emoji: "☕", venue: "Brew Point", status: "ok", label: "Қабылданды", sentAt: "5 қараша, 09:40", until: "12 қараша" },
  { id: "g3", dir: "sent", name: "Дана Әбілова", color: "#fe9500", pack: "Шаш қию · 4 рет", emoji: "✂️", venue: "Qala Barber", status: "expired", label: "Мерзімі өтті", sentAt: "1 қараша, 11:05", until: "8 қараша" },
  { id: "g4", dir: "got", name: "Берік Нұрлан", color: "#31d158", pack: "Бургер комбо · 4 дана", emoji: "🍔", venue: "Bahandi", status: "open", label: "Ашу", sentAt: "12 қараша, 18:02", until: "19 қараша" },
  { id: "g5", dir: "got", name: "Мадина Ж.", color: "#b00fb4", pack: "Кофе · 10 стақан", emoji: "☕", venue: "Coffee Lab", status: "ok", label: "Қабылданды", sentAt: "2 қараша, 14:30", until: "9 қараша" },
];
export const useGifts = () => useSyncExternalStore(subscribe, () => gifts);
export function setGiftStatus(id: string, status: GiftStatus, label: string) { gifts = gifts.map((g) => (g.id === id ? { ...g, status, label } : g)); emit(); }

// ── Соңғы іздеулер ──────────────────────────────────────────────────────────
let recent: string[] = ["донер", "латте", "шаш қию"];
export const useRecent = () => useSyncExternalStore(subscribe, () => recent);
const saveRecent = () => kv.set("jazl_recent", JSON.stringify(recent));
export function addRecent(q: string) { const v = q.trim().toLowerCase(); if (!v) return; recent = [v, ...recent.filter((x) => x !== v)].slice(0, 5); emit(); saveRecent(); }
export function removeRecent(q: string) { recent = recent.filter((x) => x !== q); emit(); saveRecent(); }
export function clearRecent() { recent = []; emit(); saveRecent(); }
void kv.get("jazl_recent").then((v) => { if (v) { try { recent = JSON.parse(v); emit(); } catch { /* бұзылған мән */ } } });

// ── Алғашқы кіру ────────────────────────────────────────────────────────────
// null — әлі оқылып жатыр (бастапқы экран көрсетіледі), false — таныстыру керек, true — өткен.
let onboarded: boolean | null = null;
export const useOnboarded = () => useSyncExternalStore(subscribe, () => onboarded);
export function finishOnboarding() { onboarded = true; emit(); kv.set("jazl_onboarded", "1"); }
void Promise.all([kv.get("jazl_onboarded"), new Promise((r) => setTimeout(r, 500))]).then(([v]) => { onboarded = v === "1"; emit(); });

// ── «Жуырда» санаттарына жазылу ─────────────────────────────────────────────
let venueSubs: string[] = [];
export const useVenueSubs = () => useSyncExternalStore(subscribe, () => venueSubs);
export function toggleVenueSub(id: string) { venueSubs = venueSubs.includes(id) ? venueSubs.filter((x) => x !== id) : [...venueSubs, id]; emit(); }
let soonSubs: number[] = [];
export const useSoon = () => useSyncExternalStore(subscribe, () => soonSubs);
export function toggleSoon(pct: number) { soonSubs = soonSubs.includes(pct) ? soonSubs.filter((x) => x !== pct) : [...soonSubs, pct]; emit(); kv.set("jazl_soon", soonSubs.join(",")); }
void kv.get("jazl_soon").then((v) => { if (v) { soonSubs = v.split(",").map(Number); emit(); } });

// ── Алдын ала тапсырыс ──────────────────────────────────────────────────────
// Пакет бұрын төленген, сондықтан тапсырыс кезінде ешқандай шот/карта төлемі жоқ:
// пакеттен 1 бірлік шегеріледі. Тапсырыс мекемеге жетпесе, бірлік қайтарылады.
export interface Branch { id: string; address: string; hours: string; km: number; open: boolean }
export interface Order { id: string; no: number; packId: string; title: string; venue: string; emoji: string; branch: string; time: string; code: string; status: "sent" | "done"; created: string }
const branchesOf: Record<string, Branch[]> = {
  "Dämdi Doner": [
    { id: "b1", address: "Нұркен Әбдіров, 24", hours: "09:00–23:00", km: 1.2, open: true },
    { id: "b2", address: "Мәңгілік Ел, 28", hours: "10:00–22:00", km: 3.4, open: true },
    { id: "b3", address: "Бухар-Жырау, 52", hours: "10:00–22:00", km: 4.1, open: false },
  ],
};
export const branches = (venue: string, address: string): Branch[] => branchesOf[venue] ?? [{ id: "b1", address, hours: "09:00–22:00", km: 1.2, open: venues.find((v) => v.name === venue)?.status !== "closed" }];
let orders: Order[] = [
  { id: "o104", no: 104, packId: "p1", title: "Бургер комбо · 1 бірлік", venue: "Bahandi", emoji: "🍔", branch: "Бұқар жырау 59", time: "14:00", code: "3071", status: "sent", created: "бүгін, 12:40" },
];
let orderNo = 105;
export const useOrders = () => useSyncExternalStore(subscribe, () => orders);
export const getOrder = (id?: string) => orders.find((o) => o.id === id);
export function placeOrder(packId: string, branch: string, time: string): Order | null {
  const p = getPack(packId);
  if (!p || p.left < 1) return null;
  const o = offerOf(p);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const no = orderNo++;
  const order: Order = { id: "o" + no, no, packId, title: `${o.title.split(" · ")[0]} · 1 бірлік`, venue: o.venue, emoji: o.kind === "coffee" ? "☕" : o.kind === "hair" ? "✂️" : "🍔", branch, time, code: String(1000 + Math.floor(Math.random() * 9000)), status: "sent", created: `бүгін, ${hh}` };
  orders = [order, ...orders];
  packs = packs.map((x) => x.id !== packId ? x : { ...x, left: x.left - 1,
    history: [{ emoji: "🛍️", title: `Тапсырыс №${no}`, sub: `бүгін, ${hh} • ${branch}`, right: `Қалды: ${x.left - 1}` }, ...x.history] });
  emit();
  return order;
}
/** Тапсырыс мекемеге жетпесе: бірлікті пакетке қайтару. */
export function failOrder(id: string) {
  const o = getOrder(id); if (!o) return;
  orders = orders.filter((x) => x.id !== id);
  packs = packs.map((x) => x.id !== o.packId ? x : { ...x, left: x.left + 1, history: x.history.slice(1) });
  emit();
}
export function finishOrder(id: string) { orders = orders.map((o) => (o.id === id ? { ...o, status: "done" } : o)); emit(); }
