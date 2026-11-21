// Басты беттегі жарнамалық виджет: Telegram Wallet-тегі «Доход на SOL» сияқты сырғытылатын градиентті баннерлер.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { Sticker, preloadSticker, type StickerName } from "./Sticker";
import { ActionSheet } from "./ActionSheet";
import { fmt, isEnded, offers } from "../mocks/offers";
import s from "./Promo.module.css";

const items = [
  { id: "save", title: "Пакетпен 30%-ға\nдейін үнемде", link: "Ұсыныстарды көру", duck: "bags" as StickerName, cls: s.violet, to: "#offers" },
  { id: "gift", title: "Досыңа пакет\nсыйла", link: "Сыйлық жіберу", duck: "gift" as StickerName, cls: s.teal, to: "@gift" },
  { id: "map", title: "Жаныңдағы мекемелер\nкартада", link: "Картаны ашу", duck: "city" as StickerName, cls: s.blue, to: "/map" },
];

// Баннер үйректері (Патша, 2026-11-21): басты бет салынбай тұрып-ақ фонда жүктеле бастайды — баннер көрінгенде орны бос тұрмайды.
// Бұдан кейін service worker оларды телефонда сақтайды: келесі ашылғанда желіден жүктелмейді.
for (const x of items) void preloadSticker(x.duck).catch(() => null);

export function Promo() {
  const go = useGo();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  // Патша (2026-11-21): баннерлер өздігінен ауысады (8 с сайын). Қолмен сырғытқанда — 10 с кідіреді.
  // Шексіз айналым: соңында біріншінің көшірмесі тұрады. 3-тен кейін әдеттегідей алға жылжып көшірмеге келеді де,
  // байқатпай нағыз біріншіге секіреді — артқа қарай зымырап қайтпайды. Діріл тек қолмен ауыстырғанда.
  const touched = useRef(0);
  // Келе жатқан баннер сол жаққа жеткенде серіппедей сәл асып барып, кері оралады (Патша, 2026-11-21).
  // Скролл-снап анимация кезінде өшіріледі, әйтпесе браузер оны өз орнына тартып, серіппе көрінбейді.
  const slide = (el: HTMLDivElement, to: number) => {
    const from = el.scrollLeft, d = to - from, T = 900, t0 = performance.now();
    const spring = (x: number) => 1 - Math.exp(-7 * x) * Math.cos(8 * x); // ~6% (≈25 px) асып барып, тынышталады
    el.style.scrollSnapType = "none";
    const tick = (now: number) => {
      const x = Math.min(1, (now - t0) / T);
      el.scrollLeft = from + d * (x < 1 ? spring(x) : 1);
      if (x < 1 && Date.now() - touched.current > 300) requestAnimationFrame(tick); else { el.style.scrollSnapType = ""; onScroll(); }
    };
    requestAnimationFrame(tick);
  };
  const step = () => { const c = ref.current?.firstElementChild as HTMLElement | null; return c ? c.offsetWidth + 12 : 1; };
  const settle = useRef(0);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const raw = Math.round(el.scrollLeft / step());
    const i = raw % items.length;
    if (i !== at) { setAt(i); if (Date.now() - touched.current < 1500) haptic.select(); }
    // Көшірмеге тоқтаса — нағыз біріншіге анимациясыз ауысамыз (сырғу біткен соң)
    window.clearTimeout(settle.current);
    if (raw >= items.length) settle.current = window.setTimeout(() => { const e = ref.current; if (e && Math.round(e.scrollLeft / step()) >= items.length) e.scrollTo({ left: e.scrollLeft - items.length * step(), behavior: "instant" as ScrollBehavior }); }, 140);
  };
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      const el = ref.current; if (!el || document.hidden || Date.now() - touched.current < 10000) return;
      const r = el.getBoundingClientRect(); const vis = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0); if (vis < r.height * 0.5) return; // жартысы көрінбесе — ауыстырмаймыз (Патша, 2026-11-21)
      const next = Math.min(Math.round(el.scrollLeft / step()) + 1, items.length);
      slide(el, next * step());
    }, 8000); // Патша (2026-11-21): 8 с сайын
    return () => window.clearInterval(t);
  }, []);
  const touch = () => { touched.current = Date.now(); };
  // Патша (2026-11-21): «Досыңа пакет сыйла» — бірден сыйлайтын пакетті таңдау (бұрын сыйлықтар тарихы ашылатын, бұл қисынсыз)
  const [giftPick, setGiftPick] = useState(false);
  const open = (to: string) => {
    haptic.tap();
    if (to === "@gift") { setGiftPick(true); return; }
    if (to.startsWith("#")) document.getElementById(to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    else go(to);
  };
  return (
    <section className={`${s.wrap} rise`} style={{ ["--i" as string]: 0 }}>
      <div ref={ref} className={s.track} onScroll={onScroll} onPointerDown={touch} onTouchStart={touch} onWheel={touch}>
        {items.map((x) => (
          <button key={x.id} className={`${s.card} ${x.cls}`} onClick={() => open(x.to)}>
            <span className={s.title}>{x.title}</span>
            <span className={s.link}>{x.link} ›</span>
            <span className={s.duck}><Sticker name={x.duck} size={140} /></span>
            <i className={s.spark} /><i className={`${s.spark} ${s.spark2}`} />
          </button>
        ))}
        {/* Шексіз айналымға арналған біріншінің көшірмесі (экран оқитын құралдарға көрінбейді) */}
        <button aria-hidden tabIndex={-1} className={`${s.card} ${items[0].cls}`} onClick={() => open(items[0].to)}>
          <span className={s.title}>{items[0].title}</span>
          <span className={s.link}>{items[0].link} ›</span>
          <span className={s.duck}><Sticker name={items[0].duck} size={140} /></span>
          <i className={s.spark} /><i className={`${s.spark} ${s.spark2}`} />
        </button>
      </div>
      {giftPick && createPortal(
        <ActionSheet custom title="Қай пакетті сыйлайсың?"
          actions={[...offers.filter((o) => !isEnded(o.id)).slice(0, 5).map((o) => ({ id: o.id, text: `${o.packName ?? o.title} · ${fmt(o.price)}` })), { id: "@all", text: "Барлық ұсыныстар" }]}
          onClose={() => setGiftPick(false)}
          onPick={(id) => { if (id === "@all") document.getElementById("offers")?.scrollIntoView({ behavior: "smooth", block: "start" }); else go("/gift/" + id, "up"); }} />, document.body,
      )}
      <div className={s.dots}>{items.map((x, i) => <span key={x.id} className={i === at ? s.on : ""} />)}</div>
    </section>
  );
}
