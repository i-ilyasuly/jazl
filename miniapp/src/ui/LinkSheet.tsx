// Figma: «Мекеме / Бағыт» 13886:22679 және «Мекеме / Байланыс» 13886:23043 → «Modal / Әрекеттер»
import { useEffect, useMemo, useState } from "react";
import { haptic, useBackButton } from "../telegram";
import s from "./LinkSheet.module.css";

export interface LinkRow { emoji: string; title: string; sub: string; onClick: () => void }

export function LinkSheet({ title, rows, onClose }: { title: string; rows: LinkRow[]; onClose: () => void }) {
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
        {rows.map((r, i) => (
          <button key={r.title} className={s.row} style={{ ["--i" as string]: i }} onClick={() => { haptic.tap(); close(r.onClick); }}>
            <span className={s.emoji}>{r.emoji}</span>
            <span className={s.text}><b>{r.title}</b><small className="t-cap1">{r.sub}</small></span>
          </button>
        ))}
        <button className={s.cancel} onClick={() => close()}>Бас тарту</button>
      </div>
    </div>
  );
}
