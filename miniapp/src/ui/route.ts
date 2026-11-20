// «Бағыт» (Патша, 2026-11-21): 2ГИС және Google Maps — екеуі де сыртқы сілтеме, API кілтсіз, тегін.
// Координата белгілі болса — Google Maps бірден жаяу маршрут құрады; әйтпесе атау/мекенжай бойынша іздейді.
import type { LinkRow } from "./LinkSheet";
import { nativePick, openExternal } from "../telegram";

export type LngLat = [number, number];
export const dgisUrl = (q: string) => "https://2gis.kz/karaganda/search/" + encodeURIComponent(q);
export const gmapsUrl = (q: string, ll?: LngLat) =>
  "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" + encodeURIComponent(ll ? `${ll[1]},${ll[0]}` : `${q}, Қарағанды`);

/** Бағыт парағының жолдары: 2ГИС (жасыл) және Google Maps (көк) */
export const routeRows = (name: string, q: string, ll?: LngLat): LinkRow[] => [
  { glyph: "pin", tint: "#31d158", title: "2ГИС", sub: `${name} мекенжайын 2ГИС-те ашу`, onClick: () => openExternal(dgisUrl(q)) },
  { glyph: "pin", tint: "#4285f4", title: "Google Maps", sub: "Жаяу маршрут Google Maps-те", onClick: () => openExternal(gmapsUrl(q, ll)) },
];

/** Бір батырмадан: нативті таңдау (Telegram), браузерде — 2ГИС */
export async function pickRoute(q: string, ll?: LngLat) {
  const id = await nativePick("Бағыт", "Қай картада ашайық?", [{ id: "2gis", text: "2ГИС" }, { id: "google", text: "Google Maps" }], "2gis");
  if (id === "2gis") openExternal(dgisUrl(q)); else if (id === "google") openExternal(gmapsUrl(q, ll));
}
