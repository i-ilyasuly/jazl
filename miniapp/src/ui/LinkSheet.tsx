// Figma: «Мекеме / Бағыт» 13886:22679, «Мекеме / Байланыс» 13886:23043, «Мекеме беті / Бағыт: 2ГИС» 13886:27429 → «Modal / Әрекеттер».
// Өлшемдер Telegram Mini Apps UI kit шкаласы мен 4/8px тор бойынша: шет 16, жол 60, атау 17/22, түсініктеме 15/20.
import { Emo } from "./Emo";
import { useEffect, useMemo, useState } from "react";
import { haptic, useBackButton } from "../telegram";
import chev from "../assets/icons/chevRight.svg";
import s from "./LinkSheet.module.css";

/** emoji — түссіз тақташадағы белгі; glyph + tint — түрлі түсті тақташадағы ақ белгіше (2ГИС: жасыл тақташа, ақ нүкте). */
export interface LinkRow { emoji?: string; glyph?: "pin"; tint?: string; title: string; sub: string; onClick: () => void; badge?: { text: string; ok: boolean } }

const Pin = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="9.5" r="2.5" stroke="#fff" strokeWidth="2" />
  </svg>
);

export function LinkSheet({ title, rows, onClose, note, extra, cancel = "Бас тарту" }: { title: string; rows: LinkRow[]; onClose: () => void; note?: string; extra?: { text: string; onClick: () => void }; cancel?: string }) {
  const [closing, setClosing] = useState(false);
  const close = useMemo(() => (after?: () => void) => { setClosing(true); setTimeout(() => { onClose(); after?.(); }, 200); }, [onClose]);
  useBackButton(() => close());
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={() => close()} />
      <div className={s.sheet}>
        <span className={s.grabber} />
        <h2 className={s.title}>{title}</h2>
        {note && <p className={`t-sub2 ${s.note}`}>{note}</p>}
        {rows.map((r, i) => (
          <button key={r.title} className={s.row} style={{ ["--i" as string]: i }} onClick={() => { haptic.tap(); close(r.onClick); }}>
            <span className={`${s.tile} ${r.glyph ? "keepIcon" : ""}`} style={r.tint ? { background: r.tint } : undefined}>{r.glyph === "pin" ? <Pin /> : <Emo e={r.emoji} size={30} />}</span>
            <span className={s.text}><b>{r.title}</b><small>{r.sub}</small></span>
            {r.badge ? <span className={`t-cap1 ${s.badge} ${r.badge.ok ? s.ok : ""}`}>{r.badge.text}</span> : <img src={chev} width={20} height={20} alt="" />}
          </button>
        ))}
        {extra && <button className={`${s.cancel} ${s.extra}`} onClick={() => { haptic.tap(); close(extra.onClick); }}>{extra.text}</button>}
        <button className={s.cancel} onClick={() => close()}>{cancel}</button>
      </div>
    </div>
  );
}
