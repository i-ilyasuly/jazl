// «Клиент көретін көрініс» (Патша, 2026-11-25): клиент лентада көретін карточка және оны басқанда ашылатын бет —
// екеуі де клиент қосымшасындағы нағыз компоненттер (OfferCard, OfferPreview), сырғытып ауысады.
// Мекеме формасында (тірі түрде) және модерацияда бірдей қолданылады. Ішіндегі батырмалар басылмайды.
import { useEffect, useRef, useState } from "react";
import type { Offer } from "../mocks/offers";
import { OfferCard } from "./OfferCard";
import { OfferPreview } from "../screens/Offer";
import { haptic } from "../telegram";
import s from "./ClientPreview.module.css";

export function ClientPreview({ offer, start = 0 }: { offer: Offer; start?: 0 | 1 }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<number>(start);
  const show = (i: number, smooth = true) => { const el = ref.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" }); };
  useEffect(() => { if (start) show(start, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={s.root}>
      <div className={s.seg} role="tablist">
        {["Карточка", "Ашылған беті"].map((t, i) => (
          <button key={t} role="tab" aria-selected={at === i} className={`${s.segBtn} ${at === i ? s.segOn : ""}`} onClick={() => { haptic.select(); show(i); }}>{t}</button>
        ))}
      </div>
      <div ref={ref} className={s.pager} onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== at) { setAt(i); haptic.select(); } }}>
        <div className={s.slide}>
          <div className={s.cardBox}>
            <div className={s.still} inert aria-hidden><OfferCard offer={offer} /></div>
            <button className={s.tap} aria-label="Ашылған бетін көру" onClick={() => { haptic.tap(); show(1); }} />
          </div>
          <p className={s.hint}>Клиент лентада осылай көреді. Басыңыз не солға сырғытыңыз — ашылған беті.</p>
        </div>
        <div className={s.slide}>
          <div className={s.detail}><div className={s.still} inert aria-hidden><OfferPreview offer={offer} /></div></div>
        </div>
      </div>
    </div>
  );
}
