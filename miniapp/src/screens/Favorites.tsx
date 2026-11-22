// Figma: «Таңдаулы» (13886:17711) және «Таңдаулы / Бос күй» (13886:17840)
import { useTabSwipe } from "../ui/useTabSwipe";
import { useCallback, useState } from "react";
import { endedOffers, offers } from "../mocks/offers";
import { useGo } from "../nav";
import { useFavs } from "../store";
import { haptic, useBackButton } from "../telegram";
import { EmptyState } from "../ui/EmptyState";
import { OfferCard } from "../ui/OfferCard";
import { TelegramChrome } from "../ui/TelegramChrome";
import searchIcon from "../assets/icons/search.svg";
import s from "./Favorites.module.css";

const sorts = ["Жуырдағы", "Арзан", "Жақын"];
const km = (d: string) => parseFloat(d.replace(",", "."));

export function Favorites() {
  const go = useGo();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const favs = useFavs();
  const [sort, setSort] = useState(0);
  const sw = useTabSwipe(sort, 3, (i) => { haptic.select(); setSort(i); }); // сұрыптауды да саусақпен ауыстыруға болады
  const order = <T extends { id: string; price: number; distance: string }>(list: T[]) =>
    [...list].sort((a, b) => (sort === 1 ? a.price - b.price : sort === 2 ? km(a.distance) - km(b.distance) : favs.indexOf(a.id) - favs.indexOf(b.id)));
  const live = order(offers.filter((o) => favs.includes(o.id)));
  const ended = order(endedOffers.filter((o) => favs.includes(o.id)));
  const total = live.length + ended.length;
  return (
    <div className={s.page}>
      <div className="topVeil" aria-hidden />
      <button className="topSearch pinned" onClick={() => go("/search")} aria-label="Іздеу">
          <img src={searchIcon} alt="" /><span>Іздеу...</span>
        </button>
      <header className={s.top}>
        <TelegramChrome mode="back" onBack={back} />
        <h1 className={s.title}>{`Таңдаулы${total ? ` · ${total}` : ""}`}</h1>
        <div className={s.seg}>
          <span className={s.thumb} style={{ translate: `${Math.max(0, Math.min(250.66, sort * 125.33 - (sw.drag / 380) * 125.33))}px 0` }} />
          {sorts.map((t, i) => <button key={t} className={`t-sub2 ${s.segBtn} ${sort === i ? s.on : ""}`} onClick={() => { if (sort !== i) { haptic.select(); setSort(i); } }}>{t}</button>)}
          <span className={s.divider} style={{ left: 252.67, opacity: sort === 0 ? 1 : 0 }} />
          <span className={s.divider} style={{ left: 127.33, opacity: sort === 2 ? 1 : 0 }} />
        </div>
      </header>
      {total === 0 ? (
        <EmptyState inline top={340} sticker="love" title="Әзірге таңдаулы жоқ" text={"Ұнаған ұсыныстың жүрегін басып,\nоны осында сақта"} action={{ text: "Ұсыныстарды көру", onClick: () => go("/", "fade") }} />
      ) : (
        <main className={s.list} {...sw.handlers} style={sw.style}>
          {live.length > 0 && <h2 className={`t-sub2 w-600 ${s.section}`} style={{ paddingTop: 12 }}><b>Қолжетімді</b> · {live.length}</h2>}
          {live.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: i }}><OfferCard offer={o} /></div>)}
          {ended.length > 0 && <h2 className={`t-sub2 w-600 ${s.section}`} style={{ paddingTop: live.length ? 16 : 12 }}><b>Аяқталған</b> · {ended.length}</h2>}
          {ended.map((o, i) => <div key={o.id} className="rise" style={{ ["--i" as string]: live.length + i }}><OfferCard offer={o} ended /></div>)}
        </main>
      )}
    </div>
  );
}
