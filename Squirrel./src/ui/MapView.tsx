// Шынайы вектор карта: MapLibre GL + OpenFreeMap (тегін, кілтсіз, OpenStreetMap деректері).
// Күндізгі режимде «liberty» (3D ғимараттары бар), түнгіде «dark» стилі. Маркерлер — біздің HTML пиндер.
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadMaplibre } from "./maplibre";
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
  const pinTap = useRef(0);

  // Картаны бір рет құру (кітапхана тек осы бетте жүктеледі)
  useEffect(() => {
    let dead = false;
    void loadMaplibre().then((ml) => {
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
      // Бос жерді басу — таңдауды алу. Белгі жаңа ғана басылған болса (телефондағы «tap» кешігіп келеді) — елемейміз.
      m.on("click", (e) => { if (Date.now() - pinTap.current < 700) return; if (!(e.originalEvent.target as HTMLElement).closest?.("button")) emptyRef.current(); });
      for (const v of venues) {
        const el = document.createElement("button");
        el.className = s.pin; el.setAttribute("aria-label", v.name);
        el.style.setProperty("--tint", kindTint[v.kind]);
        // Патша (2026-11-21, 10): Airbnb сияқты — түйреуіште бағасы әрдайым жазулы
        el.innerHTML = `<span class="${s.dot}"><i>${kindEmoji[v.kind]}</i></span><span class="${s.price}">${fmt(Math.min(...v.offers.map((o) => o[1])))}</span>`;
        // Телефонда карта саусақ тиген сәтте (touchstart) әдепкі әрекетті тоқтатады — сондықтан «click» келмей,
        // белгі тек секіріп қала беретін (Патша, 2026-11-21). Енді басуды өзіміз анықтаймыз: тиіп, жылжымай көтерілсе — таңдалады.
        let down: { x: number; y: number } | null = null; let tappedAt = 0;
        el.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
        el.addEventListener("pointerup", (e) => {
          if (down && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) < 10) { tappedAt = pinTap.current = Date.now(); pickRef.current(v); }
          down = null;
        });
        el.addEventListener("pointercancel", () => { down = null; });
        el.addEventListener("click", (e) => { e.stopPropagation(); if (Date.now() - tappedAt > 600) { pinTap.current = Date.now(); pickRef.current(v); } }); // пернетақта / тінтуір
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
    // Саусақ көтерілгеннен кейін карта өз қимылын аяқтайды да, бұрын басталған жылжуды тоқтатып тастайтын — сәл кешіктіреміз
    if (!m || !sel) return;
    const t = window.setTimeout(() => m.easeTo({ center: lngLat(sel), zoom: Math.max(m.getZoom(), 15), duration: 700, padding: { top: 0, bottom: padBottom, left: 0, right: 0 } }), 80);
    return () => window.clearTimeout(t);
  }, [shown, sel, padBottom]);

  // Менің орным
  useEffect(() => {
    const m = map.current;
    if (!m || !me) return;
    void loadMaplibre().then((ml) => {
      if (!meMarker.current) { const el = document.createElement("div"); el.className = s.me; meMarker.current = new ml.Marker({ element: el }).setLngLat(me).addTo(m); }
      else meMarker.current.setLngLat(me);
    });
  }, [me, live]);

  return <>
    <div ref={box} className={`${s.map} ${live ? s.live : ""}`} />
    {!live && <span className={s.loading} aria-label="Карта жүктелуде" />}
  </>;
}
