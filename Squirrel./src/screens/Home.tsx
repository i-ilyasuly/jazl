import { useEffect, useMemo, useRef, useState } from "react";
import { categoryOffers, moreOffers, offers } from "../mocks/offers";
// Басты беттегі лента: негізгі + санат + қосымша ұсыныстар (мок; бэкендте — жақындығы мен жарнамасы бойынша сұрыпталған тізім)
const feed = [offers[0], categoryOffers[1], offers[1], moreOffers[1], offers[2], categoryOffers[3], moreOffers[0], categoryOffers[0], categoryOffers[2], categoryOffers[4]];
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { useSettings } from "../store";
import { haptic } from "../telegram";
import { HomeSkeleton } from "./HomeSkeleton";
import { OfferCard } from "../ui/OfferCard";
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/search.svg";
import geo from "../assets/icons/geo.svg";
import { SoonSheet } from "../ui/SoonSheet";
import { Promo } from "../ui/Promo";
import { Sticker } from "../ui/Sticker";
import { TgEmoji } from "../ui/TgEmoji";
import { BadgeIcon } from "../ui/BadgeIcon";
import { EmptyState } from "../ui/EmptyState";
import { discount } from "../mocks/offers";
import artFood from "../assets/tiles/food.webp";
import artCoffee from "../assets/tiles/coffee.webp";
import artHair from "../assets/tiles/hair.webp";
import s from "./Home.module.css";

const soon = [
  { pct: 30, fill: 44, venues: 2 },
  { pct: 20, fill: 30, venues: 1 },
  { pct: 15, fill: 22, venues: 1 },
];

// Сұрыптау (Патша, 2026-11-21, 8-тармақ). Бэкендте — сервер жағында сұрыпталып, беттеліп келеді.
const sorts = [
  // Патша (2026-11-21): иконкалардың орнына Telegram анимациялық эмодзилері
  // Түпкілікті таңдау (Патша, 2026-11-21, 09:32): Жақын 🫵, Арзан 🤑, Тиімді 👍, Жаңа 🥳.
  // Бет ашылғанда қимылдамайды — тек батырма басылғанда бір рет ойнайды.
  // Иконкалар режимінде (Патша, 2026-11-22) — карточка белгілерімен бір жүйедегі дөңгелек иконкалар (`icon`)
  { key: "near", label: "Жақын", emo: "you", icon: "near" },
  { key: "cheap", label: "Арзан", emo: "rich", icon: "cheap" },
  { key: "best", label: "Тиімді", emo: "thumbs", icon: "best" },
  { key: "new", label: "Жаңа", emo: "new", icon: "new" },
] as const;
type SortKey = (typeof sorts)[number]["key"];
const km = (d: string) => parseFloat(d.replace(",", ".")) || 99;
const PAGE = 10; // Алғашқыда ~10 ұсыныс қана жүктеледі, соңына жақындағанда келесі бет (9-тармақ)

export function Home() {
  const [sheet, setSheet] = useState<(typeof soon)[number] | null>(null);
  const go = useGo();
  const icons = useSettings().badgeStyle === "icon";
  const { data, loading } = useMock("home", feed);
  const [sort, setSort] = useState<SortKey>("near");
  const [count, setCount] = useState(PAGE);
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const [online, setOnline] = useState(() => navigator.onLine);
  const sentinel = useRef<HTMLDivElement>(null);
  const all = useMemo(() => {
    const list = [...(data ?? [])];
    if (sort === "near") list.sort((a, b) => km(a.distance) - km(b.distance));
    if (sort === "cheap") list.sort((a, b) => a.price - b.price);
    if (sort === "best") list.sort((a, b) => discount(b) - discount(a));
    if (sort === "new") list.reverse();
    return list;
  }, [data, sort]);
  const shown = all.slice(0, count);
  const done = count >= all.length;
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener("online", on); addEventListener("offline", off); return () => { removeEventListener("online", on); removeEventListener("offline", off); }; }, []);
  // Келесі бет: тізім соңынан ~2 карточка бұрын жүктеле бастайды — қолданушы күтпей скролдай береді
  const loadMore = () => {
    if (done || more === "loading") return;
    if (!navigator.onLine) return setMore("error");
    setMore("loading");
    setTimeout(() => { setCount((c) => c + PAGE); setMore("idle"); }, 500);
  };
  useEffect(() => {
    const el = sentinel.current; if (!el || done) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore(); }, { rootMargin: "0px 0px 500px 0px" });
    io.observe(el); return () => io.disconnect();
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading || !data) return <HomeSkeleton />;
  const [taps, setTaps] = useState<Partial<Record<SortKey, number>>>({}); // әр батырманың басылу саны → эмодзиі бір рет ойнайды
  const pickSort = (k: SortKey) => { setTaps((t) => ({ ...t, [k]: (t[k] ?? 0) + 1 })); if (k === sort) return; haptic.select(); setSort(k); setCount(PAGE); document.getElementById("offers")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <div className={s.page}>
      <div className="topVeil" aria-hidden />
      <button className="topSearch pinned" onClick={() => go("/search")} aria-label="Іздеу" style={{ viewTransitionName: "top-search" }}>
        <img src={searchIcon} alt="" /><span>Іздеу...</span>
      </button>
      <header className={s.top}>
        <TelegramChrome mode="close" />

        <button className={`${s.tile} ${s.food}`} onClick={() => go("/category/food")}>
          <span className={s.tileTitle}>Тағамдар</span>
          <img src={artFood} className={s.art} alt="" decoding="sync" draggable={false} />
        </button>
        <button className={`${s.tile} ${s.coffee}`} onClick={() => go("/category/coffee")}>
          <span className={s.tileTitle}>Кофе</span>
          <img src={artCoffee} className={s.art} alt="" decoding="sync" draggable={false} />
        </button>
        <button className={`${s.tile} ${s.hair}`} onClick={() => go("/category/hair")}>
          <span className={s.tileTitle}>Шаштараз</span>
          <img src={artHair} className={s.art} alt="" decoding="sync" draggable={false} />
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
        <div className={s.sorts} role="radiogroup" aria-label="Сұрыптау">
          {sorts.map((x) => (
            <button key={x.key} role="radio" aria-checked={sort === x.key} className={`${s.sort} ${sort === x.key ? s.sortOn : ""}`} onClick={() => pickSort(x.key)}>
              {icons ? <BadgeIcon name={x.icon} size={20} /> : <TgEmoji name={x.emo} size={22} tap play={taps[x.key] ?? 0} />}{x.label}
            </button>
          ))}
        </div>
        {!online && shown.length === 0 ? (
          <EmptyState inline sticker="offline" title="Интернет жоқ" text="Байланыс қалпына келгенде ұсыныстар өзі жүктеледі." action={{ text: "Қайта көру", onClick: () => { haptic.tap(); setOnline(navigator.onLine); } }} />
        ) : shown.length === 0 ? (
          <EmptyState inline sticker="search" title="Жақын маңда ұсыныс жоқ" text="Мекемелер жаңа пакет қосқанда бірінші болып көресің." action={{ text: "Картадан іздеу", onClick: () => go("/map") }} />
        ) : <>
          {shown.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: i % PAGE }}><OfferCard offer={o} /></div>)}
          <div ref={sentinel} className={s.sentinel} />
          {more === "loading" && <p className={s.loadingMore}><span className={s.spinner} aria-hidden />Жүктелуде…</p>}
          {more === "error" && <button className={s.retry} onClick={() => { haptic.tap(); setMore("idle"); loadMore(); }}>Желі нашар · Қайта жүктеу</button>}
          {done && (
            <div className={s.end}>
              <Sticker name="sleep" size={112} />
              <p className={s.endTitle}>Бүгінге ұсыныстар бітті</p>
              <p className={s.endText}>Ертең жаңалары қосылады — қайта кіріп тұр</p>
            </div>
          )}
        </>}
      </main>

      <button className={s.map} onClick={() => go("/map")}>
        <img src={geo} width={18} height={18} alt="" />
        <span>Картада</span>
      </button>
      {sheet && <SoonSheet pct={sheet.pct} venues={sheet.venues} onClose={() => setSheet(null)} />}
    </div>
  );
}
