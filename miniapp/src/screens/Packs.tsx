// Figma: «Пакеттерім (жаңа навигация) / Light» (13905:8147)
import { useState } from "react";
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { useGo } from "../nav";
import { offerOf, usePacks, type Pack } from "../store";
import { haptic } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Timeline } from "../ui/Timeline";
import searchIcon from "../assets/icons/search.svg";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import h from "./Home.module.css";
import s from "./Packs.module.css";

const icon = { food: burger, coffee: burger, hair: scissors };

function PackCard({ pack, i }: { pack: Pack; i: number }) {
  const go = useGo();
  const o = offerOf(pack);
  const soon = pack.daysLeft <= 3;
  return (
    <article className={`${s.card} rise`} style={{ ["--i" as string]: i }} onClick={() => go("/pack/" + pack.id)}>
      <div className={s.info}>
        <span className={s.thumb}><img src={icon[o.kind]} width={48} height={48} alt="" /></span>
        <div className={s.text}>
          <p className="t-headline">{o.title}</p>
          <p className={`t-sub2 ${s.sub}`}>{o.venue} · {o.distance}</p>
          <span className={`t-cap1 ${s.days} ${soon ? s.daysSoon : ""}`}>{pack.daysLeft} күн қалды</span>
        </div>
      </div>
      <hr className={s.sep} />
      <Timeline total={pack.total} used={pack.total - pack.left} warn={soon} width={348} />
      <div className={s.bottom}>
        <p className={s.left}><span className="t-sub1 w-600">{pack.left} / {pack.total}</span><span className={`t-sub2 ${s.sub}`}>қалды</span></p>
        <button className={`t-sub2 w-600 ${s.use}`} disabled={pack.left < 1} onClick={(e) => { e.stopPropagation(); go("/scan?pack=" + pack.id, "up"); }}>Қолдану</button>
      </div>
      {soon && (
        <div className={s.renew}>
          <span className={s.renewBar} />
          <p className={`t-cap1 ${s.renewText}`}>Қайта алсаң, қалған бірлік <b>келесі айға көшеді</b></p>
          <button className={`t-sub2 w-600 ${s.renewBtn}`} onClick={(e) => { e.stopPropagation(); go("/offer/" + o.id); }}>Қайта алу</button>
        </div>
      )}
      {soon && <span className={s.quoteMark} aria-hidden>”</span>}
    </article>
  );
}

export function Packs() {
  const go = useGo();
  const all = usePacks();
  const packs = demoEmpty() ? [] : all;
  const [tab, setTab] = useState(0);
  const { loading } = useMock("packs", packs, 500);
  const active = packs.filter((p) => p.left > 0);
  const done = packs.filter((p) => p.left < 1);
  const list = tab === 0 ? active : done;
  return (
    <div className={s.page}>
      <header className={s.top}>
        <TelegramChrome mode="close" />
        <div className={h.searchHit}><span className={h.search}><img src={searchIcon} className={h.searchIcon} alt="" /><span className={`t-sub2 ${h.searchText}`}>Іздеу...</span></span></div>
        <div className={s.seg}>
          <span className={s.segThumb} style={{ transform: `translateX(${tab * 188}px)` }} />
          {["Белсенді", "Тарих"].map((t, i) => (
            <button key={t} className={`t-cap1 ${s.segBtn} ${tab === i ? s.segOn : ""}`} onClick={() => { haptic.select(); setTab(i); }}>{t}</button>
          ))}
        </div>
      </header>
      {!loading && packs.length === 0 ? (
        <EmptyState inline sticker="shop" title="Әзірге пакет жоқ" text={"Пакет сатып алсаң, мекемеде\nсканерлеп қолданасың"} action={{ text: "Ұсыныстарды көру", onClick: () => go("/", "fade") }} />
      ) : <main className={s.list} key={tab}>
        <p className={`t-sub2 w-600 ${s.header}`}>{tab === 0 ? "Белсенді" : "Тарих"}<span> · {list.length}</span></p>
        {loading
          ? [0, 1].map((i) => <div key={i} className={s.card} style={{ height: 190 }}><span className="sk" style={{ position: "absolute", left: 16, top: 16, width: 72, height: 72, borderRadius: 12 }} /><span className="sk" style={{ position: "absolute", left: 100, top: 20, width: 190, height: 20, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 100, top: 48, width: 130, height: 14, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 16, top: 112, width: 348, height: 10, borderRadius: 5 }} /><span className="sk" style={{ position: "absolute", left: 16, top: 140, width: 90, height: 22, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 274, top: 134, width: 90, height: 36, borderRadius: 18 }} /></div>)
          : list.length
            ? list.map((p, i) => <PackCard key={p.id} pack={p} i={i} />)
            : <p className={`t-sub2 rise ${s.empty}`}>{tab === 0 ? "Белсенді пакет жоқ" : "Толық пайдаланылған пакеттер осында шығады"}</p>}
      </main>}
    </div>
  );
}
