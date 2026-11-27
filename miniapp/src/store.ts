// Қосымшаның жергілікті күйі (бэкендсіз): сатып алынған пакеттер және қолдану тарихы.
// Бэкенд қосылғанда осы файлдың ішкі жағы API шақыруларына ауысады, экрандар өзгермейді.
import type { OffPeak } from "./offpeak";
import { applyLangPref, getLang, getPref, kk } from "./i18n";
import { loadBonus, takeBonusNext } from "./pay/bonus";
import { kv, nativeAlert, saveBioToken, takeBioToken } from "./telegram";
import { API_URL, BOT_APP_LINK, SITE_URL } from "./config";
import { venues } from "./mocks/venues";
import { useSyncExternalStore } from "react";
import { api, apiFetch, pinTok } from "./api";
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
  /** Мерзімі өткеннен бері өткен күн (3 күннен асса, қалған бірлік жаңа пакетке көшпейді). */
  expiredAgo?: number;
  /** Мекеменің бір реттік тегін ұзартуы пайдаланылды ма; extendedTo — соңғы ұзартудан кейінгі мерзім. */
  freeExtendUsed?: boolean;
  extendedTo?: string;
  /** Мекеме ұзартуға рұқсат бермейді (Figma «Мерзімін ұзарту / Мүмкін емес»). */
  noExtend?: boolean;
  /** Қайта алғанда бұрынғы пакеттен көшкен бірлік саны. */
  carried?: number;
  /** Ұзарту шегінен қалған күн (сервер: жалпы 60 күн, Басқару баптауы) */
  extendLeft?: number;
  /** Сыйлыққа алынған пакет (алушыда): ақшаны тек сыйлаған адам қайтара алады */
  gifted?: boolean;
  /** Автожаңарту қосулы ма (пакет біткенде сақталған картадан сол көлем қайта алынады) */
  autoRenew?: boolean;
  /** Бос сағат жеңілдігімен алынған: келу уақыты тек осы терезеде */
  offPeak?: OffPeak | null;
  history: HistoryItem[];
  /** B2: сервердегі пакет пен чек (бэкендпен сатып алынса) */
  serverId?: string;
  receiptId?: string;
  receiptNo?: string;
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
      { emoji: "🛒", title: "Пакет сатып алынды", sub: "17 қыркүйек • Kaspi Pay", right: "4 бірлік" },
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
  { id: "p4", offerId: "latte", total: 12, left: 1, daysLeft: 0, until: "2 қарашаға дейін", expired: true, endedOn: "2 қарашада", expiredAgo: 13,
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
export const subscribeSettings = subscribe;

// ── Күндер: «16 қарашаға дейін» пішімі ─────────────────────────────────────
const DAT = ["қаңтарға", "ақпанға", "наурызға", "сәуірге", "мамырға", "маусымға", "шілдеге", "тамызға", "қыркүйекке", "қазанға", "қарашаға", "желтоқсанға"];
const DAT_GEN = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
export const untilText = (d: Date) => `${d.getDate()} ${DAT[d.getMonth()]} дейін`;
/** «16 қарашаға дейін» + N күн → «23 қарашаға дейін» (жыл — ағымдағы). */
export function shiftUntil(until: string, days: number): string {
  const m = until.match(/^(\d+)\s+(\S+)/);
  const mi = m ? DAT.indexOf(m[2]) : -1;
  if (!m || mi < 0) return until;
  const d = new Date(new Date().getFullYear(), mi, Number(m[1]) + days);
  return untilText(d);
}
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return untilText(d); };

export const usePacks = () => useSyncExternalStore(subscribe, () => packs);
export const offerOf = (p: Pack): Offer => findOffer(p.offerId);
// Бот хабарламасының батырмасы (pk_<серверлік id>) серверлік толық id-мен келеді — жергілікті id-мен де, серверлікпен де табамыз
// (Патша, 2026-11-21: хабарламадан ашқанда бет бос қалатын).
export const getPack = (id?: string) => (id ? packs.find((p) => p.id === id || p.serverId === id) : undefined);
export const allPacks = () => packs;

/** Келесі сатып алудың қосымша таңдауы (сатып алу парағы қояды): бос сағат жеңілдігі */
let buyExtra: { offPeak?: boolean } = {};
export const setBuyExtra = (x: { offPeak?: boolean }) => { buyExtra = x; };
export function buyPack(offerId: string, methodLabel = "Kaspi Pay"): string {
  const o = findOffer(offerId);
  const offPeak = buyExtra.offPeak && o.offPeak ? o.offPeak : null;
  const id = "p" + (Date.now() % 100000);
  const pre = adopted.get(offerId); adopted.delete(offerId);
  // Банк бетінен оралғанда пакет серверден бұрын қосылып қойған болуы мүмкін (мини апп қайта ашылады) — екінші рет қоспаймыз
  if (pre) { const same = packs.find((p) => p.serverId === pre.serverId); if (same) { buyExtra = {}; return same.id; } }
  // Мерзім — сервердегідей (ұсыныстың өз мерзімі: 30, 60 күн…), бұрын әрқашан 30 деп жазылатын
  const days = pre?.validUntil ? Math.max(0, Math.ceil((new Date(pre.validUntil).getTime() - Date.now()) / 86400000)) : 30;
  packs = [{ id, offerId, total: o.units, left: o.units, daysLeft: days, until: inDays(days), offPeak, ...(pre ? { serverId: pre.serverId, receiptId: pre.receiptId, receiptNo: pre.receiptNo } : {}),
    history: [{ emoji: "🛒", title: "Пакет сатып алынды", sub: `бүгін • ${pre?.label ?? methodLabel}`, right: `${o.units} бірлік` }] }, ...packs];
  emit();
  if (pre) { buyExtra = {}; return id; } // карта арқылы серверде төленіп қойған — қайта сатып алмаймыз
  // B2: серверде де сатып алынады (сынақ төлемі). Сәтті болса — пакетке сервер ID мен чек нөмірі жазылады.
  void buyOnServer(id, offerId, methodLabel);
  return id;
}

/** Сату лимиті (сервер 409 қайтарады): жергілікті алдын ала қосылған пакет алынады, клиентке себебі айтылады. Ақша алынбаған. */
export const limitText = (code?: string) => code === "sold_out" ? "Осы айдың пакеттері таусылып қалды. Келесі айдың 1-інде қайта ашылады — «Хабарла» басып қойсаң, бот хабарлайды. Ақша алынған жоқ."
  : code === "user_limit" ? "Бұл ұсыныстан осы айға шегіңе жеттің: мекеме бір адамға айына шектеулі пакет береді. Ақша алынған жоқ." : null;
function limitRefused(localId: string, e: unknown) {
  const t = limitText((e as { body?: { error?: string } }).body?.error);
  if (!t) return false;
  const offerId = packs.find((p) => p.id === localId)?.offerId;
  packs = packs.filter((p) => p.id !== localId); emit();
  void nativeAlert(t);
  // «Пакет сатып алынды» беті ашық тұрса — ұсыныс бетіне қайтамыз (онда «Таусылды» / шек көрінеді)
  if (offerId && location.hash.startsWith("#/success/")) location.replace("#/offer/" + offerId);
  return true;
}

export interface SrvPack { id: string; offerSlug: string; unitsTotal: number; unitsLeft: number; validUntil: string; status: string; receipt: { id: string; no: string } | null; extendLeft?: number; source?: string; autoRenew?: boolean; offPeak?: OffPeak | null; rated?: number | null; usedAt?: string | null }
async function buyOnServer(localId: string, offerSlug: string, methodLabel: string) {
  if (!(window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData) return; // браузерде — тек жергілікті
  try {
    const key = (crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now());
    const method = /kaspi/i.test(methodLabel) ? "kaspi" : "card";
    const useBonus = takeBonusNext();
    const extra = buyExtra; buyExtra = {};
    const j = await api<{ pack: SrvPack }>("/v1/purchases", { method: "POST", body: JSON.stringify({ offerSlug, method, methodLabel, idempotencyKey: key, ...(useBonus ? { useBonus } : {}), ...(extra.offPeak ? { offPeak: true } : {}) }) }, 12000);
    if (useBonus) void loadBonus(true);
    // Сервер пакетін синхрондау бұрын қосып қойса — жергілікті көшірмені алып тастаймыз (қосарланбасын)
    packs = packs.some((p) => p.serverId === j.pack.id && p.id !== localId) ? packs.filter((p) => p.id !== localId)
      : packs.map((p) => (p.id === localId ? { ...p, serverId: j.pack.id, receiptId: j.pack.receipt?.id, receiptNo: j.pack.receipt?.no } : p));
    emit();
  } catch (e) { limitRefused(localId, e); /* басқа қатеде (сервер жауап бермесе) — пакет жергілікті күйде қалады */ }
}

/** Сервердегі пакеттерді алып, жергілікті тізімде жоқтарын қосады (басқа құрылғыдан сатып алынғандар). */
export async function syncServerPacks() {
  try {
    const j = await api<{ packs: SrvPack[] }>("/v1/packs");
    const known = new Set(packs.map((p) => p.serverId).filter(Boolean));
    // Бұрыннан бар пакеттердің санын сервермен теңестіреміз (басқа құрылғыда не кассада өзгерсе)
    let changed = false;
    packs = packs.map((p) => {
      const x = j.packs.find((y) => y.id === p.serverId);
      if (!x || (x.unitsLeft === p.left && x.unitsTotal === p.total && x.extendLeft === p.extendLeft && Boolean(x.autoRenew) === Boolean(p.autoRenew) && (x.source === "gift") === Boolean(p.gifted))) return p;
      changed = true;
      return { ...p, left: x.unitsLeft, total: x.unitsTotal, expired: x.status === "expired", extendLeft: x.extendLeft, gifted: x.source === "gift", autoRenew: Boolean(x.autoRenew), offPeak: x.offPeak ?? null };
    });
    if (changed) emit();
    const add: Pack[] = j.packs.filter((x) => !known.has(x.id)).map((x) => {
      const days = Math.max(0, Math.ceil((new Date(x.validUntil).getTime() - Date.now()) / 86400000));
      return { id: "s" + x.id.slice(0, 8), offerId: x.offerSlug, total: x.unitsTotal, left: x.unitsLeft, daysLeft: days, until: inDays(days), expired: x.status === "expired",
        extendLeft: x.extendLeft, gifted: x.source === "gift", autoRenew: Boolean(x.autoRenew), offPeak: x.offPeak ?? null,
        serverId: x.id, receiptId: x.receipt?.id, receiptNo: x.receipt?.no, history: [{ emoji: "🛒", title: "Пакет сатып алынды", sub: "сервер", right: `${x.unitsTotal} бірлік` }] };
    });
    if (add.length) { packs = [...add, ...packs]; emit(); }
    // Бір сервер пакеті тізімде екі рет тұрса (қосарланған) — біреуін қалдырамыз
    const seen = new Set<string>();
    const uniq = packs.filter((p) => !p.serverId || (seen.has(p.serverId) ? false : (seen.add(p.serverId), true)));
    if (uniq.length !== packs.length) { packs = uniq; emit(); }
    // Бағалау күйі серверден (Патша, 2026-11-26): бағаланған пакет қайта сұралмайды; қолданылып, бағаланбағаны — «Бағала»
    for (const x of j.packs) {
      const local = packs.find((p) => p.serverId === x.id); if (!local) continue;
      if (x.rated) acts = acts.map((a) => (a.packId === local.id && a.action === "rate" ? { ...a, action: "rated", stars: x.rated! } : a));
      else if (x.usedAt && !acts.some((a) => a.packId === local.id && (a.action === "rate" || a.action === "rated"))) {
        const o = findOffer(x.offerSlug); const d = new Date(x.usedAt);
        acts = [{ id: "r" + x.id.slice(0, 8), emoji: o.kind === "hair" ? "✂️" : o.kind === "coffee" ? "☕" : "🍴", title: o.title.replace(/· \d+/, "· 1"), sub: `${o.venue} · ${d.getDate()} ${DAT_GEN[d.getMonth()]}`, packId: local.id, offerId: o.id, action: "rate" }, ...acts];
      }
    }
    applyRated(); emit();
  } catch { /* кірусіз не сервер жоқ */ }
}

/** B3: серверге жіберу көмекшісі — пакет серверде болса ғана; кілт қайталанған сұрауда екінші рет шегерілмеуі үшін. */
const newKey = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now());
const srvError = (e: unknown) => ((e as { body?: { error?: string } }).body?.error ?? "network");
/** Кассадағы QR арқылы бір бірлік (серверде). Қате болса — себебі (other_venue, no_units, not_medeo_qr, …). */
/** Жапсырмамен қолданғанда сервер «тірі растау» экранына уақыт пен мерзім береді */
export interface UseConfirm { at: string; until: string; venue: string; address: string }
export async function redeemOnServer(packId: string, qr: string, units = 1): Promise<{ ok: true; receiptId?: string; left?: number; confirm?: UseConfirm } | { ok: false; error: string; expectedUnits?: number; venue?: string; branches?: string[] } | null> {
  const p = getPack(packId); if (!p?.serverId || !qr) return null;
  try { const j = await api<{ receipt?: { id: string }; left?: number; confirm?: UseConfirm }>("/v1/redeem", { method: "POST", body: JSON.stringify({ packId: p.serverId, qr, units, idempotencyKey: newKey() }) }, 12000); return { ok: true, receiptId: j.receipt?.id, left: j.left, confirm: j.confirm }; }
  catch (e) { const b = (e as { body?: { error?: string; expectedUnits?: number; venue?: string; branches?: string[] } }).body; return { ok: false, error: b?.error ?? "network", expectedUnits: b?.expectedUnits, venue: b?.venue, branches: b?.branches }; }
}
/** QR-ды тану (сервер): мекеме, кассир енгізген дана, банк сомасы, мерзімі. Сервер жоқ болса — null. */
export interface QrInfo { kind: "dynamic" | "amount" | "static"; sticker?: boolean; venue: { slug: string; name: string }; offer?: { slug: string; title: string } | null; branch: { id: string; address: string }; units: number | null; amount: number | null; valid: boolean; expired: boolean }
export async function resolveQr(qr: string): Promise<QrInfo | { error: string } | null> {
  if (!qr) return null;
  try { return await api<QrInfo>("/v1/qr/resolve", { method: "POST", body: JSON.stringify({ qr }) }, 8000); }
  catch (e) { const st = (e as { status?: number }).status; return st && st < 500 && st !== 401 ? { error: srvError(e) } : null; }
}

/** Серверде шегерілген соң: жергілікті санды сервердің санына теңестіреді (Патша: «төлемнен кейін басқа сан шығады»). */
export function applyServerUse(packId: string, left: number, units: number) {
  const p = getPack(packId); if (!p) return;
  for (let i = 0; i < units; i++) redeemOne(packId);
  packs = packs.map((x) => (x.id === packId ? { ...x, left } : x));
  emit();
}

export function redeem(packId: string, n = 1): boolean {
  for (let i = 1; i < n; i++) redeemOne(packId);
  return redeemOne(packId);
}
function redeemOne(packId: string): boolean {
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

// ── 11 · Қайта алу және мерзімін ұзарту ─────────────────────────────────────
/** Мерзімі өткеннен кейін қалған бірлік осы күн ішінде ғана көшеді (Figma «Көшіру ережесі»). */
export const CARRY_DAYS = 3;
/** Жаңа пакетке көшетін бірлік: мерзімі өткеніне 3 күннен асса — 0. */
export const carryOf = (p: Pack) => (p.expired && (p.expiredAgo ?? 0) > CARRY_DAYS ? 0 : p.left);
/** Ұзарту нұсқалары: біріншісі — мекеменің бір реттік тегін мүмкіндігі. */
export const EXTEND_OPTIONS = [{ days: 7, price: 0 }, { days: 14, price: 1000 }, { days: 30, price: 2000 }];

/** Пакетті қайта алу: ескі пакеттің орнына жаңасы, қалған бірлік (ереже бойынша) қосылады. */
/** srv — карта төлемі серверде өтіп қойған болса (жаңа пакет): қайта сұрау жіберілмейді, тек байланыстырылады. */
export function rebuyPack(packId: string, paid: number, method = "Kaspi Pay", srv?: SrvPack): string | null {
  const old = getPack(packId);
  if (!old) return null;
  const o = offerOf(old);
  const carry = carryOf(old);
  const id = "p" + (Date.now() % 100000);
  const fresh: Pack = { id, offerId: o.id, total: o.units + carry, left: o.units + carry, daysLeft: 30, until: inDays(30), carried: carry,
    history: [
      { emoji: "🛒", title: "Пакет қайта алынды", sub: `бүгін • ${method} • ${fmt(paid)}`, right: `${o.units} бірлік` },
      ...(carry ? [{ emoji: "↪️", title: "Бұрынғы пакеттен көшті", sub: `${old.until.replace(" дейін", "")} мерзімінен`, right: `+${carry} бірлік` }] : []),
    ] };
  packs = [fresh, ...packs.filter((p) => p.id !== packId)];
  acts = acts.filter((a) => !(a.packId === packId && a.action === "renew"));
  emit();
  // B4: серверде қайта алу — ескі пакеттің қалғаны (3 күн ережесі) серверде есептеліп көшеді
  if (srv) { packs = packs.map((x) => (x.id === id ? { ...x, serverId: srv.id, total: srv.unitsTotal, left: srv.unitsLeft, receiptId: srv.receipt?.id, receiptNo: srv.receipt?.no } : x)); emit(); }
  else if (old.serverId) void api<{ pack: SrvPack }>("/v1/purchases", { method: "POST", body: JSON.stringify({ offerSlug: o.id, fromPackId: old.serverId, method: /kaspi/i.test(method) ? "kaspi" : "card", methodLabel: method, idempotencyKey: newKey() }) }, 12000)
    .then((j) => { packs = packs.map((x) => (x.id === id ? { ...x, serverId: j.pack.id, total: j.pack.unitsTotal, left: j.pack.unitsLeft, receiptId: j.pack.receipt?.id, receiptNo: j.pack.receipt?.no } : x)); emit(); }).catch((e) => { limitRefused(id, e); });
  return id;
}

/** Мерзімін ұзарту: days күнге; price 0 болса — бір реттік тегін мүмкіндік жұмсалады. */
/** paidOnServer — карта төлемі серверде ұзартуды жасап қойды: қайта сұрау жіберілмейді. */
export function extendPack(packId: string, days: number, price: number, paidOnServer = false): string | null {
  const p = getPack(packId);
  if (!p || p.noExtend) return null;
  const until = shiftUntil(p.until, days);
  packs = packs.map((x) => x.id !== packId ? x : { ...x, until, extendedTo: until, daysLeft: x.daysLeft + days, freeExtendUsed: x.freeExtendUsed || price === 0, extendLeft: x.extendLeft != null ? Math.max(0, x.extendLeft - days) : x.extendLeft,
    history: [{ emoji: "📅", title: "Мерзімі ұзартылды", sub: `бүгін • ${price ? fmt(price) : "тегін"}`, right: `+${days} күн` }, ...x.history] });
  emit();
  if (!paidOnServer && p.serverId && [7, 14, 30].includes(days)) void api("/v1/packs/" + p.serverId + "/extend", { method: "POST", body: JSON.stringify({ days, idempotencyKey: newKey() }) }).catch(() => undefined);
  return until;
}

// ── 12 · Бағалау ────────────────────────────────────────────────────────────
/** Бағалау жолағын (Пакеттерім) жабу — сессия ішінде қайта шықпайды. */
// Патша (2026-11-26): бір рет бағаласа — болды. Бағалар мен жабылған жолақтар телефонда сақталады (бұрын тек жадта еді,
// қосымша қайта ашылғанда «Бағала» қайта шығатын).
let rateHidden: string[] = [];
export const useRateHidden = () => useSyncExternalStore(subscribe, () => rateHidden);
export function hideRate(id: string) { rateHidden = [...rateHidden, id]; emit(); kv.set("medeo_rate_hidden", rateHidden.slice(-50).join(",")); }
/** Осы телефонда қойылған бағалар: әрекет id → жұлдыз */
let ratedLocal: Record<string, number> = {};
const applyRated = () => { acts = acts.map((a) => (a.action === "rate" && ratedLocal[a.id] ? { ...a, action: "rated", stars: ratedLocal[a.id] } : a)); };
void kv.get("medeo_rate_hidden").then((v) => { if (v) { rateHidden = v.split(","); emit(); } });
void kv.get("medeo_rated").then((v) => { try { if (v) { ratedLocal = JSON.parse(v); applyRated(); emit(); } } catch { /* бүлінген */ } });
/** Менің пікірлерім (осы телефонда): ұсыныс бетінде бірден көрінеді. Серверге жетпеген (үлгі) пакеттердікі де */
export interface MyReview { offerId: string; stars: number; tags: string[]; text: string; at: string; server: boolean }
let myReviews: MyReview[] = [];
export const useMyReviews = () => useSyncExternalStore(subscribe, () => myReviews);
void kv.get("medeo_my_reviews").then((v) => { try { if (v) { myReviews = JSON.parse(v); emit(); } } catch { /* бүлінген */ } });
export const getActivity = (id?: string) => acts.find((a) => a.id === id);
/** Пакетке қатысты бағаланбаған әрекет (жоқ болса — соңғы әрекеттің негізінде жаңасы жасалады). */
export function rateActivityOf(packId: string): Activity {
  const a = acts.find((x) => x.packId === packId && x.action === "rate");
  if (a) return a;
  const p = getPack(packId); const o = findOffer(p?.offerId);
  const fresh: Activity = { id: "a" + Date.now(), emoji: o.kind === "hair" ? "✂️" : o.kind === "coffee" ? "☕" : "🍴", title: o.title.replace(/· \d+/, "· 1"), sub: `${o.venue} · ${p?.history[0]?.sub.split(" • ")[0] ?? "бүгін"}`, packId, offerId: o.id, action: "rate" };
  acts = [fresh, ...acts]; emit();
  return fresh;
}
/** Баға жіберу: POST /v1/ratings. Нәтиже: ok — серверге жетті; local — пакет серверде жоқ (үлгі пакет), баға тек осы құрылғыда;
 *  error — сервер қабылдамады не желі жоқ (Патша, 2026-11-27: бұрын қате үнсіз жұтылып, «мекемеге жетті» деп көрсетілетін). */
export async function rateActivity(id: string, stars: number, tags: string[], text: string): Promise<{ result: "ok" | "local" | "error"; error?: string }> {
  const a = acts.find((x) => x.id === id);
  const p = a ? getPack(a.packId) : undefined;
  if (p?.serverId) {
    try {
      await api("/v1/ratings", { method: "POST", body: JSON.stringify({ packId: p.serverId, stars, tags: tags.slice(0, 8), text: text || undefined }) });
    } catch (e) {
      return { result: "error", error: srvError(e) };
    }
  }
  acts = acts.map((x) => (x.id === id ? { ...x, action: "rated", stars } : x));
  ratedLocal = { ...ratedLocal, [id]: stars }; kv.set("medeo_rated", JSON.stringify(Object.fromEntries(Object.entries(ratedLocal).slice(-100))));
  if (a) { myReviews = [{ offerId: a.offerId, stars, tags, text, at: new Date().toISOString(), server: Boolean(p?.serverId) }, ...myReviews].slice(0, 30); kv.set("medeo_my_reviews", JSON.stringify(myReviews)); }
  emit();
  return { result: p?.serverId ? "ok" : "local" };
}

export const unitLabel = (p: Pack) => fmt(unitPrice(offerOf(p)));

// ── Хабарландырулар ──────────────────────────────────────────────────────────
export interface Notice { id: string; title: string; sub: string; time: string; read: boolean; to?: string }
export interface NoticePrefs { expiry: boolean; rating: boolean; offers: boolean; promo: boolean }
let notices: Notice[] = [
  { id: "n0", title: "Ерлан Серіков сыйлығыңды қабылдады!", sub: "Латте · 15 стақан енді оның Пакеттерінде", time: "13:42", read: false, to: "/profile/gift/g2" },
  { id: "n1", title: "Тауық донерінің мерзімі 2 күнде бітеді", sub: "Қайта алсаң, қалған бірлік келесі айға көшеді", time: "13:20", read: false },
  { id: "n2", title: "Coffee Lab-та жаңа ұсыныс", sub: "Латте · 15 стақан, −14%", time: "Кеше", read: false },
];
let prefs: NoticePrefs = { expiry: true, rating: true, offers: true, promo: false };
let unread = 3;
const count = () => { unread = notices.filter((n) => !n.read).length; };
export const useNotices = () => useSyncExternalStore(subscribe, () => notices);
export const useNoticePrefs = () => useSyncExternalStore(subscribe, () => prefs);
export const useUnread = () => useSyncExternalStore(subscribe, () => unread);
export function readNotice(id: string) {
  notices = notices.map((n) => (n.id === id ? { ...n, read: true } : n)); count(); emit();
  kv.set("medeo_read", notices.filter((n) => n.read).map((n) => n.id).join(","));
}
export function setNoticePref(k: keyof NoticePrefs, v: boolean) {
  prefs = { ...prefs, [k]: v }; emit(); kv.set("medeo_notice_prefs", JSON.stringify(prefs));
  // Серверге де: бот хабарламалары (мысалы, мерзім ескертуі) осы баптауға қарайды
  void api("/v1/me", { method: "PATCH", body: JSON.stringify({ notify: { [k]: v } }) }).catch(() => null);
}
void kv.get("medeo_notice_prefs").then((v) => { if (v) { try { prefs = { ...prefs, ...JSON.parse(v) }; emit(); } catch { /* бұзылған мән */ } } });
void kv.get("medeo_read").then((v) => { if (v) { const ids = v.split(","); notices = notices.map((n) => ({ ...n, read: ids.includes(n.id) })); count(); emit(); } });

// ── Баптаулар: қауіпсіздік, тіл, қала ───────────────────────────────────────
export interface Settings { lock: boolean; bio: boolean; autolock: string; onCard: boolean; onMethods: boolean; onOpen: boolean; lang: "tg" | "kk" | "ru"; astanaNotify: boolean; geo: "unknown" | "granted" | "denied"; /** Стикер мен эмодзи анимациялары (Патша, 2026-11-21) */ motion: boolean; /** Карточка белгілері: анимациялық эмодзи не иконка */ badgeStyle: "emoji" | "icon" }
let settings: Settings = { lock: false, bio: false, autolock: "1", onCard: true, onMethods: true, onOpen: true, lang: "tg", astanaNotify: false, geo: "unknown", motion: true, badgeStyle: "emoji" };
export const useSettings = () => useSyncExternalStore(subscribe, () => settings);
export const getSettings = () => settings;
export function setSettings(patch: Partial<Settings>) { settings = { ...settings, ...patch }; emit(); kv.set("medeo_settings", JSON.stringify(settings)); }
void kv.get("medeo_settings").then((v) => { if (v) { try { settings = { ...settings, ...JSON.parse(v) }; emit(); if (settings.lang !== getPref()) applyLangPref(settings.lang); } catch { /* бұзылған мән */ } } });

// ── Таңдаулы ────────────────────────────────────────────────────────────────
let favs: string[] = ["doner", "burger", "cappuccino"];
let restock: string[] = [];
export const useFavs = () => useSyncExternalStore(subscribe, () => favs);
export const useRestock = () => useSyncExternalStore(subscribe, () => restock);
export function toggleFav(id: string) { favs = favs.includes(id) ? favs.filter((x) => x !== id) : [id, ...favs]; emit(); kv.set("medeo_favs", favs.join(",")); }
/** «Қайта шыққанда хабарла»: серверге жазылады (ұсыныс қайта сатылымға шыққанда бот хабарлайды). Сервер жоқ болса — тек осы құрылғыда. */
export function toggleRestock(id: string) {
  const on = !restock.includes(id);
  restock = on ? [...restock, id] : restock.filter((x) => x !== id); emit();
  api(`/v1/offers/${encodeURIComponent(id)}/wait`, { method: "POST", body: JSON.stringify({ on }) }).catch(() => null);
}
export async function loadWaits() { try { const j = await api<{ slugs: string[] }>("/v1/waits"); restock = j.slugs ?? []; emit(); } catch { /* бэкенд жоқ */ } }
void kv.get("medeo_favs").then((v) => { if (v !== null) { favs = v ? v.split(",") : []; emit(); } });

// ── Төлем тәсілдері ─────────────────────────────────────────────────────────
export interface PayMethod { id: string; emoji: string; title: string; sub: string; card: boolean; /** серверде сақталған карта */ cardId?: string; /** бір реттік карта (сақталмаған): провайдер криптограммасы */ cryptogram?: string;
  /** Банктің қорғалған беті (Halyk ePay т.б.): карта сонда енгізіледі, біз оны көрмейміз */ hosted?: string;
  /** «Halyk арқылы төлеу»: Homebank қосымшасында растау (QR), карта енгізілмейді */ qr?: boolean;
  /** Банк логотипі (Патша, 2026-11-24): Kaspi Pay, Halyk — ресми белгілер; карталарда — карта иконкасы */ logo?: "kaspi" | "halyk";
  /** Бөліп төлеу (Halyk беті, рассрочка қойындысы ашық) */ installment?: boolean }
let methods: PayMethod[] = [
  { id: "kaspi", emoji: "🏦", title: "Kaspi Pay", sub: "Kaspi.kz-ке шот келеді", card: false, logo: "kaspi" },
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
export function setKaspiPhone(v: string) { kaspiPhone = v; emit(); kv.set("medeo_kaspi_phone", v); }
void kv.get("medeo_kaspi_phone").then((v) => { if (v) { kaspiPhone = v; emit(); } });
export function removeMethod(id: string) {
  const m = methods.find((x) => x.id === id);
  methods = methods.filter((x) => x.id !== id); if (defaultMethod === id) defaultMethod = "kaspi"; emit();
  if (m?.cardId) void api(`/v1/cards/${m.cardId}/remove`, { method: "POST" }).catch(() => null);
}
/** Сервердегі сақталған карталар (карта деректері емес — тек бренд, соңғы 4 цифр, мерзім) */
export async function loadCards() {
  try {
    const [j, conf] = await Promise.all([
      api<{ cards: { id: string; brand: string; last4: string; exp: string }[] }>("/v1/cards"),
      api<{ hosted: { id: string; test: boolean; qr?: boolean }[]; live?: boolean }>("/v1/payments/config").catch(() => ({ hosted: [] as { id: string; test: boolean; qr?: boolean }[], live: false })),
    ]);
    const once = methods.filter((m) => m.cryptogram);
    // Банк беті арқылы төлем (2026-11-18: Halyk ePay, әзірге банктің сынақ ортасы — нақты карта өтпейді, тек сынақ карталары)
    const hosted: PayMethod[] = conf.hosted.map((h) => ({ id: "hosted:" + h.id, emoji: "💳", title: h.test ? "Банк картасы (сынақ)" : "Банк картасы", sub: h.test ? "Тек сынақ карталары" : "Кез келген банк картасы", card: true, hosted: h.id }));
    // «Halyk арқылы төлеу» (2026-11-24, 21-құжат): сервер HALYK_QR=on десе ғана — Homebank ашылады, клиент бір рет растайды
    const viaApp: PayMethod[] = conf.hosted.filter((h) => h.qr).map((h) => ({ id: "qr:" + h.id, emoji: "v:bank", title: h.test ? "Halyk (сынақ)" : "Halyk", sub: "Homebank-те растайсыз", card: true, hosted: h.id, qr: true, logo: "halyk" as const }));
    // Нақты режимде (PAYMENTS_MODE=live) Kaspi Pay жолы серверде жабық, Halyk ePay оны өңдемейді — тізімде көрсетпейміз (адастырмау үшін, 2026-11-27)
    const kaspi = conf.live ? [] : methods.filter((m) => m.id === "kaspi");
    methods = [...kaspi, ...viaApp, ...hosted, ...j.cards.map((c) => ({ id: "card:" + c.id, emoji: "💳", title: `${c.brand} •• ${c.last4}`, sub: c.exp ? `Жарамдылық мерзімі ${c.exp}` : "Сақталған карта", card: true, cardId: c.id })), ...once];
    if (!methods.some((m) => m.id === defaultMethod)) defaultMethod = methods[0]?.id ?? "kaspi";
    emit();
  } catch { /* сервер жоқ — үлгі карталар қалады */ }
}
/** Карта арқылы серверде сатып алынған пакет: Success беті buyPack-та екінші рет сатып алмай, осыны қолданады */
const adopted = new Map<string, { serverId: string; receiptId?: string; receiptNo?: string; label: string; validUntil?: string }>();
export function adoptPurchase(offerId: string, p: { id: string; receipt: { id: string; no: string } | null; validUntil?: string }, label: string) { adopted.set(offerId, { serverId: p.id, receiptId: p.receipt?.id, receiptNo: p.receipt?.no, label, validUntil: p.validUntil }); }

// ── PIN ─────────────────────────────────────────────────────────────────────
// Ескерту: нағыз жүйеде PIN серверде тексеріледі. Бэкенд қосылғанша құрылғыда тек хэші сақталады (кодтың өзі емес).
// Тұз «jazl+pin:» ӘДЕЙІ өзгертілмейді (Medeo. атауына ауысқанда): ескі ботта қойылған PIN-дер жарамды қалуы үшін. Пайдаланушыға көрінбейді.
const pinHash = (v: string) => { let h = 2166136261; for (const c of "jazl+pin:" + v) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
let pin: string | null = null;
export const hasPin = () => pin !== null;
export const checkPin = (v: string) => pin === pinHash(v);
export function savePin(v: string, old?: string) {
  pin = pinHash(v); kv.set("medeo_pin_h", pin);
  // Аудит 2026-11-21: PIN серверде де (scrypt хэш) — бірлік жұмсауды сервер өзі тексереді
  void api<{ pinToken?: string }>("/v1/me/pin", { method: "POST", body: JSON.stringify(old ? { pin: v, old } : { pin: v }) })
    .then((r) => { if (r.pinToken) { pinTok.v = r.pinToken; pinTok.exp = Date.now() + 9 * 60_000; void enrollBio(); } })
    .catch((e: { body?: { error?: string } }) => { if (e?.body?.error === "old_required" && !old) void pinServer(v); });
}
/** PIN-ді алып тастау (құлыпты өшіргенде; PIN-мен расталады) — құрылғыда да, серверде де */
export async function removePin(v: string): Promise<void> {
  pin = null; kv.set("medeo_pin_h", ""); pinTok.v = ""; bioEnrolled = false;
  try { await api("/v1/me/pin", { method: "DELETE", body: JSON.stringify({ pin: v }) }); } catch { /* */ }
}
/** PIN дұрыс енгізілген соң: серверден 10 минуттық токен (сервер PIN-ді білмесе — тіркейді). Офлайнда/мокта — үнсіз. */
export async function pinServer(v: string): Promise<void> {
  try {
    const r = await api<{ pinToken: string }>("/v1/me/pin/verify", { method: "POST", body: JSON.stringify({ pin: v }) });
    pinTok.v = r.pinToken; pinTok.exp = Date.now() + 9 * 60_000; void enrollBio();
  } catch (e) {
    const err = (e as { body?: { error?: string } })?.body?.error;
    if (err === "no_pin") { try { const r = await api<{ pinToken: string }>("/v1/me/pin", { method: "POST", body: JSON.stringify({ pin: v }) }); pinTok.v = r.pinToken; pinTok.exp = Date.now() + 9 * 60_000; void enrollBio(); } catch { /* */ } }
  }
}
/** Биометрия қосулы болса: серверден құпия алып, BiometricManager-ге жазу (бір рет) */
let bioEnrolled = false;
async function enrollBio() {
  if (bioEnrolled || !settings.bio || !pinTok.v) return;
  try { const r = await api<{ bio: string }>("/v1/me/pin/bio", { method: "POST", body: "{}" }); saveBioToken(r.bio); bioEnrolled = true; } catch { /* */ }
}
/** Биометриямен расталса: құрылғыдағы құпия → сервер токені */
export async function pinServerBio(): Promise<void> {
  const t = takeBioToken(); if (!t) return;
  try { const r = await api<{ pinToken: string }>("/v1/me/pin/verify", { method: "POST", body: JSON.stringify({ bio: t }) }); pinTok.v = r.pinToken; pinTok.exp = Date.now() + 9 * 60_000; } catch { /* */ }
}
// Сервер «PIN керек» десе — келесі жұмсауда PIN қайта сұралады
window.addEventListener("medeo:pin", () => { pinOkUntil = 0; });

// ── Экран құлпы (Figma 17 «PIN / 3 Қолданба құлыпталған») ──────────────────
// Қолданба ашылғанда (баптауда «Қолданбаны ашқанда» қосулы болса) және фонда «Автоқұлып» уақытынан
// ұзақ тұрса құлыпталады. Демо: ?lock=1 (PIN қойылмаған болса, демо коды 1111).
let locked = false;
export const useLocked = () => useSyncExternalStore(subscribe, () => locked);
/** PIN сканерлеу алдында сұралады (Патша, 2026-11-17); расталған соң 3 минут бойы төлемде қайта сұралмайды. */
let pinOkUntil = 0;
export const markPinOk = () => { pinOkUntil = Date.now() + 5 * 60_000; };
export const pinFresh = () => Date.now() < pinOkUntil;
export function unlockApp() { locked = false; emit(); }
// Патша (2026-11-17): ашқандағы құлып алынды — растау тек бірлік жұмсағанда (scanFlow.confirmSpend). Демо: #…lock=1
const lockOn = () => false;
void Promise.all([kv.get("medeo_pin_h"), kv.get("medeo_settings")]).then(([h, st]) => {
  if (h) pin = h;
  if (st) { try { settings = { ...settings, ...JSON.parse(st) }; } catch { /* бұзылған мән */ } }
  if (window.location.hash.includes("lock=1")) { if (!pin) pin = pinHash("1111"); locked = true; }
  else if (lockOn()) locked = true;
  emit();
});
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && lockOn() && Date.now() - hiddenAt >= Number(settings.autolock) * 60_000) { locked = true; emit(); }
});

// ── Сыйлықтар ───────────────────────────────────────────────────────────────
export type GiftStatus = "wait" | "ok" | "expired" | "open" | "cancelled";
export interface Gift { id: string; dir: "sent" | "got"; name: string; color: string; pack: string; emoji: string; venue: string; status: GiftStatus; label: string; sentAt: string; until: string;
  /** Figma «13 · Сыйлау»: ұсыныс, құттықтау, жіберуші атын жасырды ма, алушының @username-і. */
  offerId?: string; msg?: string; anon?: boolean; username?: string; acceptedAt?: string;
  /** B4: сервердегі сыйлық коды (сілтеме t.me/<бот>?startapp=gift_<code>) */
  code?: string;
  /** Сыйлық басқа нақты адамға (@username) арналған */
  notForMe?: boolean; toUsername?: string }
let gifts: Gift[] = [
  { id: "g1", dir: "sent", name: "Айгерім Нұрланова", color: "#e25a7a", pack: "Тауық донері · 4 дана", emoji: "🍔", venue: "Dämdi Doner", status: "wait", label: "Күтілуде · 5 күн", sentAt: "8 қараша, 13:20", until: "15 қараша" },
  { id: "g2", dir: "sent", name: "Ерлан Серіков", color: "#4378ff", pack: "Латте · 15 стақан", emoji: "☕", venue: "Brew Point", status: "ok", label: "Қабылданды", sentAt: "5 қараша, 09:40", until: "12 қараша", offerId: "latte", acceptedAt: "5 қараша, 13:42", msg: kk("Таңғы кофе менен ☕") },
  { id: "g3", dir: "sent", name: "Дана Әбілова", color: "#fe9500", pack: "Шаш қию · 4 рет", emoji: "✂️", venue: "Qala Barber", status: "expired", label: "Мерзімі өтті", sentAt: "1 қараша, 11:05", until: "8 қараша" },
  { id: "g4", dir: "got", name: "Берік Нұрлан", color: "#31d158", pack: "Бургер комбо · 4 дана", emoji: "🍔", venue: "Bahandi", status: "open", label: "Ашу", sentAt: "12 қараша, 18:02", until: "19 қараша", offerId: "burger-combo", msg: kk("Туған күніңмен! Бургер менің атымнан 🎉") },
  { id: "g5", dir: "got", name: "Мадина Ж.", color: "#b00fb4", pack: "Кофе · 10 стақан", emoji: "☕", venue: "Coffee Lab", status: "ok", label: "Қабылданды", sentAt: "2 қараша, 14:30", until: "9 қараша", acceptedAt: "2 қараша, 15:05", msg: kk("Жұмысың жеңіл болсын! ☕") },
];
export const useGifts = () => useSyncExternalStore(subscribe, () => gifts);
const nowLabel = () => { const d = new Date(); return `${d.getDate()} ${["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"][d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** Сыйлық жіберу (төлем өткен соң). Алушыны Telegram-ның нативті чат/контакт тізімінен таңдайды,
 *  сондықтан оның аты сыйлықты қабылдаған соң ғана белгілі болады (бэкенд/бот хабарлайды). */
const giftReady = new Map<string, Promise<string | null>>();
/** Сыйлық серверде жасалып болғанша күтеді (сілтеме сервердегі кодпен болуы үшін). Сервер жоқ болса — null. */
export const waitGift = (id: string) => giftReady.get(id) ?? Promise.resolve(null);
/** srvCode — карта төлемі серверде сыйлықты жасап қойды: код бірден қолданылады. */
export function sendGift(offerId: string, msg: string, anon: boolean, toUsername?: string, srvCode?: string, days = 7, units?: number): string {
  const o0 = findOffer(offerId);
  const z = units ? o0.sizes?.find((x) => x.units === units) : undefined;
  const o = z ? { ...o0, title: o0.title.replace(/· \d+ /, `· ${z.units} `) } : o0;
  const id = "g" + (Date.now() % 100000) + (srvCode ? "-" + srvCode.slice(0, 4) : "");
  const until = new Date(Date.now() + days * 864e5);
  gifts = [{ id, dir: "sent", color: "#229af0", pack: o.title, emoji: o.kind === "coffee" ? "☕" : o.kind === "hair" ? "✂️" : "🍔", venue: o.venue,
    status: "wait", label: `Күтілуде · ${days} күн`, sentAt: nowLabel(), until: untilText(until).replace("ға дейін", "").replace("ге дейін", "").replace("ке дейін", ""), offerId, msg, anon, toUsername, name: toUsername ? "@" + toUsername : "Telegram арқылы" }, ...gifts];
  emit();
  // B4: сыйлық серверде сатып алынады (пакет алушы қабылдағанша «сыйлықта» тұрады), код — сілтеме үшін
  const hasTg = Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);
  if (srvCode) { gifts = gifts.map((g) => (g.id === id ? { ...g, code: srvCode } : g)); emit(); giftReady.set(id, Promise.resolve(srvCode)); }
  else if (hasTg) giftReady.set(id, api<{ gift: { code: string } }>("/v1/purchases", { method: "POST", body: JSON.stringify({ offerSlug: offerId, ...(z ? { units: z.units } : {}), gift: { message: msg || undefined, anonymous: anon, toUsername: toUsername || undefined }, idempotencyKey: newKey() }) }, 12000)
    .then((j) => { gifts = gifts.map((g) => (g.id === id ? { ...g, code: j.gift.code } : g)); emit(); return j.gift.code; })
    .catch((e) => { // сату лимиті: сыйлық жасалмады — тізімнен алынады, себебі айтылады (ақша алынбаған)
      const t = limitText((e as { body?: { error?: string } }).body?.error);
      if (t) { gifts = gifts.filter((g) => g.id !== id); emit(); void nativeAlert(t); }
      return null;
    }));
  return id;
}

/** Корпоративтік сыйлық (Патша, 2026-11-18): бір төлеммен 2–50 адамға. codes — карта төлемінде сервер қайтарған кодтар;
 *  жоқ болса (Kaspi, сынақ) — сервердің өзінен сатып алынады. Әр код «Сыйлықтарым» тізіміне жеке жол болып қосылады. Қайтарады: сілтемелер. */
export async function sendGiftsBulk(offerId: string, count: number, msg: string, anon: boolean, codes?: string[], methodLabel = "Kaspi Pay", units?: number): Promise<string[]> {
  let list = codes;
  if (!list?.length) {
    try {
      const j = await api<{ gifts?: { code: string }[]; gift?: { code: string } }>("/v1/purchases", { method: "POST", body: JSON.stringify({ offerSlug: offerId, ...(units ? { units } : {}), method: /kaspi/i.test(methodLabel) ? "kaspi" : "test", methodLabel,
        gift: { message: msg || undefined, anonymous: anon, count }, idempotencyKey: newKey() }) }, 20000);
      list = (j.gifts ?? (j.gift ? [j.gift] : [])).map((x) => x.code);
    } catch (e) {
      const b = (e as { body?: { error?: string; left?: number } }).body;
      const t = limitText(b?.error);
      if (t) void nativeAlert(b?.error === "sold_out" && b.left ? `Осы айға тек ${b.left} пакет қалды — сыйлық санын азайтыңыз. Ақша алынған жоқ.` : t);
      return [];
    }
  }
  for (const code of list) sendGift(offerId, msg, anon, undefined, code, 30, units);
  return list.map((c) => appLink("gift", c));
}

/** Сервердегі сыйлықты кодпен ашу (сілтемеден келгенде): жергілікті тізімге қосады. */
export async function loadServerGift(code: string): Promise<Gift | null> {
  try {
    const j = await api<{ gift: { code: string; status: string; title: string; offerSlug: string; venue: string; from: string | null; message: string | null; expiresAt: string; mine: boolean; forMe: boolean; toUsername: string | null } }>("/v1/gifts/" + code);
    const x = j.gift; const o = findOffer(x.offerSlug);
    const st: GiftStatus = x.status === "sent" ? (x.mine ? "wait" : "open") : x.status === "accepted" ? "ok" : x.status === "cancelled" ? "cancelled" : "expired";
    const g: Gift = { id: code, code, dir: x.mine ? "sent" : "got", name: x.from ?? "Аноним", color: "#229af0", pack: x.title, emoji: o.kind === "coffee" ? "☕" : o.kind === "hair" ? "✂️" : "🍔", venue: x.venue,
      status: st, label: st === "open" ? "Сыйлық" : st, sentAt: "", until: untilText(new Date(x.expiresAt)), offerId: x.offerSlug, msg: x.message ?? undefined, anon: !x.from, notForMe: !x.mine && !x.forMe, toUsername: x.toUsername ?? undefined };
    gifts = [g, ...gifts.filter((y) => y.id !== code)]; emit();
    return g;
  } catch { return null; }
}
/** Сервердегі сыйлықты қабылдау: пакет алушыға өтеді (мерзімі қабылдаған сәттен). Жергілікті пакет ID-ін қайтарады. */
export async function acceptServerGift(code: string): Promise<string | null> {
  try {
    const j = await api<{ packId: string }>(`/v1/gifts/${code}/accept`, { method: "POST" }, 12000);
    gifts = gifts.map((g) => (g.code === code ? { ...g, status: "ok", label: "Қабылданды" } : g));
    await syncServerPacks();
    return packs.find((p) => p.serverId === j.packId)?.id ?? null;
  } catch { return null; }
}
/** Сыйлық сілтемесі: бот орнатылса — t.me/<бот>/<app>?startapp=gift_<id>, әйтпесе Mini App мекенжайы. */
export const giftLink = (id: string) => appLink("gift", gifts.find((g) => g.id === id)?.code ?? id);
/** Ботқа апаратын сілтеме: t.me/Mmedeo_bot?startapp=<түр>_<id>; бот жоқ болса — сайт мекенжайы. */
export const appLink = (kind: "gift" | "venue" | "offer", id: string) =>
  BOT_APP_LINK ? `${BOT_APP_LINK}?startapp=${kind}_${id}` : `${SITE_URL}/#/${kind === "gift" ? "gift/open" : kind}/${id}`;
/** Бот хабарламаны дайындайды (savePreparedInlineMessage) → WebApp.shareMessage үшін id. Бэкенд жоқ болса — null. */
export async function prepareGift(id: string): Promise<string | null> {
  if (!API_URL) return null;
  try { const r = await apiFetch(`/gifts/${id}/prepared-message`, { method: "POST" }); return r.ok ? ((await r.json()) as { id?: string }).id ?? null : null; } catch { return null; }
}
/** Алынған сыйлықты қабылдау: пакет Пакеттерімге қосылады. */
export function acceptGift(id: string): string | null {
  const g = gifts.find((x) => x.id === id);
  if (!g || g.status !== "open" || g.dir === "sent") return null;
  const pid = buyPack(g.offerId ?? "doner");
  packs = packs.map((p) => (p.id === pid ? { ...p, history: [{ emoji: "🎁", title: "Сыйлық қабылданды", sub: `бүгін • ${g.anon ? "Аноним" : g.name}`, right: `${p.total} бірлік` }] } : p));
  gifts = gifts.map((x) => (x.id === id ? { ...x, status: "ok", label: "Қабылданды" } : x));
  emit();
  return pid;
}
export function setGiftStatus(id: string, status: GiftStatus, label: string) { gifts = gifts.map((g) => (g.id === id ? { ...g, status, label } : g)); emit(); }

// ── Соңғы іздеулер ──────────────────────────────────────────────────────────
let recent: string[] = ["донер", "латте", "шаш қию"];
export const useRecent = () => useSyncExternalStore(subscribe, () => recent);
const saveRecent = () => kv.set("medeo_recent", JSON.stringify(recent));
export function addRecent(q: string) { const v = q.trim().toLowerCase(); if (!v) return; recent = [v, ...recent.filter((x) => x !== v)].slice(0, 5); emit(); saveRecent(); }
export function removeRecent(q: string) { recent = recent.filter((x) => x !== q); emit(); saveRecent(); }
export function clearRecent() { recent = []; emit(); saveRecent(); }
void kv.get("medeo_recent").then((v) => { if (v) { try { recent = JSON.parse(v); emit(); } catch { /* бұзылған мән */ } } });

// ── Алғашқы кіру ────────────────────────────────────────────────────────────
// null — әлі оқылып жатыр (бастапқы экран көрсетіледі), false — таныстыру керек, true — өткен.
let onboarded: boolean | null = null; // null — әлі белгісіз (бос фон)
export const useOnboarded = () => useSyncExternalStore(subscribe, () => onboarded);
/** «Деректерді жою» (Figma 18): құрылғыдағы барлық Medeo деректерін тазартып, онбордингке қайтарады.
 *  Бэкенд қосылғанда: DELETE /me (аккаунт пен пакеттер серверде жойылады). */
export function resetAll() {
  for (const n of ["onboarded", "settings", "pin_h", "favs", "kaspi_phone", "notice_prefs", "read", "bot_ok", "nav_hints", "packs_hint", "recent", "soon"]) { kv.set("medeo_" + n, ""); kv.set("jazl_" + n, ""); } // ескі (Medeo.-ға дейінгі) кілттер де
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("medeo_") || k.startsWith("jazl_")) localStorage.removeItem(k); } catch { /* жеке режим */ }
  window.location.replace(window.location.pathname + "#/welcome");
  setTimeout(() => window.location.reload(), 50);
}
export function finishOnboarding() { onboarded = true; emit(); kv.set("medeo_onboarded", "1"); }
// Ашылу жылдамдығы (2026-11-18): бұрын әр ашқанда кемінде 500 мс + Telegram бұлтының (CloudStorage) жауабы күтілетін — экран бос тұратын.
// Енді белгі құрылғы жадында да сақталады (kv.set көшірмесі): тіркелген клиент бірден басты бетті көреді, бұлт жауабы фонда тексеріледі.
{
  let local = false;
  try { local = localStorage.getItem("medeo_onboarded") === "1"; } catch { /* жеке режим */ }
  if (local) onboarded = true;
  void kv.get("medeo_onboarded").then((v) => {
    if (v === "1") { try { localStorage.setItem("medeo_onboarded", "1"); } catch { /* жеке режим */ } }
    const next = v === "1" || local;
    if (next !== onboarded) { onboarded = next; emit(); }
  });
}

// ── «Жуырда» санаттарына жазылу ─────────────────────────────────────────────
let venueSubs: string[] = [];
export const useVenueSubs = () => useSyncExternalStore(subscribe, () => venueSubs);
export function toggleVenueSub(id: string) { venueSubs = venueSubs.includes(id) ? venueSubs.filter((x) => x !== id) : [...venueSubs, id]; emit(); }
let soonSubs: number[] = [];
export const useSoon = () => useSyncExternalStore(subscribe, () => soonSubs);
export function toggleSoon(pct: number) { soonSubs = soonSubs.includes(pct) ? soonSubs.filter((x) => x !== pct) : [...soonSubs, pct]; emit(); kv.set("medeo_soon", soonSubs.join(",")); }
void kv.get("medeo_soon").then((v) => { if (v) { soonSubs = v.split(",").map(Number); emit(); } });

// ── Алдын ала тапсырыс ──────────────────────────────────────────────────────
// Пакет бұрын төленген, сондықтан тапсырыс кезінде ешқандай шот/карта төлемі жоқ:
// пакеттен 1 бірлік шегеріледі. Тапсырыс мекемеге жетпесе, бірлік қайтарылады.
export interface Branch { id: string; address: string; hours: string; km: number; open: boolean }
export interface Order { id: string; no: number; packId: string; title: string; venue: string; emoji: string; branch: string; time: string; code: string; status: "sent" | "done"; created: string; serverId?: string }
const branchesOf: Record<string, Branch[]> = {
  "Dämdi Doner": [
    { id: "b1", address: "Нұркен Әбдіров, 24", hours: "09:00–22:00", km: 1.2, open: true },
    { id: "b2", address: "Мәңгілік Ел, 28", hours: "10:00–22:00", km: 3.4, open: true },
    { id: "b3", address: "Бухар-Жырау, 52", hours: "10:00–22:00", km: 4.1, open: false },
  ],
};
export const branches = (venue: string, address: string): Branch[] => branchesOf[venue] ?? [{ id: "b1", address, hours: "09:00–22:00", km: 1.2, open: venues.find((v) => v.name === venue)?.status !== "closed" }];
let orders: Order[] = [
  { id: "o104", no: 104, packId: "p3", title: "Бургер комбо · 1 бірлік", venue: "Bahandi", emoji: "🍔", branch: "Бұқар жырау 59", time: "14:00", code: "3071", status: "sent", created: "бүгін, 12:40" },
];
let orderNo = 105;
export const useOrders = () => useSyncExternalStore(subscribe, () => orders);
export const getOrder = (id?: string) => orders.find((o) => o.id === id);
/** branchId — сервердегі филиал (клиент таңдаған; бұрын жіберілмей, сервер мекеменің бірінші филиалын алатын) */
export function placeOrder(packId: string, branch: string, time: string, branchId?: string): Order | null {
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
  // B3: серверде тапсырыс — нөмір мен код серверден келеді (кассир соны тексереді)
  if (p.serverId) void api<{ order: { id: string; no: number; code: string } }>("/v1/orders", { method: "POST", body: JSON.stringify({ packId: p.serverId, type: "now", ...(branchId ? { branchId } : {}), idempotencyKey: newKey() }) }, 12000)
    .then((j) => { orders = orders.map((x) => (x.id === order.id ? { ...x, serverId: j.order.id, no: j.order.no, code: j.order.code } : x)); emit(); }).catch(() => undefined);
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

// ── Шаштараз: жазылу (Figma «22 · Шаштараз: жазылу») ──────────────────────
// Жазылу расталғанда пакеттен 1 рет брондалады. 2 сағаттан ертерек бас тартса — қайтарылады;
// кеш бас тартса не келмесе — жұмсалады. Бэкенд қосылғанда: POST /bookings, PATCH /bookings/:id.
export interface Booking { id: string; packId: string; venue: string; service: string; master?: string; at: number; status: "ok" | "cancelled" | "missed"; serverId?: string; code?: string; address?: string }
export const FREE_CANCEL_MS = 2 * 3600_000;
const kkMonths = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
export const dayStart = (off: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime(); };
export const atOf = (off: number, hm: string) => { const [h, m] = hm.split(":").map(Number); const d = new Date(dayStart(off)); d.setHours(h, m); return d.getTime(); };
export function dayWord(off: number, short = false) {
  if (off === 0) return "Бүгін"; if (off === 1) return "Ертең";
  const d = new Date(dayStart(off)); return `${d.getDate()} ${short ? kkMonths[d.getMonth()].slice(0, 3) + "." : kkMonths[d.getMonth()]}`;
}
export function bookLabel(at: number) {
  const off = Math.round((dayStart(0) - new Date(at).setHours(0, 0, 0, 0)) / -86400000);
  const d = new Date(at); return `${dayWord(off)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
let bookings: Booking[] = [
  { id: "bk1", packId: "p2", venue: "Qala Barber", service: "Шаш қию", at: atOf(1, "14:00"), status: "ok" },
  { id: "bk2", packId: "p2", venue: "Qala Barber", service: "Шаш + сақал", master: "Дана", at: atOf(4, "11:00"), status: "ok" },
  // Тамаққа да жоспарлау бар (Патша, 2026-11-16): пакеттен бір бірлік белгіленген күні мен уақытқа дайындалады
  { id: "bk3", packId: "p1", venue: "Dämdi Doner", service: "Тауық донері", at: atOf(1, "13:00"), status: "ok" },
  { id: "bk4", packId: "p1", venue: "Dämdi Doner", service: "Тауық донері", at: atOf(6, "19:00"), status: "ok" },
];
let bookNo = 5;
export const useBookings = () => useSyncExternalStore(subscribe, () => bookings);
export const getBooking = (id?: string) => bookings.find((b) => b.id === id);
export const freeCancel = (b: Booking) => b.at - Date.now() > FREE_CANCEL_MS;
export function book(packId: string, at: number, branch?: { id?: string; address: string }): Booking | null {
  const p = getPack(packId);
  if (!p || p.left < 1) return null;
  const o = offerOf(p);
  const b: Booking = { id: "bk" + bookNo++, packId, venue: o.venue, service: o.title.split(" · ")[0], at, status: "ok", address: branch?.address };
  bookings = [...bookings, b].sort((x, y) => x.at - y.at);
  packs = packs.map((x) => x.id !== packId ? x : { ...x, left: x.left - 1,
    history: [{ emoji: "📅", title: `${o.kind === "hair" ? "Жазылу" : "Жоспар"}: ${bookLabel(at)}`, sub: `${branch?.address ?? o.venue} • расталды`, right: `Қалды: ${x.left - 1}` }, ...x.history] });
  emit();
  // B3: серверде жоспар (type: plan, scheduledAt)
  if (p.serverId) void api<{ order: { id: string; code: string } }>("/v1/orders", { method: "POST", body: JSON.stringify({ packId: p.serverId, type: "plan", scheduledAt: new Date(at).toISOString(), ...(branch?.id ? { branchId: branch.id } : {}), idempotencyKey: newKey() }) }, 12000)
    .then((j) => { bookings = bookings.map((x) => (x.id === b.id ? { ...x, serverId: j.order.id, code: j.order.code } : x)); emit(); }).catch(() => undefined);
  return b;
}
export function moveBooking(id: string, at: number) { bookings = bookings.map((b) => (b.id === id ? { ...b, at } : b)).sort((x, y) => x.at - y.at); emit(); }
/** Бас тарту: 2 сағаттан ерте болса бірлік пакетке қайтады. Қайтарады: қайтарылды ма. */
export function cancelBooking(id: string): boolean {
  const b = getBooking(id); if (!b) return false;
  const free = freeCancel(b);
  bookings = bookings.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x));
  if (b.serverId) void api(`/v1/orders/${b.serverId}/cancel`, { method: "POST" }).catch(() => undefined);
  if (free) packs = packs.map((x) => x.id !== b.packId ? x : { ...x, left: x.left + 1,
    history: [{ emoji: "↩️", title: "Жазылудан бас тартылды", sub: `${bookLabel(b.at)} • тегін`, right: `Қалды: ${x.left + 1}` }, ...x.history] });
  emit();
  return free;
}

/** B4: қолданылмаған пакетті қайтару (сервер: бірлік жұмсалмаса, 14 күн ішінде). Сәтті болса — пакет тізімнен алынады.
 *  cash — картаға/Kaspi-ге қайтатын ақша, bonus — Medeo бонусына оралатын бөлігі (бонуспен төленсе). */
export async function refundPack(packId: string): Promise<{ ok: boolean; error?: string; cash?: number; bonus?: number }> {
  const p = getPack(packId); if (!p?.serverId) return { ok: false, error: "local" };
  try {
    const r = await api<{ cash: number; bonus: number }>(`/v1/packs/${p.serverId}/refund`, { method: "POST" }, 12000);
    packs = packs.filter((x) => x.id !== packId); emit(); return { ok: true, cash: r.cash, bonus: r.bonus };
  }
  catch (e) { return { ok: false, error: srvError(e) }; }
}

/** Автожаңарту (сервер: POST /v1/packs/:id/auto-renew): қосу үшін сақталған карта керек. Сәтті болса — пакетке белгі. */
export async function setAutoRenew(packId: string, on: boolean, cardId?: string): Promise<{ ok: boolean; error?: string; card?: string }> {
  const p = getPack(packId); if (!p?.serverId) return { ok: false, error: "local" };
  try {
    const r = await api<{ autoRenew: boolean; card?: string }>(`/v1/packs/${p.serverId}/auto-renew`, { method: "POST", body: JSON.stringify({ on, ...(cardId ? { cardId } : {}) }) });
    packs = packs.map((x) => (x.id === packId ? { ...x, autoRenew: r.autoRenew } : x)); emit();
    return { ok: true, card: r.card };
  } catch (e) { return { ok: false, error: srvError(e) }; }
}

/** Бот хабарламалары клиент таңдаған тілде келуі үшін — серверге тілді айтамыз (сессияда бір рет, өзгерсе ғана) */
export function syncServerLang() {
  if (!(window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData && !(import.meta.env.DEV && localStorage.getItem("medeo_dev_init"))) return;
  const l = getLang();
  try { if (localStorage.getItem("medeo_lang_srv") === l) return; } catch { /* жеке терезе */ }
  void api("/v1/me", { method: "PATCH", body: JSON.stringify({ lang: l }) }).then(() => { try { localStorage.setItem("medeo_lang_srv", l); } catch { /* жеке терезе */ } }).catch(() => undefined);
}
