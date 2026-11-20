// Шынайы вектор карта: MapLibre GL + OpenFreeMap (тегін, кілтсіз, OpenStreetMap деректері).
// Күндізгі режимде «liberty» (3D ғимараттары бар), түнгіде «dark» стилі. Маркерлер — біздің HTML пиндер.
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fmt } from "../mocks/offers";
import { CITY_CENTER, kindEmoji, kindTint, lngLat, type Venue } from "../mocks/venues";
import s from "./MapView.module.css";

const styleUrl = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;
const isDark = () => document.documentElement.dataset.theme === "dark";

export interface MapApi { flyTo: (c: [number, number], zoom?: number) => void }

export function MapView({ venues, shown, sel, onPick, onTapEmpty, me, onReady, padBottom }: {
  venues: Venue[]; shown: Venue[]; sel: Venue | null; onPick: (v: Venue) => void; onTapEmpty: () => void;
  me: [number, number] | null; onReady?: (api: MapApi) => void; padBottom: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef(new Map<string, { m: Marker; el: HTMLButtonElement }>());
  const meMarker = useRef<Marker | null>(null);
  const [live, setLive] = useState(false);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const emptyRef = useRef(onTapEmpty); emptyRef.current = onTapEmpty;

  // Картаны бір рет құру (кітапхана тек осы бетте жүктеледі)
  useEffect(() => {
    let dead = false;
    void import("maplibre-gl").then((ml) => {
      if (dead || !box.current) return;
      const m = new ml.Map({
        container: box.current, style: styleUrl(isDark()), center: CITY_CENTER, zoom: 14, pitch: 0,
        attributionControl: { compact: true }, maxPitch: 70, dragRotate: true, fadeDuration: 150,
      });
      map.current = m;
      m.on("load", () => { if (!dead) setLive(true); });
      // Барлық мекеме экранға сыятындай орналастыру
      const pts = venues.map(lngLat);
      const b = new ml.LngLatBounds(pts[0], pts[0]); pts.forEach((p) => b.extend(p));
      const cam = m.cameraForBounds(b, { padding: { top: 180, bottom: 270, left: 56, right: 56 } });
      if (cam?.center && cam.zoom) m.jumpTo({ center: cam.center, zoom: cam.zoom + 0.25, pitch: 40, bearing: -10 });
      m.on("click", (e) => { if (!(e.originalEvent.target as HTMLElement).closest("button")) emptyRef.current(); });
      for (const v of venues) {
        const el = document.createElement("button");
        el.className = s.pin; el.setAttribute("aria-label", v.name);
        el.style.setProperty("--tint", kindTint[v.kind]);
        el.innerHTML = `<span class="${s.dot}"><i>${kindEmoji[v.kind]}</i></span><span class="${s.price}">${fmt(Math.min(...v.offers.map((o) => o[1])))}-дан</span>`;
        el.addEventListener("click", (e) => { e.stopPropagation(); pickRef.current(v); });
        markers.current.set(v.id, { m: new ml.Marker({ element: el, anchor: "center" }).setLngLat(lngLat(v)).addTo(m), el });
      }
      onReady?.({ flyTo: (c, zoom = 15.2) => m.flyTo({ center: c, zoom, pitch: 50, duration: 900, essential: true }) });
    });
    // Тақырып ауысса, стиль де ауысады
    const obs = new MutationObserver(() => map.current?.setStyle(styleUrl(isDark())));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { dead = true; obs.disconnect(); map.current?.remove(); map.current = null; markers.current.clear(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Санат сүзгісі мен таңдалған мекеме
  useEffect(() => {
    const ids = new Set(shown.map((v) => v.id));
    markers.current.forEach(({ el }, id) => {
      el.classList.toggle(s.hidden, !ids.has(id));
      el.classList.toggle(s.on, sel?.id === id);
    });
    const m = map.current;
    if (m && sel) m.easeTo({ center: lngLat(sel), zoom: Math.max(m.getZoom(), 15), duration: 700, padding: { top: 0, bottom: padBottom, left: 0, right: 0 } });
  }, [shown, sel, padBottom]);

  // Менің орным
  useEffect(() => {
    const m = map.current;
    if (!m || !me) return;
    void import("maplibre-gl").then((ml) => {
      if (!meMarker.current) { const el = document.createElement("div"); el.className = s.me; meMarker.current = new ml.Marker({ element: el }).setLngLat(me).addTo(m); }
      else meMarker.current.setLngLat(me);
    });
  }, [me, live]);

  return <div ref={box} className={`${s.map} ${live ? s.live : ""}`} />;
}
