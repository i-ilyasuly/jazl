// Figma, «03 · Іздеу және санаттар»: «Санат беті / Кофе» 13886:16943, «Кофе (айналдырылған)» 13886:17139,
// «Тағамдар» 13886:17339, «Шаш алу (бір мекеме)» 13886:17543
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { categoryOffers, discount, type Offer, type OfferKind } from "../mocks/offers";
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { useFavs } from "../store";
import { haptic, useBackButton } from "../telegram";
import { activeCount, FilterSheet, noFilters, PRICE_MAX, type Filters } from "../ui/FilterSheet";
import { OfferCard } from "../ui/OfferCard";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/cSearch.svg";
import filterIcon from "../assets/icons/cFilter.svg";
import nearIcon from "../assets/icons/cNear.svg";
import favIcon from "../assets/icons/cFav.svg";
import geo from "../assets/icons/geo.svg";
import s from "./Category.module.css";

const cats: Record<OfferKind, { title: string; hint: string; subs: [string, string, string][] }> = {
  coffee: { title: "Кофе", hint: "Кофехана немесе сусын іздеу", subs: [["☕", "Американо", "американо"], ["🍵", "Капучино", "капучино"], ["🥛", "Латте", "латте"], ["🍮", "Раф", "раф"]] },
  food: { title: "Тағамдар", hint: "Тағам немесе мекеме іздеу", subs: [["🍔", "Бургер", "бургер"], ["🍕", "Пицца", "пицца"], ["🌯", "Донер", "донер"], ["☕", "Кофе", "кофе"], ["🍣", "Суши", "суши"]] },
  hair: { title: "Шаш алу", hint: "Салон немесе шебер іздеу", subs: [["💈", "Ерлерге", "ерлер"], ["✂️", "Әйелдерге", "әйел"], ["🧒", "Балаларға", "бала"], ["🧔", "Сақал", "сақал"]] },
};
const km = (o: Offer) => parseFloat(o.distance.replace(",", "."));

// Санат ауысқанда іздеу мен сүзгі күйі қалып қоймауы үшін бет санат бойынша қайта құрылады
export function Category() {
  const k = useParams().kind as OfferKind;
  const kind = k in cats ? k : "food";
  return <CategoryPage key={kind} kind={kind} />;
}

function CategoryPage({ kind }: { kind: OfferKind }) {
  const go = useGo();
  const c = cats[kind];
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const { loading } = useMock("cat-" + kind, true, 450);
  const favs = useFavs();
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("");
  const [near, setNear] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 44); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  const pass = useCallback((o: Offer, f: Filters) => o.price >= f.min && (f.max >= PRICE_MAX || o.price <= f.max) && (!f.dist || km(o) <= f.dist) && discount(o) >= f.save, []);
  const base = useMemo(() => categoryOffers.filter((o) => o.kind === kind), [kind]);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const l = base.filter((o) => (!query || `${o.title} ${o.venue}`.toLowerCase().includes(query)) && (!sub || o.title.toLowerCase().includes(sub)) && (!onlyFav || favs.includes(o.id)) && pass(o, filters));
    return near ? [...l].sort((a, b) => km(a) - km(b)) : l;
  }, [base, q, sub, near, onlyFav, favs, filters, pass]);
  const nFilters = activeCount(filters);
  const reset = () => { haptic.soft(); setQ(""); setSub(""); setOnlyFav(false); setFilters(noFilters); };
  return (
    <div className={s.page}>
      {/* Айналдырғанда пайда болатын әйнек жолақ (Figma: «Жоғарғы жолақ» 412×92, ақ 95%) */}
      <div className={`${s.bar} ${scrolled ? s.barOn : ""}`}><span className={s.barTitle}>{c.title}</span></div>
      <TelegramChrome mode="back" onBack={back} />
      <div className={s.body}>
        <h1 className={`${s.h1} rise`}>{c.title}</h1>
        <label className={`${s.search} rise`} style={{ ["--i" as string]: 1 }}>
          <img src={searchIcon} width={20} height={20} alt="" />
          <input className="t-sub1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.hint} enterKeyHint="search" />
        </label>
        <div className={`${s.subs} rise`} style={{ ["--i" as string]: 2 }}>
          {c.subs.map(([e, t, key]) => (
            <button key={t} className={`${s.sub} ${sub === key ? s.subOn : ""}`} onClick={() => { haptic.select(); setSub(sub === key ? "" : key); }}>
              <span className={s.subTile}><i>{e}</i></span><span className="t-sub2 w-600">{t}</span>
            </button>
          ))}
        </div>
        <div className={`${s.chips} rise`} style={{ ["--i" as string]: 3 }}>
          <button className={`t-sub2 w-600 ${s.chip} ${nFilters ? s.chipOn : ""}`} onClick={() => { haptic.tap(); setFilterOpen(true); }}><img src={filterIcon} width={18} height={18} alt="" />Сүзгі</button>
          <button className={`t-sub2 w-600 ${s.chip} ${near ? s.chipOn : ""}`} onClick={() => { haptic.select(); setNear(!near); }}><img src={nearIcon} width={18} height={18} alt="" />Жақын</button>
          <button className={`t-sub2 w-600 ${s.chip} ${onlyFav ? s.chipOn : ""}`} onClick={() => { haptic.select(); setOnlyFav(!onlyFav); }}><img src={favIcon} width={18} height={18} alt="" />Таңдаулы</button>
        </div>
        <h2 className={`${s.h2} rise`} style={{ ["--i" as string]: 4 }}>Ұсыныстар</h2>
        {loading
          ? [0, 1].map((i) => <div key={i} className={`sk ${s.skCard}`} />)
          : list.length
            ? list.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: 5 + i }}><OfferCard offer={o} /></div>)
            : <div className={s.none}><Sticker name="search" /><p className={s.noneTitle}>Ештеңе табылмады</p><button className="t-sub2 w-600" onClick={reset}>Сүзгіні тазалау</button></div>}
      </div>
      <button className={s.map} onClick={() => go("/map")}><img src={geo} width={18} height={18} alt="" /><span className="t-sub2 w-600">Картада</span></button>
      {filterOpen && <FilterSheet value={filters} count={(f) => base.filter((o) => pass(o, f)).length} onApply={setFilters} onClose={() => setFilterOpen(false)} />}
    </div>
  );
}
