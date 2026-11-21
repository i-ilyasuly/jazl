// Басты беттегі жарнамалық виджет: Telegram Wallet-тегі «Доход на SOL» сияқты сырғытылатын градиентті баннерлер.
import { useEffect, useRef, useState } from "react";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { Sticker, type StickerName } from "./Sticker";
import s from "./Promo.module.css";

const items = [
  { id: "save", title: "Пакетпен 30%-ға\nдейін үнемде", link: "Ұсыныстарды көру", duck: "money" as StickerName, cls: s.violet, to: "#offers" },
  { id: "gift", title: "Досыңа пакет\nсыйла", link: "Сыйлық жіберу", duck: "gift" as StickerName, cls: s.teal, to: "/profile/gifts" },
  { id: "map", title: "Жаныңдағы мекемелер\nкартада", link: "Картаны ашу", duck: "city" as StickerName, cls: s.blue, to: "/map" },
];

export function Promo() {
  const go = useGo();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  // Патша (2026-11-21): баннерлер өздігінен ауысады (4 с сайын, соңынан басына). Қолмен сырғытқанда — 8 с кідіреді.
  // Діріл тек қолмен ауыстырғанда болады.
  const touched = useRef(0);
  const onScroll = () => { const el = ref.current; if (!el) return; const i = Math.round(el.scrollLeft / (el.clientWidth - 24)); if (i !== at) { setAt(i); if (Date.now() - touched.current < 1500) haptic.select(); } };
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      const el = ref.current; if (!el || document.hidden || Date.now() - touched.current < 8000) return;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) return; // экраннан тыс — ауыстырмаймыз
      const card = el.firstElementChild as HTMLElement | null; if (!card) return;
      const step = card.offsetWidth + 12;
      const next = (Math.round(el.scrollLeft / step) + 1) % items.length;
      el.scrollTo({ left: next * step, behavior: "smooth" });
    }, 4000);
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
            <span className={s.duck}><Sticker name={x.duck} size={104} /></span>
            <i className={s.spark} /><i className={`${s.spark} ${s.spark2}`} />
          </button>
        ))}
      </div>
      <div className={s.dots}>{items.map((x, i) => <span key={x.id} className={i === at ? s.on : ""} />)}</div>
    </section>
  );
}
