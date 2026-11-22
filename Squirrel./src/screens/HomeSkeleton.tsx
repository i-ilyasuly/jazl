// Figma: «Жүктелу / Басты бет скелеті» (13886:15067). Өлшемдер кадрдан алынған.
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/search.svg";
import s from "./HomeSkeleton.module.css";

const top: [number, number, number, number, number][] = [
  [16, 108, 152, 244, 22], [180, 108, 216, 116, 22], [180, 236, 216, 116, 22],
  [16, 368, 148, 72, 16], [176, 368, 148, 72, 16], [336, 368, 148, 72, 16],
];
const card: [number, number, number, number, number][] = [
  [16, 18, 190, 20, 6], [16, 46, 120, 14, 6], [16, 70, 176, 100, 12], [274, 80, 90, 26, 8], [264, 120, 100, 24, 12],
];

export function HomeSkeleton() {
  return (
    <div className={s.page} aria-busy>
      <div className="topVeil" aria-hidden />
      <div className="topSearch pinned"><img src={searchIcon} alt="" /><span>Іздеу...</span></div>
      <header className={s.top}>
        <TelegramChrome mode="close" />
        
        {top.map(([x, y, w, hh, r], i) => <span key={i} className="sk" style={{ position: "absolute", left: x, top: y, width: w, height: hh, borderRadius: r }} />)}
      </header>
      {[472, 668].map((y) => (
        <div key={y} className={s.card} style={{ top: y }}>
          {card.map(([x, cy, w, hh, r], i) => <span key={i} className="sk" style={{ position: "absolute", left: x, top: cy, width: w, height: hh, borderRadius: r }} />)}
        </div>
      ))}
    </div>
  );
}
