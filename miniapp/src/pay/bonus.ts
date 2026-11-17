// Medeo бонусы (Патша, 2026-11-17): мерзімі өтіп, пайдаланылмай қалған бірліктің ақшасы клиентке бонус болып қайтады (12 ай).
// Бонус келесі сатып алуда бағадан шегеріледі. Сервер: GET /v1/bonus, POST /v1/purchases { useBonus: true }.
import { useEffect, useSyncExternalStore } from "react";
import { api } from "../api";
import { hasServer } from "./checkout";

export interface BonusItem { id: string; kind: string; amount: number; left: number; units: number; expiresAt: string; at: string; title: string | null; venue: string | null; expired: boolean }
export interface BonusInfo { balance: number; nextExpiry: string | null; items: BonusItem[] }

let info: BonusInfo | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function loadBonus(force = false) {
  if (!hasServer()) return Promise.resolve();
  if (loading && !force) return loading;
  loading = api<BonusInfo>("/v1/bonus").then((j) => { info = { balance: j.balance, nextExpiry: j.nextExpiry, items: j.items }; emit(); }).catch(() => undefined);
  return loading;
}
/** fresh — бет ашылғанда серверден қайта оқу (төлем парағы, бонус беті: қалдық ескірмеуі үшін) */
export function useBonus(fresh = false) {
  const v = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => info);
  useEffect(() => { void loadBonus(fresh); }, [fresh]);
  return v;
}
/** Kaspi/сынақ жолы (store.buyOnServer) үшін: келесі сатып алуда бонус жұмсалсын ба */
let next = false;
export const setBonusNext = (v: boolean) => { next = v; };
export const takeBonusNext = () => { const v = next; next = false; return v; };
