// MapLibre 6 (аудит 2026-11-21 жаңартуы): воркер бөлек файл — Vite оны жинап, URL береді, кітапханаға айтамыз.
// Бұрын (2026-11-21) setWorkerUrl болмағандықтан карта «шексіз жүктелетін» (Worker failed to load).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

let p: Promise<typeof import("maplibre-gl")> | null = null;
export const loadMaplibre = () => (p ??= import("maplibre-gl").then((ml) => { ml.setWorkerUrl(workerUrl); return ml; }));
/** Фонда: кітапхананы да, воркер файлын да алдын ала жүктеп қояды (кэшке түседі) — «Картада» басқанда күту болмайды. */
export const warmMaplibre = () => { void loadMaplibre().catch(() => undefined); void fetch(workerUrl).catch(() => undefined); };
