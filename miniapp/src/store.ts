// Қосымшаның жергілікті күйі (бэкендсіз): сатып алынған пакеттер және қолдану тарихы.
// Бэкенд қосылғанда осы файлдың ішкі жағы API шақыруларына ауысады, экрандар өзгермейді.
import { kv } from "./telegram";
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
  history: HistoryItem[];
}

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
];
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
export interface Settings { lock: boolean; bio: boolean; autolock: string; onCard: boolean; onMethods: boolean; onOpen: boolean; lang: "tg" | "kk" | "ru"; astanaNotify: boolean }
let settings: Settings = { lock: false, bio: false, autolock: "1", onCard: true, onMethods: true, onOpen: true, lang: "tg", astanaNotify: false };
export const useSettings = () => useSyncExternalStore(subscribe, () => settings);
export function setSettings(patch: Partial<Settings>) { settings = { ...settings, ...patch }; emit(); kv.set("jazl_settings", JSON.stringify(settings)); }
void kv.get("jazl_settings").then((v) => { if (v) { try { settings = { ...settings, ...JSON.parse(v) }; emit(); } catch { /* бұзылған мән */ } } });

// ── Таңдаулы ────────────────────────────────────────────────────────────────
let favs: string[] = ["doner", "burger"];
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
let soonSubs: number[] = [];
export const useSoon = () => useSyncExternalStore(subscribe, () => soonSubs);
export function toggleSoon(pct: number) { soonSubs = soonSubs.includes(pct) ? soonSubs.filter((x) => x !== pct) : [...soonSubs, pct]; emit(); kv.set("jazl_soon", soonSubs.join(",")); }
void kv.get("jazl_soon").then((v) => { if (v) { soonSubs = v.split(",").map(Number); emit(); } });
