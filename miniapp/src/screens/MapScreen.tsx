// Figma, «05 · Карта»: «Орналасу рұқсаты» 13886:18191, «Карта және тізім» 13886:18467, «Мекеме таңдалды» 13886:18763,
// «Ашық тізім» 13886:19089, «Рұқсатсыз» 13886:19443, «Мекеме жоқ» 13886:19747
// Карта — MapLibre + OpenFreeMap нағыз вектор картасы; ол жүктелгенше Figma-дағы стильденген үлгі көрінеді.
import { pickRoute } from "../ui/route";
import { Emo } from "../ui/Emo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt, type OfferKind } from "../mocks/offers";
import { demoEmpty } from "../mocks/useMock";
import { CITY_CENTER, kindLabel, kindTint, lngLat, venues, type Venue } from "../mocks/venues";
import { useGo } from "../nav";
import { setSettings, useSettings } from "../store";
import { askLocation, haptic, inTelegram, openExternal, useBackButton, useBottomButtons } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { Sticker } from "../ui/Sticker";
import { MapView, type MapApi } from "../ui/MapView";
import { TelegramChrome } from "../ui/TelegramChrome";
import mapBg from "../assets/icons/mapBg.svg";
import locate from "../assets/icons/mLocate.svg";
import listIcon from "../assets/icons/mList.svg";
import searchIcon from "../assets/icons/search.svg";
import chev from "../assets/icons/cardMore.svg";
import s from "./MapScreen.module.css";

const chips: [OfferKind | "all", string][] = [["all", "Барлығы"], ["food", "Тағам"], ["coffee", "Кофе"], ["hair", "Шаштараз"]];
const kmText = (v: Venue) => v.km.toFixed(1).replace(".", ",") + " км";
type Snap = "peek" | "open";

export function MapScreen() {
  const go = useGo();
  const st = useSettings();
  const [kind, setKind] = useState<OfferKind | "all">("all");
  const [sel, setSel] = useState<Venue | null>(null);
  const [snap, setSnap] = useState<Snap>("peek");
  const [ask, setAsk] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const sheetDrag = useRef<{ y: number; moved: number } | null>(null);
  const [pull, setPull] = useState(0);
  const [me, setMe] = useState<[number, number] | null>(null);
  const api = useRef<MapApi | null>(null);
  const back = useCallback(() => { if (sel) { setSel(null); return; } if (snap === "open") { setSnap("peek"); return; } go(-1, "back"); }, [sel, snap, go]);
  useBackButton(back);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const granted = st.geo === "granted";
  const requestGeo = useCallback(async () => {
    const r = await askLocation();
    if (r === "browser") setAsk(true); else { setSettings({ geo: r ? "granted" : "denied" }); if (r) { haptic.success(); setMe([r.longitude, r.latitude]); } }
  }, []);
  // Бетке алғаш кіргенде рұқсат сұралады (Figma: «Карта / Орналасу рұқсаты»)
  useEffect(() => { if (st.geo === "unknown") { const t = setTimeout(requestGeo, 600); return () => clearTimeout(t); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = demoEmpty();
  const shown = useMemo(() => (empty ? [] : venues.filter((v) => kind === "all" || v.kind === kind)), [kind, empty]);
  const list = useMemo(() => [...shown].sort((a, b) => (granted ? a.km - b.km : a.name.localeCompare(b.name))), [shown, granted]);

  const pick = (v: Venue) => { haptic.select(); setSel(v); setSnap("peek"); };
  const toVenue = useMemo(() => ({ text: "Мекемеге өту", onClick: () => { if (sel) go("/venue/" + sel.id); } }), [sel, go]);
  const route = useMemo(() => ({ text: "Бағыт", onClick: () => { if (sel) { haptic.tap(); void pickRoute(sel.name + " " + sel.address, lngLat(sel)); } }, position: "left" as const }), [sel]);
  const widen = useMemo(() => ({ text: "Радиусты үлкейту", onClick: () => haptic.tap() }), []);
  useBottomButtons(sel ? toVenue : widen, sel ? route : undefined, Boolean(sel) || empty);

  // Картаны саусақпен жылжыту
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; setPanning(true); } if (d.moved) setPan({ x: Math.max(-90, Math.min(90, d.px + dx)), y: Math.max(-120, Math.min(120, d.py + dy)) }); };
  const onUp = () => { const d = drag.current; drag.current = null; setPanning(false); if (d && !d.moved && sel) setSel(null); };
  // Төменгі парақты жоғары-төмен сүйреу
  const sDown = (e: React.PointerEvent) => { if (sel) return; sheetDrag.current = { y: e.clientY, moved: 0 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const sMove = (e: React.PointerEvent) => { const d = sheetDrag.current; if (!d) return; d.moved = e.clientY - d.y; setPull(d.moved); };
  const sUp = () => { const d = sheetDrag.current; sheetDrag.current = null; setPull(0); if (!d) return; if (Math.abs(d.moved) < 6) { haptic.tap(); setSnap(snap === "peek" ? "open" : "peek"); } else if (d.moved < -40) { haptic.tap(); setSnap("open"); } else if (d.moved > 40) { haptic.tap(); setSnap("peek"); } };

  const mode = sel ? "venue" : empty ? "none" : snap === "open" ? "open" : granted || st.geo === "unknown" ? "peek" : "peekDenied";
  return (
    <div className={s.page}>
      {/* Патша (2026-11-21): жасанды (сурет) карта жоқ — бірден нақты карта; жүктелгенше тек фон түсі мен айналма */}
      <MapView venues={venues} shown={shown} sel={sel} onPick={pick} onTapEmpty={() => { if (sel) setSel(null); }} me={me} onReady={(a) => { api.current = a; }} padBottom={sel ? 260 : 230} />
      <TelegramChrome mode="back" onBack={back} />
      <button className="topSearch" onClick={() => go("/search")} aria-label="Іздеу"><img src={searchIcon} alt="" /><span>Іздеу...</span></button>
      <div className={s.chips}>
        {chips.map(([id, t]) => <button key={id} className={`t-sub2 w-600 ${s.chip} ${kind === id ? s.chipOn : ""}`} onClick={() => { if (kind !== id) { haptic.select(); setKind(id); setSel(null); } }}>{t}</button>)}
      </div>

      <div className={`${s.sheet} ${s[mode]} ${pull ? s.pulling : ""}`} style={pull ? { transform: `translateY(${Math.max(-60, Math.min(60, pull)) * 0.6}px)` } : undefined}>
        <button className={`${s.fab} ${s.fabList}`} onClick={() => { haptic.tap(); setSel(null); setSnap(snap === "open" ? "peek" : "open"); }}><img src={listIcon} width={20} height={20} alt="" /><span className="t-sub2 w-600">{snap === "open" && !sel ? "Картада" : "Тізімде"}</span></button>
        <button className={`${s.fab} ${s.fabLocate}`} onClick={() => { haptic.tap(); if (granted && me) api.current?.flyTo(me); else if (granted) { setPan({ x: 0, y: 0 }); api.current?.flyTo(CITY_CENTER, 14.2); void requestGeo(); } else void requestGeo(); }} aria-label="Менің орным"><img src={locate} width={24} height={24} alt="" /></button>
        <div className={s.handle} onPointerDown={sDown} onPointerMove={sMove} onPointerUp={sUp} onPointerCancel={sUp}><span className={s.grabber} /></div>
        {sel ? (
          <div className={s.venue} key={sel.id}>
            <button className={s.vHead} onClick={toVenue.onClick}>
              <span className={s.vAvatar} style={{ background: kindTint[sel.kind] + "4d" }}><Emo kind={sel.kind} size={36} /></span>
              <span className={s.vText}><b className="t-headline">{sel.name}</b><small className="t-cap1" style={{ whiteSpace: "pre" }}>★ {String(sel.rating).replace(".", ",")} ({sel.reviews})  •  {kmText(sel)}  •  {sel.address}</small></span>
              <img src={chev} width={20} height={20} alt="" />
            </button>
            <p className={`t-sub2 ${s.vOpen}`}><i />Ашық · бүгін {sel.hours}</p>
            <div className={s.vOffers}>{sel.offers.slice(0, 2).map(([t, p, id]) => <button key={t} className="t-sub2" onClick={() => id && go("/offer/" + id)}><span>{t}</span><b>{fmt(p)}</b></button>)}</div>
            {!inTelegram && <div className={s.bar}><button className={`${s.btn} ${s.second}`} onClick={route.onClick}>Бағыт</button><button className={`${s.btn} ${s.main}`} onClick={toVenue.onClick}>Мекемеге өту</button></div>}
          </div>
        ) : empty ? (
          <div className={s.none}>
            <Sticker name="search" />
            <p className="t-headline">Жақын маңда мекеме жоқ</p>
            <p className={`t-sub2 ${s.gray}`}>Іздеу радиусын үлкейтіп көр</p>
            {!inTelegram && <div className={s.bar}><button className={`${s.btn} ${s.main} ${s.wide}`} onClick={widen.onClick}>Радиусты үлкейту</button></div>}
          </div>
        ) : (
          <>
            {st.geo === "denied" && <div className={s.banner}><p className="t-cap1">Орналасуға рұқсат жоқ, қашықтық көрсетілмейді</p><button className="t-cap1 w-600" onClick={requestGeo}>Рұқсат беру</button></div>}
            <div className={s.listHead}><h2 className="t-headline">{granted || st.geo === "unknown" ? "Жақын маңда" : "Мекемелер"} · {list.length}</h2><span className="t-cap1">{granted || st.geo === "unknown" ? "Қашықтық бойынша" : "А–Я бойынша"}</span></div>
            <div className={s.list}>
              {list.map((v) => (
                <button key={v.id} className={s.row} onClick={() => pick(v)}>
                  <span className={s.rAvatar} style={{ background: kindTint[v.kind] + "4d" }}><Emo kind={v.kind} size={30} /></span>
                  <span className={s.rText}><b className="t-text w-600">{v.name}</b><small className="t-cap1" style={{ whiteSpace: "pre" }}>{`${kindLabel[v.kind]}${st.geo === "denied" ? "" : `  •  ${kmText(v)}`}  •  Ашық`}</small></span>
                  <span className={`t-cap1 ${s.gray}`}>{`${v.offers.length} ұсыныс`}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {ask && <Confirm title="Орналасу рұқсаты" text="Medeo жақын маңдағы мекемелерді көрсету үшін орналасқан жеріңді білгісі келеді." cancel="Бас тарту" ok="Рұқсат ету" onClose={() => { setAsk(false); if (st.geo === "unknown") setSettings({ geo: "denied" }); }} onOk={() => { haptic.success(); setSettings({ geo: "granted" }); }} />}
    </div>
  );
}
