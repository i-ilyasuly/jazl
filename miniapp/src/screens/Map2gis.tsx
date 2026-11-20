// 2GIS картасы — СЫНАҚ беті (Патша, 2026-11-21). Негізгі карта — MapScreen (OpenFreeMap), пилотта да сол қалады.
// Бұл бет тек салыстыру үшін: 2GIS MapGL картасы және Medeo-ға қосылған мекемелер (бағасы бар түйреуіштер).
// Кілт: Patша өз демо кілтін осы беттегі жолға бір рет енгізеді — тек осы құрылғыда сақталады (репоға/серверге жазылмайды).
// Кейін Vercel-де VITE_DGIS_KEY орнатылса — сол қолданылады. Platform Manager-де кілтті доменге шектеу керек.
import { useCallback, useEffect, useRef, useState } from "react";
import { useGo } from "../nav";
import { haptic, useBackButton } from "../telegram";
import { fmt } from "../mocks/offers";
import { CITY_CENTER, kindEmoji, kindLabel, lngLat, venues, type Venue } from "../mocks/venues";
import { TelegramChrome } from "../ui/TelegramChrome";
import s from "./Map2gis.module.css";

const LS = "medeo_dgis_key";
const readKey = () => { try { return (import.meta.env.VITE_DGIS_KEY as string | undefined) || localStorage.getItem(LS) || ""; } catch { return ""; } };
type MapGL = { Map: new (el: HTMLElement, o: object) => GLMap; HtmlMarker: new (m: GLMap, o: object) => { destroy(): void } };
type GLMap = { destroy(): void; setLanguage?(l: string): void; fitBounds(b: { northEast: number[]; southWest: number[] }, o?: object): void; setCenter(c: number[], o?: object): void; setZoom(z: number, o?: object): void; on(e: string, f: () => void): void };
let loader: Promise<MapGL> | null = null;
const loadMapGL = () => (loader ??= new Promise<MapGL>((ok, bad) => {
  const w = window as unknown as { mapgl?: MapGL };
  if (w.mapgl) return ok(w.mapgl);
  const sc = document.createElement("script"); sc.src = "https://mapgl.2gis.com/api/js/v1"; sc.async = true;
  sc.onload = () => (w.mapgl ? ok(w.mapgl) : bad(new Error("mapgl")));
  sc.onerror = () => { loader = null; bad(new Error("load")); };
  document.head.appendChild(sc);
}));
const isDark = () => document.documentElement.dataset.theme === "dark";
const minPrice = (v: Venue) => Math.min(...v.offers.map((o) => o[1] as number));

export function Map2gis() {
  const go = useGo();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const [key, setKey] = useState(readKey);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [sel, setSel] = useState<Venue | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!key || !box.current) return;
    let map: GLMap | null = null; let dead = false;
    setState("loading");
    loadMapGL().then((gl) => {
      if (dead || !box.current) return;
      map = new gl.Map(box.current, { key, center: CITY_CENTER, zoom: 13.6, pitch: 45, rotation: -10, zoomControl: false, ...(isDark() ? { style: "e05ac437-fcc2-4845-ad74-b1de9ce07555" } : {}) });
      try { map.setLanguage?.("ru"); } catch { /* */ }
      for (const v of venues) {
        const el = document.createElement("button");
        el.className = s.pin; el.setAttribute("aria-label", v.name);
        el.innerHTML = `<span class="${s.dot}">${kindEmoji[v.kind]}</span><b>${fmt(minPrice(v))}</b>`;
        el.addEventListener("click", (e) => { e.stopPropagation(); haptic.select(); setSel(v); map?.setCenter(lngLat(v), { duration: 500 }); });
        new gl.HtmlMarker(map, { coordinates: lngLat(v), html: el, anchor: [0, 0], zIndex: 2 });
      }
      const pts = venues.map(lngLat);
      const lo = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], hi = [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
      try { map.fitBounds({ southWest: lo, northEast: hi }, { padding: { top: 140, bottom: 220, left: 48, right: 48 }, considerRotation: true }); } catch { /* */ }
      map.on("click", () => setSel(null));
      setState("ready");
    }).catch(() => { if (!dead) setState("error"); });
    return () => { dead = true; map?.destroy(); };
  }, [key]);

  const save = () => { const k = draft.trim(); if (k.length < 16) { haptic.error(); return; } try { localStorage.setItem(LS, k); } catch { /* */ } haptic.success(); setKey(k); };
  const forget = () => { try { localStorage.removeItem(LS); } catch { /* */ } setKey(""); setState("idle"); };

  return (
    <div className={s.page}>
      <div ref={box} className={s.map} />
      <TelegramChrome mode="back" onBack={back} />
      <span className={s.badge}>2GIS · сынақ</span>
      {!key && (
        <div className={s.keyCard}>
          <h2 className={s.title}>2GIS картасын сынау</h2>
          <p className={s.text}>Platform Manager-дегі демо кілтті осында қойыңыз. Кілт тек осы телефонда сақталады.</p>
          <input className={s.input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Кілт" autoComplete="off" spellCheck={false} />
          <button className={s.btn} onClick={save}>Картаны ашу</button>
        </div>
      )}
      {key && state === "loading" && <span className={s.loading} aria-label="Карта жүктелуде" />}
      {key && state === "error" && (
        <div className={s.keyCard}>
          <h2 className={s.title}>Карта ашылмады</h2>
          <p className={s.text}>Интернетті не кілтті тексеріңіз (кілт осы доменге рұқсат етілген бе).</p>
          <button className={s.btn} onClick={forget}>Кілтті қайта енгізу</button>
        </div>
      )}
      {sel && (
        <button className={s.sheet} onClick={() => go("/venue/" + sel.id)}>
          <span className={s.sDot}>{kindEmoji[sel.kind]}</span>
          <span className={s.sText}><b>{sel.name}</b><small>{`${kindLabel[sel.kind]} · ${sel.address} · ★ ${String(sel.rating).replace(".", ",")}`}</small></span>
          <span className={s.sPrice}>{`${fmt(minPrice(sel))}-дан`}</span>
        </button>
      )}
      {key && state === "ready" && !sel && <button className={s.forget} onClick={forget}>Кілтті өшіру</button>}
    </div>
  );
}
