// Қосымшаның жергілікті күйі (бэкендсіз): сатып алынған пакеттер және қолдану тарихы.
// Бэкенд қосылғанда осы файлдың ішкі жағы API шақыруларына ауысады, экрандар өзгермейді.
import { useSyncExternalStore } from "react";
import { fmt, offers, unitPrice, type Offer } from "./mocks/offers";

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
export const offerOf = (p: Pack): Offer => offers.find((o) => o.id === p.offerId) ?? offers[0];
export const getPack = (id?: string) => packs.find((p) => p.id === id);

export function buyPack(offerId: string): string {
  const o = offers.find((x) => x.id === offerId) ?? offers[0];
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
