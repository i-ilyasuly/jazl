import { offers } from "../mocks/offers";
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { HomeSkeleton } from "./HomeSkeleton";
import { NavBar } from "../ui/NavBar";
import { OfferCard } from "../ui/OfferCard";
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/search.svg";
import catBurger from "../assets/icons/catBurger.svg";
import catCup from "../assets/icons/catCup.svg";
import catScissors from "../assets/icons/catScissors.svg";
import percent from "../assets/icons/percent.svg";
import plus16 from "../assets/icons/plus16.svg";
import plus18 from "../assets/icons/plus18.svg";
import ticket from "../assets/icons/ticket.svg";
import geo from "../assets/icons/geo.svg";
import s from "./Home.module.css";

const soon = [
  { pct: 30, fill: 44 },
  { pct: 20, fill: 30 },
  { pct: 15, fill: 22 },
];

export function Home() {
  const go = useGo();
  const { data, loading } = useMock("home", offers);
  if (loading || !data) return <HomeSkeleton />;
  return (
    <div className={s.page}>
      <header className={s.top}>
        <TelegramChrome mode="close" />
        <button className={s.searchHit} onClick={() => go("/search")} aria-label="Іздеу">
          <span className={s.search}>
            <img src={searchIcon} className={s.searchIcon} alt="" />
            <span className={`t-sub2 ${s.searchText}`}>Іздеу...</span>
          </span>
        </button>

        <button className={`${s.tile} ${s.food}`} onClick={() => go("/category/food")}>
          <span className={`t-text ${s.tileTitle}`}>Тағамдар</span>
          <img src={catBurger} style={{ left: 78, top: 106 }} width={64} height={64} alt="" />
          <img src={percent} style={{ left: 114, top: 18 }} alt="" />
          <img src={plus18} style={{ left: 104, top: 56 }} alt="" />
          <img src={plus16} style={{ left: 22, top: 90 }} alt="" />
          <img src={ticket} style={{ left: 19.3, top: 114.6 }} alt="" />
        </button>
        <button className={`${s.tile} ${s.coffee}`} onClick={() => go("/category/coffee")}>
          <span className={`t-text ${s.tileTitle}`}>Кофе</span>
          <img src={catCup} style={{ left: 156, top: 16 }} alt="" />
          <img src={plus16} style={{ left: 96, top: 16 }} alt="" />
          <img src={percent} style={{ left: 124, top: 40 }} alt="" />
        </button>
        <button className={`${s.tile} ${s.hair}`} onClick={() => go("/category/hair")}>
          <span className={`t-text ${s.tileTitle}`}>Шаштараз</span>
          <img src={catScissors} style={{ left: 156, top: 20 }} alt="" />
          <img src={plus16} style={{ left: 104, top: 18 }} alt="" />
          <img src={ticket} style={{ left: 127.2, top: 35.6, width: 22, height: 17.3 }} alt="" />
        </button>

        <div className={s.soonRow}>
          {soon.map((x, i) => (
            <button key={x.pct} className={s.soon} onClick={() => haptic.tap()}>
              <span className={s.soonFill} style={{ width: x.fill, animationDelay: `${0.15 + i * 0.08}s` }} />
              <span className={`t-sub2 w-600 ${s.soonLabel}`}>Жуырда</span>
              <span className={`t-title1 ${s.soonPct}`}>{x.pct}%</span>
            </button>
          ))}
        </div>
      </header>

      <main className={s.list}>
        {data.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: i }}><OfferCard offer={o} /></div>)}
      </main>

      <button className={s.map} onClick={() => go("/map")}>
        <img src={geo} width={18} height={18} alt="" />
        <span className="t-sub2 w-600">Картада</span>
      </button>
      <NavBar active="home" />
    </div>
  );
}
