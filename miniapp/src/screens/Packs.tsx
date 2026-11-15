// Figma: «Пакеттерім (жаңа навигация) / Light» (13905:8147); «09 · Пакеттерім»: «Алғашқы кіру (көрсеткіш)» 13886:28960,
// «Бос күй» 13886:29133, «Тарих» 13886:29206. Жаңа бөліктердің өлшемі — UI kit шкаласы + 4/8px тор.
import { useEffect, useState } from "react";
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { useGo } from "../nav";
import { getPack, offerOf, useActivity, useOrders, usePacks, type Pack } from "../store";
import { haptic, kv } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Timeline } from "../ui/Timeline";
import searchIcon from "../assets/icons/search.svg";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import { UseSheet } from "../ui/UseSheet";
import s from "./Packs.module.css";

const icon = { food: burger, coffee: burger, hair: scissors };

function PackCard({ pack, i, onUse, hint, onHint }: { pack: Pack; i: number; onUse: (p: Pack) => void; hint?: boolean; onHint?: () => void }) {
  const go = useGo();
  const o = offerOf(pack);
  const soon = pack.daysLeft <= 3;
  return (
    <article className={`${s.card} ${hint ? s.hinted : ""} rise`} style={{ ["--i" as string]: i }} onClick={() => go("/pack/" + pack.id)}>
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
        <button className={`t-sub2 w-600 ${s.use}`} disabled={pack.left < 1} onClick={(e) => { e.stopPropagation(); haptic.medium(); onUse(pack); }}>Қолдану</button>
        {hint && (
          <div className={s.tip} role="note" onClick={(e) => e.stopPropagation()}>
            <p>Мекемеде «Қолдану» батырмасын бас: сканерле немесе тапсырыс бер</p>
            <button onClick={() => { haptic.tap(); onHint?.(); }}>Түсінікті</button>
          </div>
        )}
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

const tabs = ["Белсенді", "Тапсырыстар", "Тарих"];

export function Packs() {
  const go = useGo();
  const all = usePacks();
  const packs = demoEmpty() ? [] : all;
  const [tab, setTab] = useState(0);
  const [using, setUsing] = useState<Pack | null>(null);
  const orders = useOrders().filter((o) => o.status === "sent");
  const { loading } = useMock("packs", packs, 500);
  const active = packs.filter((p) => p.left > 0 && !p.expired);
  const allActs = useActivity();
  const acts = demoEmpty() ? [] : allActs;
  // Алғашқы кіру көрсеткіші: бір рет көрсетіледі («Түсінікті» басылғанша). Демо: ?hint=1
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (/[?&]hint=1/.test(window.location.hash)) { setHint(true); return; }
    let live = true;
    void kv.get("jazl_packs_hint").then((v) => { if (live && !v) setHint(true); });
    return () => { live = false; };
  }, []);
  const closeHint = () => { setHint(false); kv.set("jazl_packs_hint", "1"); };
  return (
    <div className={s.page}>
      <button className="topSearch" onClick={() => go("/search")} aria-label="Іздеу"><img src={searchIcon} alt="" /><span>Іздеу...</span></button>
      <header className={s.top}>
        <TelegramChrome mode="close" />
        <div className={s.seg}>
          <span className={s.segThumb} style={{ transform: `translateX(${tab * 125.33}px)` }} />
          {tabs.map((t, i) => (
            <button key={t} className={`${s.segBtn} ${tab === i ? s.segOn : ""}`} onClick={() => { if (tab !== i) { haptic.select(); setTab(i); } }}>{t}</button>
          ))}
        </div>
      </header>
      {!loading && packs.length === 0 ? (
        <EmptyState inline sticker="shop" title="Әзірге пакет жоқ" text={"Пакет сатып алсаң, мекемеде сканерлеп\nнемесе үйден тапсырыс беріп қолданасың"} action={{ text: "Ұсыныстарды көру", onClick: () => go("/", "fade") }} />
      ) : <main className={s.list} key={tab}>
        <p className={`t-sub2 w-600 ${s.header}`}>{tab === 2 ? "Соңғы әрекеттер" : <>{tabs[tab]}<span> · {tab === 0 ? active.length : orders.length}</span></>}</p>
        {loading
          ? [0, 1].map((i) => <div key={i} className={s.card} style={{ height: 190 }}><span className="sk" style={{ position: "absolute", left: 16, top: 16, width: 72, height: 72, borderRadius: 12 }} /><span className="sk" style={{ position: "absolute", left: 100, top: 20, width: 190, height: 20, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 100, top: 48, width: 130, height: 14, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 16, top: 112, width: 348, height: 10, borderRadius: 5 }} /><span className="sk" style={{ position: "absolute", left: 16, top: 140, width: 90, height: 22, borderRadius: 6 }} /><span className="sk" style={{ position: "absolute", left: 274, top: 134, width: 90, height: 36, borderRadius: 18 }} /></div>)
          : tab === 1
            ? (orders.length ? orders.map((o, i) => (
                <button key={o.id} className={`${s.order} rise`} style={{ ["--i" as string]: i }} onClick={() => go("/orders/" + o.id)}>
                  <span className={s.oHead}><span className={s.oEmoji}>{o.emoji}</span><span className={s.oText}><b>{o.title}</b><small>№{o.no} • {o.venue} • {o.time}</small></span></span>
                  <span className={s.oCode}><small>Кассирге айтатын код</small><b>{o.code}</b></span>
                </button>)) : <p className={`t-sub2 rise ${s.empty}`}>Белсенді тапсырыс жоқ. Пакет бетінде «Тапсырыс беру» батырмасы бар.</p>)
          : tab === 2
            ? (acts.length ? (
                <section className={`${s.acts} rise`}>
                  {acts.map((a) => (
                    <div key={a.id} className={s.act} role="button" tabIndex={0} onClick={() => { if (getPack(a.packId)) go("/pack/" + a.packId); }}>
                      <span className={`${s.actIcon} ${a.action === "renew" ? s.actOff : ""}`}>{a.emoji}</span>
                      <span className={s.actText}><b>{a.title}</b><small>{a.sub}</small></span>
                      {a.action === "rated"
                        ? <span className={s.actStars}>★ {a.stars}</span>
                        : <button className={s.actBtn} onClick={(e) => { e.stopPropagation(); go(a.action === "rate" ? "/rate/" + a.id : "/offer/" + a.offerId); }}>{a.action === "rate" ? "Бағала" : "Қайта алу"}</button>}
                    </div>
                  ))}
                </section>
              ) : <p className={`t-sub2 rise ${s.empty}`}>Пайдаланған пакеттерің осында шығады</p>)
          : active.length
            ? active.map((p, i) => <PackCard key={p.id} pack={p} i={i} onUse={setUsing} hint={hint && i === 0} onHint={closeHint} />)
            : <p className={`t-sub2 rise ${s.empty}`}>Белсенді пакет жоқ</p>}
      </main>}
      {using && <UseSheet pack={using} onClose={() => setUsing(null)} />}
    </div>
  );
}
