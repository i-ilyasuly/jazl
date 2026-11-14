// Figma: «Іздеу / Сүзгі» 13886:16507 — Modal 412×516, астында Secondary «Тазалау» + Main «Көрсету · N»
import { useEffect, useMemo, useState } from "react";
import { fmt } from "../mocks/offers";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Switch } from "./SubPage";
import s from "./FilterSheet.module.css";

export interface Filters { cats: string[]; min: number; max: number; dist: number; save: number; open: boolean }
export const PRICE_MIN = 3000, PRICE_MAX = 12000;
export const noFilters: Filters = { cats: [], min: PRICE_MIN, max: PRICE_MAX, dist: 0, save: 0, open: false };
export const activeCount = (f: Filters) => (f.cats.length ? 1 : 0) + (f.min > PRICE_MIN || f.max < PRICE_MAX ? 1 : 0) + (f.dist ? 1 : 0) + (f.save ? 1 : 0) + (f.open ? 1 : 0);

const cats = [["food", "Тағам"], ["coffee", "Кофе"], ["hair", "Шаштараз"]];
const dists: [number, string][] = [[1, "1 км"], [3, "3 км"], [5, "5 км"], [0, "Барлығы"]];
const saves: [number, string][] = [[0, "Кез келген"], [10, "10%+"], [20, "20%+"]];

export function FilterSheet({ value, count, onApply, onClose }: { value: Filters; count: (f: Filters) => number; onApply: (f: Filters) => void; onClose: () => void }) {
  const [f, setF] = useState(value);
  const [closing, setClosing] = useState(false);
  const close = useMemo(() => () => { setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const n = count(f);
  const set = (p: Partial<Filters>) => { haptic.select(); setF({ ...f, ...p }); };
  const apply = useMemo(() => ({ text: `Көрсету · ${n}`, onClick: () => { haptic.tap(); onApply(f); close(); } }), [n, f, onApply, close]);
  const clear = useMemo(() => ({ text: "Тазалау", onClick: () => { haptic.tap(); setF(noFilters); }, position: "left" as const }), []);
  useBottomButtons(apply, clear, !closing);
  const lo = ((f.min - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100, hi = ((f.max - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet}>
        <span className={s.grabber} />
        <div className={s.head}><h2>Сүзгі</h2><button className="t-sub1 w-600" onClick={clear.onClick}>Тазалау</button></div>
        <section className={s.sec}>
          <h3 className="t-sub2 w-600">Санат</h3>
          <div className={s.chips}>{cats.map(([id, t]) => { const on = f.cats.includes(id); return <button key={id} className={`t-sub2 ${s.chip} ${on ? s.on : ""}`} onClick={() => set({ cats: on ? f.cats.filter((x) => x !== id) : [...f.cats, id] })}>{t}</button>; })}</div>
        </section>
        <section className={s.price}>
          <div className={s.priceHead}><h3 className="t-sub2 w-600">Бағасы</h3><b className="t-sub2 w-600">{fmt(f.min).replace(" ₸", "")} – {fmt(f.max)}</b></div>
          <div className={s.slider}>
            <span className={s.track} /><span className={s.range} style={{ left: `${lo}%`, right: `${100 - hi}%` }} />
            <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={500} value={f.min} onChange={(e) => setF({ ...f, min: Math.min(+e.target.value, f.max - 500) })} aria-label="Ең төмен баға" />
            <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={500} value={f.max} onChange={(e) => setF({ ...f, max: Math.max(+e.target.value, f.min + 500) })} aria-label="Ең жоғары баға" />
          </div>
        </section>
        <section className={s.sec}>
          <h3 className="t-sub2 w-600">Қашықтық</h3>
          <div className={s.chips}>{dists.map(([v, t]) => <button key={v} className={`t-sub2 ${s.chip} ${f.dist === v ? s.on : ""}`} onClick={() => set({ dist: v })}>{t}</button>)}</div>
        </section>
        <section className={s.sec}>
          <h3 className="t-sub2 w-600">Үнем</h3>
          <div className={s.chips}>{saves.map(([v, t]) => <button key={v} className={`t-sub2 ${s.chip} ${f.save === v ? s.on : ""}`} onClick={() => set({ save: v })}>{t}</button>)}</div>
        </section>
        <div className={s.toggle}><span>Тек ашық мекемелер</span><Switch on={f.open} onChange={(v) => setF({ ...f, open: v })} /></div>
        {!inTelegram && <div className={s.bar}><button className={`${s.btn} ${s.second}`} onClick={clear.onClick}>Тазалау</button><button className={`${s.btn} ${s.main}`} onClick={apply.onClick}><span key={n} className={s.swap}>Көрсету · {n}</span></button></div>}
      </div>
    </div>
  );
}
