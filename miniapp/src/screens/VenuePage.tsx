// Figma, «08 · Мекеме беті»: «Негізгі: Ұсыныстар» 13886:25217, «Мекеме туралы» 13886:25743, «Суреттер» 13886:25963,
// «Пікірлер» 13886:26155, «Ұсыныс жоқ» 13886:27031, «Жаңа мекеме: пікірлер» 13886:26881,
// «Бағыт: 2ГИС» 13886:27429, «Қоңырау: растау» 13886:27703, «Бөлісу: Telegram чаттары» 13886:27961 (нативті чат таңдау),
// «Хабарла: рұқсат диалогы» 13886:28289 (нативті requestWriteAccess), «Хабарла: қосылды» 13886:28547
import { pickRoute, routeRows } from "../ui/route";
import { kk } from "../i18n";
import { RichWords } from "../ui/RichWords";
import { useTabSwipe } from "../ui/useTabSwipe";
import { Photo } from "../ui/Photo";
import { kindPic } from "../ui/Emo";
import { Emo } from "../ui/Emo";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { offersOfVenue } from "../mocks/offers";
import { findVenue, kindLabel, lngLat, venues } from "../mocks/venues";
import { coverPhoto } from "../mocks/photos";
import { useGo } from "../nav";
import { appLink, branches, toggleVenueSub, useVenueSubs } from "../store";
import { askWriteAccess, haptic, inTelegram, openExternal, tg, useBackButton } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { LinkSheet } from "../ui/LinkSheet";
import { OfferCard } from "../ui/OfferCard";
import { TelegramChrome } from "../ui/TelegramChrome";
import hero from "../assets/icons/heroBurger.svg";
import cup from "../assets/icons/catCup.svg";
import scissors from "../assets/icons/catScissors.svg";
import routeIcon from "../assets/icons/vRoute.svg";
import callIcon from "../assets/icons/vCall.svg";
import shareIcon from "../assets/icons/vShare.svg";
import bellIcon from "../assets/icons/vBell.svg";
import { Sticker } from "../ui/Sticker";
import s from "./VenuePage.module.css";

const days = ["Дүйсенбі", "Сейсенбі", "Сәрсенбі", "Бейсенбі", "Жұма", "Сенбі", "Жексенбі"];
const reviews = [["Айгерім", "8 қараша", kk("Донер ыстық әрі үлкен, төлем бірден өтті.")], ["Ерлан", "3 қараша", kk("Жақсы баға, кезек аз болды.")], ["Дана", "28 қазан", kk("Дәмі ұнады, кассир сыпайы.")]];
const bars = [82, 13, 5, 0, 0];
const coverIcon = { food: hero, coffee: cup, hair: scissors };

// Мекеме ауысқанда қойынды күйі қалып қоймауы үшін бет мекеме бойынша қайта құрылады
export function VenuePage() {
  const id = useParams().id;
  return <VenueView key={id} id={id} />;
}

function VenueView({ id }: { id?: string }) {
  const go = useGo();
  const v = findVenue(id) ?? venues[0];
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const offers = offersOfVenue(v.name);
  // Figma «08»: «Қазір жабық» 13886:26401, «Жаңа мекеме» 13886:26641, «Төлем уақытша жоқ» 13886:27185, «24/7» 14018:11491.
  // Демо: ?venue=closed|new|nopay|247
  const status = (window.location.hash.match(/[?&]venue=(\w+)/)?.[1] as typeof v.status) || v.status;
  const subscribed = useVenueSubs().includes(v.id);
  const [tab, setTab] = useState(0);
  const [coverBroken, setCoverBroken] = useState(false);
  const [prev, setPrev] = useState(0);
  const [sheet, setSheet] = useState<"route" | "call" | "perm" | "branches" | null>(null);
  const [snack, setSnack] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState({ left: 16, width: 95 });
  useEffect(() => { const el = tabsRef.current?.children[tab] as HTMLElement | undefined; if (el) setLine({ left: el.offsetLeft, width: el.offsetWidth }); }, [tab, offers.length]);
  useEffect(() => { if (!snack) return; const t = setTimeout(() => setSnack(false), 2600); return () => clearTimeout(t); }, [snack]);
  const today = (new Date().getDay() + 6) % 7;
  const hoursOf = (i: number) => { const [a, b] = v.hours.split("–"); return i === 4 ? `${a}–23:00` : i === 5 ? `10:00–23:00` : i === 6 ? `10:00–${b}` : v.hours; };
  const pick = (i: number) => { if (i === tab) return; haptic.select(); setPrev(tab); setTab(i); };
  const sw = useTabSwipe(tab, 4, pick); // 4 таб: Ұсыныстар, Туралы, Суреттер, Пікірлер
  const share = () => {
    haptic.tap();
    // Нативті бөлісу: Telegram өзінің чат таңдау терезесін ашады
    const url = "https://t.me/share/url?url=" + encodeURIComponent(appLink("venue", v.id)) + "&text=" + encodeURIComponent(`${v.name} · Medeo\n${kindLabel[v.kind]} • ★ ${String(v.rating).replace(".", ",")} • Қарағанды`);
    if (inTelegram && tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank", "noopener");
  };
  const subDone = () => { haptic.success(); toggleVenueSub(v.id); setSnack(true); };
  const notify = async () => { haptic.medium(); if (subscribed) return toggleVenueSub(v.id); if (!inTelegram) return setSheet("perm"); if (await askWriteAccess()) subDone(); };
  const tabs: [string, number?][] = [["Ұсыныстар", offers.length], ["Туралы"], ["Суреттер", 4], ["Пікірлер", status === "new" ? undefined : v.reviews]];
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <div className={s.cover}>
        {status === "closed" && <span className={s.sleepDuck}><Sticker name="sleep" size={120} /></span>}
        {coverBroken ? <img src={kindPic[v.kind]} width={160} height={160} className={s.coverIcon} alt="" style={{ objectFit: "contain" }} /> : <Photo src={coverPhoto[v.kind]} kind={v.kind} className={s.coverPhoto} alt="" onError={() => setCoverBroken(true)} />}
      </div>
      <header className={s.head}>
        <div className={s.id}>
          <span className={s.avatar}><Emo kind={v.kind} size={48} /></span>
          <div><h1 className={s.name}>{v.name}</h1><p className={`t-sub2 ${s.gray}`} style={{ whiteSpace: "pre" }}>{`${kindLabel[v.kind]}  •  Қарағанды`}</p></div>
        </div>
        {status === "new"
          ? <p className={s.meta}><span className={s.badgeNew}>Жаңа мекеме</span></p>
          : <p className={s.meta} style={{ whiteSpace: "pre" }}>{`★ ${String(v.rating).replace(".", ",")} (${v.reviews})  •  ${v.km.toFixed(1).replace(".", ",")} км  •  48 клиент`}</p>}
        {v.trust != null && <p className={s.trust}><span aria-hidden>✓</span>{`Сенімді мекеме · ${v.trust}% қызмет шағымсыз`}</p>}
        {status === "closed"
          ? <p className={`${s.meta} ${s.open} ${s.closed}`} style={{ whiteSpace: "pre" }}><i />{`Қазір жабық  •  ${v.opensAt ?? v.hours.split("–")[0]}-де ашылады`}</p>
          : status === "247"
            ? <p className={`${s.meta} ${s.open}`}><span className={s.badge247}>24/7</span>Тәулік бойы ашық</p>
            : <p className={`${s.meta} ${s.open}`} style={{ whiteSpace: "pre" }}><i />Ашық  •  бүгін {v.hours}</p>}
        <div className={s.actions}>
          <button className={s.action} onClick={() => { haptic.tap(); setSheet("route"); }}><img src={routeIcon} width={24} height={24} alt="" /><span className="t-cap1 w-600">Бағыт</span></button>
          <button className={s.action} onClick={() => { haptic.tap(); setSheet("call"); }}><img src={callIcon} width={24} height={24} alt="" /><span className="t-cap1 w-600">Қоңырау</span></button>
          <button className={s.action} onClick={share}><img src={shareIcon} width={24} height={24} alt="" /><span className="t-cap1 w-600">Бөлісу</span></button>
          <button className={`${s.action} ${subscribed ? s.actionOn : ""}`} onClick={notify}><span className={`${s.bell} ${subscribed ? s.ring : ""}`} style={{ maskImage: `url("${bellIcon}")`, WebkitMaskImage: `url("${bellIcon}")` }} /><span key={String(subscribed)} className="t-cap1 w-600">{subscribed ? "Қосулы" : "Хабарла"}</span></button>
        </div>
      </header>
      <nav className={s.tabs}>
        <div className={s.tabRow} ref={tabsRef}>
          {tabs.map(([t, n], i) => <button key={t} className={`${s.tab} ${tab === i ? s.tabOn : ""}`} onClick={() => pick(i)}><span className="t-sub2 w-600">{t}</span>{n !== undefined && <small className="t-cap1">{n}</small>}</button>)}
        </div>
        <span className={s.line} style={{ translate: `${line.left}px 0`, width: line.width }} />
      </nav>
      <div {...sw.handlers} style={{ ...sw.style, minHeight: 360 }}>
      <main key={tab} className={`${s.body} ${tab > prev ? s.fromRight : s.fromLeft}`}>
        {tab === 0 && status === "nopay" && offers.length > 0 && <p className={`${s.nopay} infoBox infoWarn`}>Мекеме уақытша Medeo төлемін қабылдамайды. Пакетті сатып алуға болады, пайдалану кейінірек.<i>”</i></p>}
        {tab === 0 && (offers.length ? offers.map((o) => <OfferCard key={o.id} offer={o} />) : (
          <div className={s.empty}><h2 className="t-headline">Қазір ұсыныс жоқ</h2><p className={`t-sub2 ${s.gray}`}>Жаңа ұсыныс шықса, хабарлаймыз</p><button className={`t-sub2 w-600 ${s.emptyBtn} ${subscribed ? s.actionOn : ""}`} onClick={notify}><span className={`${s.bell} ${subscribed ? s.ring : ""}`} style={{ maskImage: `url("${bellIcon}")`, WebkitMaskImage: `url("${bellIcon}")` }} />{subscribed ? "Қосулы" : "Хабарла"}</button></div>
        ))}
        {tab === 1 && <>
          <section className={s.card}>
            <div className={`${s.quote} infoBox`}><span className={s.qBar} />
              {v.id === "damdi" ? <p className={`t-text ${s.rich}`}><RichWords cls={s} text="[green:Жаңа піскен лаваш] мен үй соусы. Донерді [blue:5 жылдан бері] дайындаймыз, ет күн сайын жаңа келеді." /></p>
                : <p className="t-text">{`${v.name} — Medeo серіктесі. Пакет сатып алып, мекемеде сканерлеп қолдан.`}</p>}
            </div>
          </section>
          <section className={s.card}>
            <h2 className={`t-headline ${s.cardTitle}`}>Жұмыс кестесі</h2>
            {days.map((d, i) => <p key={d} className={`t-text ${s.kv}`}><span className={i === today ? "w-600" : ""}>{d}</span><b>{hoursOf(i)}</b></p>)}
          </section>
          <section className={s.card}>
            <h2 className={`t-headline ${s.cardTitle}`}>Мекенжайы</h2>
            <p className={s.addr}>{`Қарағанды, ${v.address}`}</p>
            {branches(v.name, v.address).length > 1 && <button className={`t-sub2 w-600 ${s.branchesBtn}`} onClick={() => { haptic.tap(); setSheet("branches"); }}>{`Барлық филиалдар · ${branches(v.name, v.address).length}`}</button>}
            <button className={s.miniMap} onClick={() => go("/map")} aria-label="Картада"><span className={s.miniPin}><Emo kind={v.kind} size={28} /></span></button>
            <button className={`t-sub2 w-600 ${s.routeBtn}`} onClick={() => { haptic.tap(); setSheet("route"); }}><Emo e="🧭" size={20} />Бағыт</button>
          </section>
        </>}
        {tab === 2 && <section className={s.card}>
          <h2 className={`t-headline ${s.cardTitle}`}>Суреттер</h2>
          <div className={s.grid}>{[0, 1, 2, 3].map((i) => <span key={i} className={s.shot} style={{ ["--i" as string]: i }}><Photo src={offers[i % Math.max(1, offers.length)]?.photo ?? coverPhoto[v.kind]} kind={v.kind} className={s.shotImg} alt="" loading="lazy" /></span>)}</div>
        </section>}
        {tab === 3 && (v.reviews < 3 || status === "new" ? (
          <div className={s.empty}><h2 className="t-headline">Пікірлер әлі жоқ</h2><p className={`t-sub2 ${s.gray}`}>Пікірлер 3 бағалаудан кейін көрінеді</p></div>
        ) : <>
          <section className={`${s.card} ${s.rating}`}>
            <div className={s.score}><b>{String(v.rating).replace(".", ",")}</b><span className={s.stars}>★★★★★</span><small className="t-cap1">{`${v.reviews} бағалау`}</small></div>
            <div className={s.bars}>{bars.map((w, i) => <p key={i} className="t-cap1"><span>{5 - i}</span><i><u style={{ width: `${w}%`, ["--i" as string]: i }} /></i></p>)}</div>
          </section>
          <section className={`${s.card} ${s.reviews}`}>
            {reviews.map(([n, d, t]) => <div key={n}><p className={s.rHead}><b className="t-sub2 w-600">{n}</b><span className={`t-cap1 w-600 ${s.star}`}>★ 5</span><small className="t-cap1">{d}</small></p><p className="t-text">{t}</p></div>)}
          </section>
        </>)}
        <button className={`t-sub2 w-600 ${s.report}`} onClick={() => go("/profile/report")}>Мәселе туралы жазу</button>
      </main>
      </div>
      {snack && <div className={s.snack} role="status"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M10 20.5a2 2 0 0 0 4 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg><span>Жаңа ұсыныс шықса, хабарлаймыз</span></div>}
      {sheet === "route" && <LinkSheet title="Бағыт" rows={routeRows(v.name, v.name + " " + v.address, lngLat(v))} onClose={() => setSheet(null)} />}
      {sheet === "branches" && <LinkSheet title="Филиалдар" note="Пакет барлық филиалда жарамды. Қалағанында ал." cancel="Жабу"
        extra={{ text: "Картада көру", onClick: () => go("/map") }}
        rows={branches(v.name, v.address).map((b) => ({ glyph: "pin" as const, tint: b.open ? "#31d158" : "#8e98a4", title: b.address, sub: `${b.km.toFixed(1).replace(".", ",")} км • ${b.open ? b.hours : "уақытша жабық"}`, badge: { text: b.open ? "Ашық" : "Жабық", ok: b.open },
          onClick: () => { void pickRoute(v.name + " " + b.address); } }))}
        onClose={() => setSheet(null)} />}
      {sheet === "call" && <Confirm title="Қоңырау шалу" text={`${v.name} мекемесіне қоңырау шалынсын ба?`} cancel="Бас тарту" ok="Қоңырау шалу" onClose={() => setSheet(null)} onOk={() => { window.location.href = "tel:+77000000000"; }} />}
      {sheet === "perm" && <Confirm title="Хабарламаға рұқсат" text="Medeo ботына сізге хабарлама жіберуге рұқсат бересіз бе?" cancel="Бас тарту" ok="Рұқсат ету" onClose={() => setSheet(null)} onOk={subDone} />}
    </div>
  );
}
