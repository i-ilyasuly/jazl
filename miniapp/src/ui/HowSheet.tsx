// Figma: «Бірінші ашу / Қалай жұмыс істейді?» → Modal (Half Screen) 412×357
import { useEffect, useMemo, useState } from "react";
import { haptic, useBackButton } from "../telegram";
import s from "./HowSheet.module.css";

const steps = [
  ["#f3ead8", "1. Пакетті сатып ал", "Мекеме мен пакетті таңда, бір рет төле."],
  ["#e9e9ec", "2. Кассирге «Jazl бойынша» де", "Кассир бағаны терсін, терминалда QR шығады."],
  ["#e4f0e4", "3. Сканерле және төле", "Төменгі ортадағы батырмамен QR-ды оқы, пакетті таңда. Қалғанын Пакеттерімде көресің."],
];

export function HowSheet({ onClose }: { onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = useMemo(() => () => { haptic.soft(); setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet}>
        <span className={s.grabber} />
        <h2 className={s.title}>Қалай жұмыс істейді?</h2>
        {steps.map(([bg, t, sub], i) => (
          <div key={t} className={s.step} style={{ ["--i" as string]: i }}>
            <span className={s.slot} style={{ background: bg }} />
            <div className={s.text}><p className="t-sub1 w-600">{t}</p><p className={`t-cap1 ${s.sub}`}>{sub}</p></div>
          </div>
        ))}
        <button className={s.btn} onClick={close}>Түсінікті</button>
      </div>
    </div>
  );
}
