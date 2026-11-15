import { useState } from "react";
import { offers } from "../mocks/offers";
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { HomeSkeleton } from "./HomeSkeleton";
import { OfferCard } from "../ui/OfferCard";
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/search.svg";
import geo from "../assets/icons/geo.svg";
import { SoonSheet } from "../ui/SoonSheet";
import { Promo } from "../ui/Promo";
import artFood from "../assets/tiles/food.webp";
import artCoffee from "../assets/tiles/coffee.webp";
import artHair from "../assets/tiles/hair.webp";
import s from "./Home.module.css";

const soon = [
  { pct: 30, fill: 44, venues: 2 },
  { pct: 20, fill: 30, venues: 1 },
  { pct: 15, fill: 22, venues: 1 },
];

export function Home() {
  const [sheet, setSheet] = useState<(typeof soon)[number] | null>(null);
  const go = useGo();
  const { data, loading } = useMock("home", offers);
  if (loading || !data) return <HomeSkeleton />;
  return (
    <div className={s.page}>
      <button className="topSearch" onClick={() => go("/search")} aria-label="Іздеу" style={{ viewTransitionName: "top-search" }}>
        <img src={searchIcon} alt="" /><span>Іздеу...</span>
      </button>
      <header className={s.top}>
        <TelegramChrome mode="close" />

        <button className={`${s.tile} ${s.food}`} onClick={() => go("/category/food")}>
          <span className={s.tileTitle}>Тағамдар</span>
          <img src={artFood} className={s.art} alt="" />
        </button>
        <button className={`${s.tile} ${s.coffee}`} onClick={() => go("/category/coffee")}>
          <span className={s.tileTitle}>Кофе</span>
          <img src={artCoffee} className={s.art} alt="" />
        </button>
        <button className={`${s.tile} ${s.hair}`} onClick={() => go("/category/hair")}>
          <span className={s.tileTitle}>Шаштараз</span>
          <img src={artHair} className={s.art} alt="" />
        </button>

        <div className={s.soonRow}>
          {soon.map((x, i) => (
            <button key={x.pct} className={s.soon} onClick={() => { haptic.tap(); setSheet(x); }}>
              <span className={s.soonFill} style={{ width: x.fill, animationDelay: `${0.15 + i * 0.08}s` }} />
              <span className={s.soonLabel}>Жуырда</span>
              <span className={s.soonPct}>{x.pct}%</span>
            </button>
          ))}
        </div>
      </header>

      <main className={s.list}>
        <Promo />
        <h2 id="offers" className={s.listTitle}>Ұсыныстар</h2>
        {data.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: i }}><OfferCard offer={o} /></div>)}
      </main>

      <button className={s.map} onClick={() => go("/map")}>
        <img src={geo} width={18} height={18} alt="" />
        <span>Картада</span>
      </button>
      {sheet && <SoonSheet pct={sheet.pct} venues={sheet.venues} onClose={() => setSheet(null)} />}
    </div>
  );
}
