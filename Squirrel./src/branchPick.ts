// Филиал таңдау (Патша, 2026-11-23): тапсырыс пен жоспарда клиент филиалды өзі таңдайды. Әдепкі — ең жақын ашық филиал.
// Тізім серверден (GET /v1/packs/:id/branches — пакет жарамды филиалдар, бүгінгі күйі); қашықтық телефонда есептеледі —
// координата серверге жіберілмейді. Таңдау пакет бойынша жадта сақталады: «Тапсырыс» → «Күнін таңдау» → «Растау» бір филиалмен өтеді.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { branches as demoBranches, getSettings, offerOf, setSettings, type Pack } from "./store";
import { askLocation } from "./telegram";

export interface PickBranch {
  id: string; address: string; lat: number | null; lng: number | null;
  open: boolean; kind: string; until: string | null; reason: string | null;
  /** Бүгінгі жұмыс уақыты: "09:00–22:00", "24/7", null */
  today: string | null; km: number | null; server: boolean;
}
interface Srv { id: string; address: string; lat: number | null; lng: number | null; open: boolean; kind: string; until: string | null; reason: string | null; today: string | null }

let me: { lat: number; lng: number } | null = null;
const picked = new Map<string, string>();
const cache = new Map<string, Srv[]>();
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());

/** Екі нүкте арасы, км (гаверсинус) */
export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const kmLabel = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} м` : `${km.toFixed(1).replace(".", ",")} км`);

/** Жұмыс уақытының минуттары [ашылу, жабылу]; 24/7 → [0, 1440]; белгісіз → null */
export function spanOf(b?: PickBranch | null): [number, number] | null {
  if (!b?.today) return null;
  if (b.today === "24/7") return [0, 24 * 60];
  const [o, c] = b.today.split("–").map((t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; });
  return [o, c <= o ? c + 24 * 60 : c];
}

/** Күй жолы: «Ашық · 09:00–22:00», «Тәулік бойы», «Уақытша жабық · Жөндеу», «Жабық · 10:00-де ашылады» */
export function statusOf(b: PickBranch): { text: string; ok: boolean } {
  if (b.open) return { ok: true, text: b.today === "24/7" || b.kind === "247" ? "Ашық · тәулік бойы" : b.today ? `Ашық · ${b.today}` : "Ашық" };
  if (b.kind === "temp") return { ok: false, text: `Уақытша жабық${b.reason ? ` · ${b.reason}` : ""}` };
  if (b.kind === "holiday") return { ok: false, text: `Бүгін жабық${b.reason ? ` · ${b.reason}` : ""}` };
  return { ok: false, text: b.until ? `Жабық · ${b.until}-де ашылады` : "Бүгін жабық" };
}

async function locate(ask: boolean) {
  const st = getSettings().geo;
  if (!ask && st !== "granted") return false;
  const r = await askLocation().catch(() => null);
  if (r && r !== "browser") { me = { lat: r.latitude, lng: r.longitude }; if (st !== "granted") setSettings({ geo: "granted" }); ping(); return true; }
  if (r === null && ask) setSettings({ geo: "denied" });
  // Telegram-нан тыс (браузер): стандартты геолокация
  if (r === "browser" && "geolocation" in navigator) {
    return new Promise<boolean>((res) => navigator.geolocation.getCurrentPosition((p) => { me = { lat: p.coords.latitude, lng: p.coords.longitude }; ping(); res(true); }, () => res(false), { timeout: 6000, maximumAge: 600_000 }));
  }
  return false;
}

export function usePackBranches(pack?: Pack | null) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const sid = pack?.serverId;
  const [loading, setLoading] = useState(Boolean(sid && !cache.has(sid)));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!sid) return;
    let live = true;
    api<{ branches: Srv[] }>(`/v1/packs/${sid}/branches`, {}, 6000)
      .then((j) => { cache.set(sid, j.branches); if (live) { setLoading(false); ping(); } })
      .catch(() => { if (live) { setLoading(false); setFailed(!cache.has(sid)); } });
    return () => { live = false; };
  }, [sid]);
  // Орналасуға бұрын рұқсат берілсе — үнсіз аламыз (ең жақынын табу үшін)
  useEffect(() => { if (!me) void locate(false); }, []);

  const o = pack ? offerOf(pack) : null;
  const list = useMemo<PickBranch[]>(() => {
    if (!o) return [];
    const raw: PickBranch[] = sid && cache.has(sid)
      ? cache.get(sid)!.map((b) => ({ ...b, km: null, server: true }))
      : demoBranches(o.venue, o.address).map((b) => ({ id: b.id, address: b.address, lat: null, lng: null, open: b.open, kind: b.open ? "open" : "closed", until: null, reason: null, today: b.hours, km: b.km, server: false }));
    const withKm = raw.map((b) => (me && b.lat != null && b.lng != null ? { ...b, km: distKm(me, { lat: b.lat, lng: b.lng }) } : b));
    // Ашығы жоғарыда, сосын жақыннан алысқа (қашықтық белгісіз болса — мекеме тізіміндегі ретпен)
    return withKm.map((b, i) => ({ b, i })).sort((x, y) => Number(y.b.open) - Number(x.b.open) || (x.b.km ?? 1e9) - (y.b.km ?? 1e9) || x.i - y.i).map((x) => x.b);
  }, [o, sid, cache.get(sid ?? ""), me]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = pack?.id ?? "";
  const nearest = list.find((b) => b.open) ?? null;
  const chosen = list.find((b) => b.id === picked.get(key)) ?? nearest ?? list[0] ?? null;
  const choose = useCallback((id: string) => { picked.set(key, id); ping(); }, [key]);
  const findNearest = useCallback(async () => { const ok = await locate(true); if (ok) picked.delete(key); ping(); return ok; }, [key]);
  const hasKm = list.some((b) => b.km != null);
  return { list, chosen, nearestId: hasKm ? nearest?.id ?? null : null, choose, findNearest, hasKm, loading, failed };
}

/** Таңдалған филиал (тізім жүктелмесе де) — «Растау» беті мен жіберу үшін */
export const pickedBranchId = (packId: string) => picked.get(packId) ?? null;
