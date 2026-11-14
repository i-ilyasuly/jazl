// Figma: «Жүктелу / Басты бет скелеті» (13886:15067). Өлшемдер кадрдан алынған.
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/search.svg";
import h from "./Home.module.css";
import s from "./HomeSkeleton.module.css";

const top: [number, number, number, number, number][] = [
  [16, 156, 152, 180, 20], [180, 156, 216, 84, 20], [180, 252, 216, 84, 20],
  [16, 352, 148, 72, 16], [176, 352, 148, 72, 16], [336, 352, 148, 72, 16],
];
const card: [number, number, number, number, number][] = [
  [16, 18, 190, 20, 6], [16, 46, 120, 14, 6], [16, 70, 176, 100, 12], [274, 80, 90, 26, 8], [264, 120, 100, 24, 12],
];

export function HomeSkeleton() {
  return (
    <div className={s.page} aria-busy>
      <header className={s.top}>
        <TelegramChrome mode="close" />
        <div className={h.searchHit}><span className={h.search}><img src={searchIcon} className={h.searchIcon} alt="" /><span className={`t-sub2 ${h.searchText}`}>Іздеу...</span></span></div>
        {top.map(([x, y, w, hh, r], i) => <span key={i} className="sk" style={{ position: "absolute", left: x, top: y, width: w, height: hh, borderRadius: r }} />)}
      </header>
      {[396, 592].map((y) => (
        <div key={y} className={s.card} style={{ top: y }}>
          {card.map(([x, cy, w, hh, r], i) => <span key={i} className="sk" style={{ position: "absolute", left: x, top: cy, width: w, height: hh, borderRadius: r }} />)}
        </div>
      ))}
    </div>
  );
}
