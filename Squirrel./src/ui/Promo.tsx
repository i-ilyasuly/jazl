// Басты беттегі жарнамалық виджет: Telegram Wallet-тегі «Доход на SOL» сияқты сырғытылатын градиентті баннерлер.
import { useEffect, useRef, useState } from "react";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { Sticker, preloadSticker, type StickerName } from "./Sticker";
import s from "./Promo.module.css";

const items = [
  { id: "save", title: "Пакетпен 30%-ға\nдейін үнемде", link: "Ұсыныстарды көру", duck: "bags" as StickerName, cls: s.violet, to: "#offers" },
  { id: "gift", title: "Досыңа пакет\nсыйла", link: "Сыйлық жіберу", duck: "gift" as StickerName, cls: s.teal, to: "/profile/gifts" },
  { id: "map", title: "Жаныңдағы мекемелер\nкартада", link: "Картаны ашу", duck: "city" as StickerName, cls: s.blue, to: "/map" },
];

// Баннер үйректері (Патша, 2026-11-21): басты бет салынбай тұрып-ақ фонда жүктеле бастайды — баннер көрінгенде орны бос тұрмайды.
// Бұдан кейін service worker оларды телефонда сақтайды: келесі ашылғанда желіден жүктелмейді.
for (const x of items) void preloadSticker(x.duck).catch(() => null);

export function Promo() {
  const go = useGo();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  // Патша (2026-11-21): баннерлер өздігінен ауысады (5 с сайын). Қолмен сырғытқанда — 10 с кідіреді.
  // Шексіз айналым: соңында біріншінің көшірмесі тұрады. 3-тен кейін әдеттегідей алға жылжып көшірмеге келеді де,
  // байқатпай нағыз біріншіге секіреді — артқа қарай зымырап қайтпайды. Діріл тек қолмен ауыстырғанда.
  const touched = useRef(0);
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
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) return; // экраннан тыс — ауыстырмаймыз
      const next = Math.min(Math.round(el.scrollLeft / step()) + 1, items.length);
      el.scrollTo({ left: next * step(), behavior: "smooth" });
    }, 5000);
    return () => window.clearInterval(t);
  }, []);
  const touch = () => { touched.current = Date.now(); };
  const open = (to: string) => {
    haptic.tap();
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
      <div className={s.dots}>{items.map((x, i) => <span key={x.id} className={i === at ? s.on : ""} />)}</div>
    </section>
  );
}
