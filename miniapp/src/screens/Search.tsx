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
import { track } from "../track";
import searchIcon from "../assets/icons/search.svg";
import clock from "../assets/icons/sClock.svg";
import remove from "../assets/icons/sRemove.svg";
import sortIcon from "../assets/icons/sSort.svg";
import filterIcon from "../assets/icons/sFilter.svg";
import { score } from "../search";
import s from "./Search.module.css";

const popular = ["Донер", "Кофе", "Шаш қию", "Бургер", "Латте", "Комбо", "Көлік жуу"];
const sorts = [{ id: "rel", text: "Сәйкестігі бойынша" }, { id: "near", text: "Қашықтық бойынша" }, { id: "cheap", text: "Бағасы төмен" }, { id: "save", text: "Үнемі көп" }, { id: "top", text: "Танымал" }, { id: "new", text: "Жаңа ұсыныстар" }];
const km = (o: Offer) => parseFloat(o.distance.replace(",", "."));
// Іздеу (search.ts): пакет атауы, тауар, санат, құрам, мекеме — екі тілде, қазақ әріптері бірдейленеді
const match = (o: Offer, q: string) => score(o, q) > 0;

export function Search() {
  const go = useGo();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const recent = useRecent();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("rel");
  const [sheet, setSheet] = useState(false);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const pass = useCallback((o: Offer, f: Filters) => (!f.cats.length || f.cats.includes(o.kind)) && o.price >= f.min && (f.max >= PRICE_MAX || o.price <= f.max) && (!f.dist || km(o) <= f.dist) && discount(o) >= f.save, []);
  const nFilters = activeCount(filters);
  const clearFilters = useCallback(() => { haptic.soft(); setFilters(noFilters); }, []);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const query = q.trim().toLowerCase();
  const found = useMemo(() => {
    const sc = new Map(allOffers().map((o) => [o.id, score(o, query)]));
    const list = allOffers().filter((o) => (sc.get(o.id) ?? 0) > 0 && pass(o, filters));
    const by: Record<string, (a: Offer, b: Offer) => number> = { rel: (a, b) => (sc.get(b.id) ?? 0) - (sc.get(a.id) ?? 0) || km(a) - km(b), near: (a, b) => km(a) - km(b), cheap: (a, b) => a.price - b.price, save: (a, b) => saving(b) - saving(a), top: (a, b) => b.buyers - a.buyers, new: (a, b) => discount(b) - discount(a) };
    return list.sort(by[sort]);
  }, [query, sort, filters, pass]);
  // Нәтиже шыққан сұраныс 1,2 секундтан кейін «соңғы іздеулерге» түседі
  useEffect(() => { if (!query || !found.length) return; const t = setTimeout(() => addRecent(query), 1200); return () => clearTimeout(t); }, [query, found.length]);
  // Сұраныс метрикасы: адам не іздейді, нені таппайды (1,5 с тоқтаған соң бір рет; тек сұраныс мәтіні мен нәтиже саны)
  useEffect(() => { if (query.length < 2) return; const t = setTimeout(() => track("search", query.slice(0, 40), { n: found.length }), 1500); return () => clearTimeout(t); }, [query, found.length]);
  const venues = new Set(found.map((o) => o.venue)).size;
  const pick = (v: string) => { haptic.select(); setQ(v.toLowerCase()); };
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <div className="topVeil" aria-hidden />
      <label className="topSearch pinned" style={{ viewTransitionName: "top-search" }}>
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
          {/* Патша (2026-11-21, 9): бос орынның орнында — жақын маңдағы танымал ұсыныстар */}
          <h2 className={`t-sub2 w-600 ${s.popTitle} ${s.nearTitle} rise`} style={{ ["--i" as string]: 4 }}>Жақын маңда танымал</h2>
          <div className={`${s.list} ${s.nearList}`}>
            {[...allOffers()].sort((a, b) => b.buyers - a.buyers).slice(0, 4).map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: 5 + i }}><OfferCard offer={o} /></div>)}
          </div>
        </div>
      ) : found.length ? (
        <div className={s.results} key="found">
          <div className={s.tools}>
            <button className={`t-sub2 w-600 ${s.tool}`} onClick={() => { haptic.tap(); setSheet(true); }}><img src={sortIcon} width={16} height={16} alt="" /><span key={sort} className={s.swap}>{sorts.find((x) => x.id === sort)!.text}</span></button>
            <button className={`t-sub2 w-600 ${s.tool} ${nFilters ? s.toolOn : ""}`} onClick={() => { haptic.tap(); setFilterOpen(true); }}><img src={filterIcon} width={16} height={16} alt="" className={nFilters ? "" : s.gray} />Сүзгі{nFilters ? ` · ${nFilters}` : ""}</button>
          </div>
          <p className={`t-cap1 ${s.count}`}>{`${found.length} ұсыныс • ${venues} мекеме`}</p>
          <div className={s.list}>{found.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: i }}><OfferCard offer={o} highlight={query} /></div>)}</div>
        </div>
      ) : (
        <div className={s.none} key="none">
          <Sticker name="search" />
          <h2 className={s.noneTitle}>{`«${q.trim()}» бойынша ештеңе табылмады`}</h2>
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
