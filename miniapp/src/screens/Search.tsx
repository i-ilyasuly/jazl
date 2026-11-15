// Figma: «Іздеу / Бос өріс» 13886:16263, «Нәтижелер» 13886:16389, «Сұрыптау» 13886:16731, «Табылмады» 13886:16891
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allOffers, discount, saving, type Offer } from "../mocks/offers";
import { useGo } from "../nav";
import { addRecent, clearRecent, removeRecent, useRecent } from "../store";
import { haptic, useBackButton } from "../telegram";
import { ActionSheet } from "../ui/ActionSheet";
import { activeCount, FilterSheet, noFilters, PRICE_MAX, type Filters } from "../ui/FilterSheet";
import { MainBar } from "../ui/MainBar";
import { OfferCard } from "../ui/OfferCard";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/search.svg";
import clock from "../assets/icons/sClock.svg";
import remove from "../assets/icons/sRemove.svg";
import sortIcon from "../assets/icons/sSort.svg";
import filterIcon from "../assets/icons/sFilter.svg";
import s from "./Search.module.css";

const popular = ["Донер", "Кофе", "Шаш қию", "Бургер", "Латте", "Комбо", "Көлік жуу"];
const sorts = [{ id: "near", text: "Қашықтық бойынша" }, { id: "cheap", text: "Бағасы төмен" }, { id: "save", text: "Үнемі көп" }, { id: "top", text: "Танымал" }, { id: "new", text: "Жаңа ұсыныстар" }];
const km = (o: Offer) => parseFloat(o.distance.replace(",", "."));
// Санат сөздері де ізделеді: «кофе» деп жазса латте шығады
const tags: Record<string, string> = { food: "тағам донер бургер комбо", coffee: "кофе латте", hair: "шаш қию шаштараз барбер" };
const match = (o: Offer, q: string) => `${o.title} ${o.venue} ${tags[o.kind]}`.toLowerCase().includes(q);

export function Search() {
  const go = useGo();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const recent = useRecent();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("near");
  const [sheet, setSheet] = useState(false);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const pass = useCallback((o: Offer, f: Filters) => (!f.cats.length || f.cats.includes(o.kind)) && o.price >= f.min && (f.max >= PRICE_MAX || o.price <= f.max) && (!f.dist || km(o) <= f.dist) && discount(o) >= f.save, []);
  const nFilters = activeCount(filters);
  const clearFilters = useCallback(() => { haptic.tap(); setFilters(noFilters); }, []);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const query = q.trim().toLowerCase();
  const found = useMemo(() => {
    const list = allOffers().filter((o) => match(o, query) && pass(o, filters));
    const by: Record<string, (a: Offer, b: Offer) => number> = { near: (a, b) => km(a) - km(b), cheap: (a, b) => a.price - b.price, save: (a, b) => saving(b) - saving(a), top: (a, b) => b.buyers - a.buyers, new: (a, b) => discount(b) - discount(a) };
    return list.sort(by[sort]);
  }, [query, sort, filters, pass]);
  // Нәтиже шыққан сұраныс 1,2 секундтан кейін «соңғы іздеулерге» түседі
  useEffect(() => { if (!query || !found.length) return; const t = setTimeout(() => addRecent(query), 1200); return () => clearTimeout(t); }, [query, found.length]);
  const venues = new Set(found.map((o) => o.venue)).size;
  const pick = (v: string) => { haptic.select(); setQ(v.toLowerCase()); };
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <label className="topSearch" style={{ viewTransitionName: "top-search" }}>
        <img src={searchIcon} alt="" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Іздеу..." enterKeyHint="search" autoCapitalize="none" autoCorrect="off" onKeyDown={(e) => { if (e.key === "Enter") { addRecent(query); input.current?.blur(); } }} />
      </label>
      {!query ? (
        <div className={s.body} key="idle">
          {recent.length > 0 && <>
            <div className={`${s.head} rise`}><h2 className="t-sub2 w-600">Соңғы іздеулер</h2><button className="t-sub2 w-600" onClick={() => { haptic.tap(); clearRecent(); }}>Тазалау</button></div>
            <div className={`${s.recent} rise`} style={{ ["--i" as string]: 1 }}>
              {recent.map((r) => (
                <div key={r} className={s.row}>
                  <button className={s.rowMain} onClick={() => pick(r)}><img src={clock} width={22} height={22} alt="" /><span>{r}</span></button>
                  <button className={s.rowDel} onClick={() => { haptic.tap(); removeRecent(r); }} aria-label="Өшіру"><img src={remove} width={18} height={18} alt="" /></button>
                </div>
              ))}
            </div>
          </>}
          <h2 className={`t-sub2 w-600 ${s.popTitle} rise`} style={{ ["--i" as string]: 2 }}>Танымал іздеулер</h2>
          <div className={`${s.chips} rise`} style={{ ["--i" as string]: 3 }}>
            {popular.map((p) => <button key={p} className={`t-sub2 w-600 ${s.chip}`} onClick={() => pick(p)}>{p}</button>)}
          </div>
        </div>
      ) : found.length ? (
        <div className={s.results} key="found">
          <div className={s.tools}>
            <button className={`t-sub2 w-600 ${s.tool}`} onClick={() => { haptic.tap(); setSheet(true); }}><img src={sortIcon} width={16} height={16} alt="" /><span key={sort} className={s.swap}>{sorts.find((x) => x.id === sort)!.text}</span></button>
            <button className={`t-sub2 w-600 ${s.tool} ${nFilters ? s.toolOn : ""}`} onClick={() => { haptic.tap(); setFilterOpen(true); }}><img src={filterIcon} width={16} height={16} alt="" className={nFilters ? "" : s.gray} />Сүзгі{nFilters ? ` · ${nFilters}` : ""}</button>
          </div>
          <p className={`t-cap1 ${s.count}`}>{found.length} ұсыныс • {venues} мекеме</p>
          <div className={s.list}>{found.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: i }}><OfferCard offer={o} /></div>)}</div>
        </div>
      ) : (
        <div className={s.none} key="none">
          <Sticker name="search" />
          <h2 className={s.noneTitle}>«{q.trim()}» бойынша ештеңе табылмады</h2>
          <p className={`t-sub2 ${s.noneText}`}>Емлесін тексеріп, басқа сөзбен іздеп көр немесе сүзгіні тазала</p>
          <p className={`t-sub2 ${s.suggest}`}>Мекемең жоқ па?<button className="w-600" onClick={() => go("/profile/venue")}>Бізге ұсын</button></p>
          {nFilters > 0 && !filterOpen && <MainBar text="Сүзгіні тазалау" onClick={clearFilters} />}
        </div>
      )}
      {filterOpen && <FilterSheet value={filters} count={(f) => allOffers().filter((o) => match(o, query) && pass(o, f)).length} onApply={setFilters} onClose={() => setFilterOpen(false)} />}
      {sheet && <ActionSheet custom title="Сұрыптау" actions={sorts} selected={sort} onClose={() => setSheet(false)} onPick={(id) => { haptic.select(); setSort(id); }} />}
    </div>
  );
}
