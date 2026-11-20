// Figma: «Пакеттерім (жаңа навигация) / Light» (13905:8147); «09 · Пакеттерім»: «Алғашқы кіру (көрсеткіш)» 13886:28960,
// «Бос күй» 13886:29133, «Тарих» 13886:29206. Жаңа бөліктердің өлшемі — UI kit шкаласы + 4/8px тор.
// «12 · Бағалау»: «Пакеттерім жолағы» 13886:33115 (Белсенді табының басында), бағалау парағы — ui/RateSheet.
import { Tile } from "../ui/Tile";
import { kindPic } from "../ui/Emo";
import { Emo } from "../ui/Emo";
import { useEffect, useRef, useState } from "react";
import { preloadSticker } from "../ui/Sticker";
import { syncServerPacks } from "../store";
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { useGo } from "../nav";
import { bookLabel, getPack, hideRate, useBookings, offerOf, useActivity, useOrders, usePacks, useRateHidden, type Activity, type Pack } from "../store";
import { haptic, kv } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Timeline } from "../ui/Timeline";
import searchIcon from "../assets/icons/search.svg";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import { UseSheet } from "../ui/UseSheet";
import { CopyCode } from "../ui/CopyCode";
import { RateSheet, Stars } from "../ui/RateSheet";
import close from "../assets/icons/close.svg";
import s from "./Packs.module.css";

const icon = { food: burger, coffee: burger, hair: scissors };

function PackCard({ pack, i, onUse, hint, onHint }: { pack: Pack; i: number; onUse: (p: Pack) => void; hint?: boolean; onHint?: () => void }) {
  const go = useGo();
  const o = offerOf(pack);
  const soon = pack.daysLeft <= 3;
  return (
    <article className={`${s.card} ${hint ? s.hinted : ""} rise`} style={{ ["--i" as string]: i }} onClick={() => go("/pack/" + pack.id)}>
      <div className={s.info}>
        <span className={s.thumb}><img src={kindPic[o.kind]} width={60} height={60} alt="" decoding="sync" style={{ objectFit: "contain" }} /></span>
        <div className={s.text}>
          <p className="t-headline">{o.title}</p>
          <p className={`t-sub2 ${s.sub}`}>{o.venue} · {o.distance}</p>
          <span className={`t-cap1 ${s.days} ${soon ? s.daysSoon : ""}`}>{`${pack.daysLeft} күн қалды`}</span>
        </div>
      </div>
      <hr className={s.sep} />
      <Timeline total={pack.total} used={pack.total - pack.left} warn={soon} width={348} />
      <div className={s.bottom}>
        <p className={s.left}><span className="t-text w-600">{pack.left} / {pack.total}</span><span className={`t-sub2 ${s.sub}`}>қалды</span></p>
        <button className={`t-sub2 w-600 ${s.use}`} disabled={pack.left < 1} onClick={(e) => { e.stopPropagation(); haptic.medium(); onUse(pack); }}>Қолдану</button>
        {hint && (
          <div className={s.tip} role="note" onClick={(e) => e.stopPropagation()}>
            <p>Мекемеде «Қолдану» батырмасын бас да, кассадағы QR-ды сканерле</p>
            <button onClick={() => { haptic.tap(); onHint?.(); }}>Түсінікті</button>
          </div>
        )}
      </div>
      {soon && (
        <div className={`${s.renew} infoBox infoOk`}>
          <span className={s.renewBar} />
          <p className={`t-sub2 ${s.renewText}`}>Қайта алсаң, қалған бірлік <b>келесі айға көшеді</b></p>
          <button className={`t-sub2 w-600 ${s.renewBtn}`} onClick={(e) => { e.stopPropagation(); haptic.medium(); go("/rebuy/" + pack.id); }}>Қайта алу</button>
        </div>
      )}
    </article>
  );
}



export function Packs() {
  const go = useGo();
  const all = usePacks();
  const packs = demoEmpty() ? [] : all;
  const [tab, setTab] = useState(() => Number(window.location.hash.match(/[?&]tab=([0-2])/)?.[1] ?? 0));
  const [using, setUsing] = useState<Pack | null>(null);
  const orders = useOrders().filter((o) => o.status === "sent");
  const bookings = useBookings().filter((b) => b.status === "ok");
  // Figma «22 · менің жазылуларым»: тек жазылулар болса таб «Жазылулар» деп аталады
  // Патша (2026-11-21): тамақ/кофеде тапсырыс жоқ — екінші бет «Жазылулар» (бұрынғы тапсырыстар болса — «Тапсырыстар»)
  const tabs = ["Белсенді", orders.length ? "Тапсырыстар" : "Жазылулар", "Тарих"];
  const { loading } = useMock("packs", packs, 500);
  const active = packs.filter((p) => p.left > 0 && !p.expired);
  const allActs = useActivity();
  const acts = demoEmpty() ? [] : allActs;
  const [rating, setRating] = useState<{ act: Activity; stars: number } | null>(null);
  const hidden = useRateHidden();
  const pending = acts.find((a) => a.action === "rate" && !hidden.includes(a.id));
  useEffect(() => { if (pending) void preloadSticker("love"); }, [pending]);
  useEffect(() => { void syncServerPacks(); }, []); // қалған бірліктер сервердегі санмен бірдей болсын // бағалау шақыруы көрінсе — стикер алдын ала жүктеледі
  // Алғашқы кіру көрсеткіші: бір рет көрсетіледі («Түсінікті» басылғанша). Демо: ?hint=1
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (/[?&]hint=1/.test(window.location.hash)) { setHint(true); return; }
    let live = true;
    void kv.get("medeo_packs_hint").then((v) => { if (live && !v) setHint(true); });
    return () => { live = false; };
  }, []);
  const closeHint = () => { setHint(false); kv.set("medeo_packs_hint", "1"); };
  // Табтар арасында свайп (Патша, 2026-11-16): көлденең сүйреу > 64px не жылдам сілтеу — көрші табқа өтеді;
  // табтың «тамшысы» навигациядағыдай саусақпен бірге жүреді, ауысқанда серпіліп созылады.
  const thumb = useRef<HTMLSpanElement>(null);
  const [drag, setDrag] = useState(0);
  const [dir, setDir] = useState(0);
  const touch = useRef<{ x: number; y: number; t: number; h: boolean | null } | null>(null);
  const pick = (i: number) => {
    if (i === tab || i < 0 || i > 2) return;
    haptic.select(); setDir(i > tab ? 1 : -1); setTab(i);
    thumb.current?.animate([{ scale: "1 1" }, { scale: "1.14 0.86", offset: 0.4 }, { scale: "0.97 1.04", offset: 0.75 }, { scale: "1 1" }], { duration: 420, easing: "ease-out" });
  };
  const onStart = (e: React.TouchEvent) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY, t: Date.now(), h: null }; };
  const onMove = (e: React.TouchEvent) => {
    const st = touch.current; if (!st) return; const p = e.touches[0]; const dx = p.clientX - st.x, dy = p.clientY - st.y;
    if (st.h === null && Math.abs(dx) + Math.abs(dy) > 10) st.h = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (st.h) setDrag(Math.max(-140, Math.min(140, (tab === 0 && dx > 0) || (tab === 2 && dx < 0) ? dx * 0.25 : dx)));
  };
  const onEnd = () => {
    const st = touch.current; touch.current = null; if (!st?.h) { setDrag(0); return; }
    const fast = Math.abs(drag) > 24 && Date.now() - st.t < 250;
    if (drag < -64 || (fast && drag < 0)) pick(tab + 1); else if (drag > 64 || (fast && drag > 0)) pick(tab - 1);
    setDrag(0);
  };
  return (
    <div className={s.page}>
      <button className="topSearch pinned" onClick={() => go("/search")} aria-label="Іздеу"><img src={searchIcon} alt="" /><span>Іздеу...</span></button>
      <header className={s.top}>
        <TelegramChrome mode="close" />
        <div className={s.seg}>
          <span ref={thumb} className={`${s.segThumb} ${drag ? s.segDrag : ""}`} style={{ translate: `${Math.max(0, Math.min(250.66, tab * 125.33 - (drag / 380) * 125.33))}px 0` }} />
          {tabs.map((t, i) => (
            <button key={t} className={`${s.segBtn} ${tab === i ? s.segOn : ""}`} onClick={() => pick(i)}>{t}</button>
          ))}
        </div>
      </header>
      {!loading && packs.length === 0 ? (
        <EmptyState inline sticker="shop" title="Әзірге пакет жоқ" text={"Пакет сатып алсаң, мекемеде сканерлеп\nнемесе үйден тапсырыс беріп қолданасың"} action={{ text: "Ұсыныстарды көру", onClick: () => go("/", "fade") }} />
      ) : <main className={`${s.list} ${dir > 0 ? s.fromRight : dir < 0 ? s.fromLeft : ""}`} key={tab} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}
          style={drag ? { transform: `translateX(${drag}px)`, transition: "none" } : undefined}>
        {!(tab === 1 && bookings.length) && <p className={`t-sub2 w-600 ${s.header}`}>{tab === 2 ? "Соңғы әрекеттер" : <>{tabs[tab]}<span> · {tab === 0 ? active.length : orders.length}</span></>}</p>}
        {loading
          ? [0, 1].map((i) => <div key={i} className={s.card} style={{ height: 190 }}><span className="sk" style={{ position: "absolute", left: 16, top: 16, width: 72, height: 72, borderRadius: 12 }} /><span className="sk" style={{ position: "absolute", left: 100, top: 20, width: 190, height: 20, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 100, top: 48, width: 130, height: 14, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 16, top: 112, width: 348, height: 10, borderRadius: 5 }} /><span className="sk" style={{ position: "absolute", left: 16, top: 140, width: 90, height: 22, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 274, top: 134, width: 90, height: 36, borderRadius: 18 }} /></div>)
          : tab === 1
            ? (orders.length || bookings.length ? [bookings.length > 0 && (
                <section key="bk" className={`${s.books} rise`}>
                  <h2 className={s.booksTitle}>Алдағы жазылулар</h2>
                  <div className={s.bookList}>
                    {bookings.map((b) => (
                      <button key={b.id} className={s.bookRow} onClick={() => { haptic.tap(); go("/booking/" + b.id); }}>
                        <span className={s.oText}><b>{bookLabel(b.at)}</b><small>{b.service} • {b.master ?? b.venue}</small></span>
                        <span className={`t-cap1 ${s.bookChip}`}>Расталды</span>
                      </button>
                    ))}
                  </div>
                  <p className={`t-sub2 ${s.bookNote} infoBox`}>Ауыстыру немесе бас тарту үшін жазылуды ашып қара.<i>”</i></p>
                </section>
              ), orders.length > 0 && bookings.length > 0 && <p key="oh" className={`t-sub2 w-600 ${s.header}`}>Тапсырыстар<span> · {orders.length}</span></p>, ...orders.map((o, i) => (
                <button key={o.id} className={`${s.order} rise`} style={{ ["--i" as string]: i }} onClick={() => go("/orders/" + o.id)}>
                  <span className={s.oHead}><span className={s.oEmoji}><Emo e={o.emoji} size={40} /></span><span className={s.oText}><b>{o.title}</b><small>№{o.no} • {o.venue} • {o.time}</small></span></span>
                  <CopyCode code={o.code} className={s.oCode}><small>Кассирге айтатын код · басып көшір</small><b className="mono">{o.code}</b></CopyCode>
                </button>))] : <p className={`t-sub2 rise ${s.empty}`}>Белсенді жазылу жоқ. Шаштараз пакетінде «Жазылу» батырмасы бар.</p>)
          : tab === 2
            ? (acts.length ? (
                <section className={`${s.acts} rise`}>
                  {acts.map((a) => (
                    <div key={a.id} className={s.act} role="button" tabIndex={0} onClick={() => { if (getPack(a.packId)) go("/pack/" + a.packId); }}>
                      <Tile e={a.emoji} size={40} className={a.action === "renew" ? s.actOff : undefined} />
                      <span className={s.actText}><b>{a.title}</b><small>{a.sub}</small></span>
                      {a.action === "rated"
                        ? <span className={s.actStars}>★ {a.stars}</span>
                        : <button className={s.actBtn} onClick={(e) => { e.stopPropagation(); if (a.action === "rate") { haptic.medium(); setRating({ act: a, stars: 0 }); } else go(getPack(a.packId) ? "/rebuy/" + a.packId : "/offer/" + a.offerId); }}>{a.action === "rate" ? "Бағала" : "Қайта алу"}</button>}
                    </div>
                  ))}
                </section>
              ) : <p className={`t-sub2 rise ${s.empty}`}>Пайдаланған пакеттерің осында шығады</p>)
          : active.length
            ? [pending && (
                <section key="rate" className={`${s.rate} rise`}>
                  <div className={s.rateHead}>
                    <span className={s.rateText}><b>{`${pending.title.split(" · ")[0]} қалай болды?`}</b><small>{pending.sub.replace(" · ", "  •  ")}</small></span>
                    <button className={s.rateClose} aria-label="Жабу" onClick={() => { haptic.soft(); hideRate(pending.id); }}><img src={close} width={24} height={24} alt="" /></button>
                  </div>
                  <Stars value={0} onPick={(n) => { haptic.select(); setRating({ act: pending, stars: n }); }} />
                </section>
              ), ...active.map((p, i) => <PackCard key={p.id} pack={p} i={i} onUse={setUsing} hint={hint && i === 0} onHint={closeHint} />)]
            : <p className={`t-sub2 rise ${s.empty}`}>Белсенді пакет жоқ</p>}
      </main>}
      {using && <UseSheet pack={using} onClose={() => setUsing(null)} />}
      {rating && <RateSheet act={rating.act} initial={rating.stars} onClose={() => setRating(null)} />}
    </div>
  );
}
