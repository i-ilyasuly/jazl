// Картадан орын белгілеу (Патша, 2026-11-21): мекеме филиалының дәл орнын өзі қояды — картаны жылжытып, ортадағы
// түйреуішті есікке әкеледі. Сыртқы геокодер (2ГИС/Google) керек емес: олардың деректерін сақтау шарттарына тәуелді емеспіз.
// Карта — негізгі картадағыдай MapLibre + OpenFreeMap (тегін).
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CITY_CENTER } from "../mocks/venues";
import { askLocation, haptic, useBackButton } from "../telegram";
import s from "./PinPicker.module.css";

const styleUrl = () => `https://tiles.openfreemap.org/styles/${document.documentElement.dataset.theme === "dark" ? "dark" : "liberty"}`;

export function PinPicker({ start, onPick, onClose }: { start?: [number, number] | null; onPick: (ll: [number, number]) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [moving, setMoving] = useState(false);
  const [live, setLive] = useState(false);
  useBackButton(onClose);
  useEffect(() => {
    let dead = false;
    void import("maplibre-gl").then((ml) => {
      if (dead || !box.current) return;
      const m = new ml.Map({ container: box.current, style: styleUrl(), center: start ?? CITY_CENTER, zoom: start ? 17 : 13.5, attributionControl: { compact: true } });
      map.current = m;
      m.on("load", () => !dead && setLive(true));
      m.on("movestart", () => setMoving(true));
      m.on("moveend", () => setMoving(false));
    });
    return () => { dead = true; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const here = async () => {
    haptic.tap();
    const p = await askLocation().catch(() => null);
    if (p && p !== "browser") map.current?.flyTo({ center: [p.longitude, p.latitude], zoom: 17.5, duration: 700 });
  };
  const done = () => { const c = map.current?.getCenter(); if (!c) return; haptic.success(); onPick([Number(c.lng.toFixed(6)), Number(c.lat.toFixed(6))]); };
  return (
    <div className={s.root}>
      <div ref={box} className={s.map} />
      {!live && <span className={s.loading} />}
      <span className={`${s.pin} ${moving ? s.lift : ""}`} aria-hidden />
      <span className={s.shadow} aria-hidden />
      <p className={s.hint}>Картаны жылжытып, түйреуішті кіреберіске қойыңыз</p>
      <button className={s.me} onClick={() => void here()} aria-label="Менің орным">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2" fill="currentColor" /></svg>
      </button>
      <div className={s.bar}>
        <button className={s.cancel} onClick={onClose}>Бас тарту</button>
        <button className={s.ok} onClick={done}>Осы жер</button>
      </div>
    </div>
  );
}
