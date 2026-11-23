// Figma «09 · Пакеттерім»: «Пакет беті / Белсенді» 13886:29335, «Мерзімі жақын» 13886:29489,
// «Толық пайдаланылды» 13886:29723, «Мерзімі өтті» 13886:29947. Жаңа бөліктер — UI kit шкаласы + 4/8px тор.
// «11 · Мерзімін ұзарту»: «Тегін» 13886:32051, «Ақылы» 13886:32347, «Ұзартылды» 13886:32643, «Мүмкін емес» 13886:32881.
// Демо: ?extend=no — мекеме ұзартуға рұқсат бермейді.
import { Tile } from "../ui/Tile";
import { kindPic } from "../ui/Emo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Confirm } from "../ui/Confirm";
import { useParams } from "react-router-dom";
import { fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { findVenue, venues } from "../mocks/venues";
import { syncServerPacks, carryOf, CARRY_DAYS, getPack, offerOf, packState, rateActivityOf, usePacks, type Activity , refundPack, setAutoRenew, useDefaultMethod, useMethods } from "../store";
import { offPeakPrice } from "../offpeak";
import { Switch } from "../ui/SubPage";
import { haptic, inTelegram, nativePick, useBackButton, useBottomButtons } from "../telegram";
import { api } from "../api";
import { TelegramChrome } from "../ui/TelegramChrome";
import { ExtendSheet } from "../ui/ExtendSheet";
import { RateSheet } from "../ui/RateSheet";
import { Timeline } from "../ui/Timeline";
import { Sticker, preloadSticker } from "../ui/Sticker";
import burger from "../assets/icons/burger36.svg";
import chev from "../assets/icons/chevRight.svg";
import qr from "../assets/icons/qr22.svg";
import { scanOnly } from "../mocks/offers";
import s from "./PackPage.module.css";

export function PackPage() {
  const { id } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(id);
  const [extending, setExtending] = useState(false);
  const [rating, setRating] = useState<Activity | null>(null);
  const [toast, setToast] = useState("");
  const [askRefund, setAskRefund] = useState(false);
  // Хабарламадан ашылғанда пакет әлі серверден келмеген болуы мүмкін — күтеміз; табылмаса, Пакеттерім бетіне
  const [lookedUp, setLookedUp] = useState(false);
  useEffect(() => { if (!pack) void syncServerPacks().catch(() => null).finally(() => setLookedUp(true)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pack && lookedUp) go("/packs", "fade", { replace: true }); }, [pack, lookedUp, go]);
  const sheet = extending || Boolean(rating);
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !sheet);
  // Figma «Пакет беті: екі әрекет» 13913:8091: мекемеде — сканерлеу, үйде — тапсырыс беру (шаштаразда — жазылу)
  const hairPack = pack ? offerOf(pack).kind === "hair" : false;
  const scan = useMemo(() => ({ text: "Сканерлеу", position: "left" as const, onClick: () => { haptic.medium(); go("/scan?pack=" + id, "up"); } }), [go, id]);
  const order = useMemo(() => ({ text: hairPack ? "Жазылу" : "Тапсырыс беру", shine: true, onClick: () => { haptic.medium(); go((hairPack ? "/book/" : "/order/") + id); } }), [go, id, hairPack]);
  // Біткен не мерзімі өткен пакетте жалғыз негізгі әрекет — «Қайта алу»
  const usable = Boolean(pack && pack.left > 0 && !pack.expired);
  const rebuy = useMemo(() => ({ text: "Қайта алу", shine: true, onClick: () => { haptic.medium(); go("/rebuy/" + id); } }), [go, id]);
  // Патша (2026-11-23): тек кофеде жалғыз «Сканерлеу»; тамақта «Тапсырыс беру + Сканерлеу», шаштаразда «Жазылу + Сканерлеу»
  const quick = pack ? scanOnly(offerOf(pack).kind) && !offerOf(pack).planOnly : false;
  const scanMain = useMemo(() => ({ text: "Сканерлеу", shine: true, onClick: () => { haptic.medium(); go("/scan?pack=" + id, "up"); } }), [go, id]);
  useBottomButtons(usable ? (quick ? scanMain : order) : rebuy, usable && !quick ? scan : undefined, Boolean(pack) && !sheet);
  const onExtended = useCallback((until: string) => { setExtending(false); setToast(`Мерзімі ұзартылды: ${until}`); window.setTimeout(() => setToast(""), 2600); }, []);
  const methods = useMethods(); const defMethod = useDefaultMethod();
  // Автожаңарту картасы: әдепкі тәсіл карта болса — сол, әйтпесе сақталған алғашқы карта
  const renewCard = methods.find((m) => m.cardId && m.id === defMethod) ?? methods.find((m) => m.cardId);
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(""), 2600); };
  const toggleRenew = async (on: boolean) => {
    if (!pack) return;
    if (on && !renewCard?.cardId) { haptic.warning(); say("Алдымен картаны сақтаңыз"); go("/profile/card-add"); return; }
    haptic.select();
    const r = await setAutoRenew(pack.id, on, on ? renewCard?.cardId : undefined);
    if (!r.ok) { haptic.error(); say("Өзгерту мүмкін болмады"); return; }
    say(on ? `Автожаңарту қосылды · ${r.card ?? renewCard?.title ?? ""}` : "Автожаңарту өшірілді");
    // Кету себебін сұрау (Хормози): бір сұрақ, міндетті емес — жауап өнімді жақсартуға
    if (!on) {
      const why = await nativePick("Бір сұрақ", "Автожаңартуды неге өшірдіңіз? Жауабыңыз бізге жақсаруға көмектеседі.", [{ id: "price", text: "Қымбат" }, { id: "inconvenient", text: "Ыңғайсыз" }, { id: "other", text: "Басқа себеп" }], "");
      if (why) void api("/v1/feedback", { method: "POST", body: JSON.stringify({ kind: "renew_off", reason: why, ...(pack.serverId ? { packId: pack.serverId } : {}) }) }).catch(() => null);
    }
  };
  // Стикерлер (Патша, 2026-11-21): соңғы бірлік қалса — кубок, қайта алу батырмасы көрінсе — себет алдын ала жүктеледі
  useEffect(() => {
    if (!pack) return;
    if (pack.left <= 1) void preloadSticker("trophy").catch(() => null);
    if (pack.daysLeft <= 3 || pack.left <= 1) void preloadSticker("shop").catch(() => null);
  }, [pack?.left, pack?.daysLeft]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pack) return <div className={s.page}><TelegramChrome mode="back" onBack={back} /><span className={s.wait} aria-label="Жүктелуде" /></div>;
  const o = offerOf(pack);
  const state = packState(pack);
  const soon = state === "soon";
  const noExtend = pack.noExtend || /[?&]extend=no/.test(window.location.hash);
  const late = state === "expired" && carryOf(pack) === 0;
  const venueId = venues.find((v) => v.name === o.venue)?.id;
  const chip = { active: "Белсенді", soon: `${pack.daysLeft} күн қалды`, used: "Толық пайдаланылды", expired: "Мерзімі өтті" }[state];
  const dateLine = state === "expired" ? `${pack.endedOn ?? pack.until} аяқталды` : state === "used" ? `Мерзімі: ${pack.until}` : `${pack.until} · ${pack.daysLeft} күн қалды`;
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <h1 className="pageTitle">Пакет</h1>
      <div className={s.col}>
        <section className={`${s.card} ${s.main} rise`}>
          {state === "used" && (
            <div className={s.trophy}>
              <Sticker name="trophy" size={128} />
              <p className="t-headline">Жарайсың! Пакетті толық пайдаландың</p>
            </div>
          )}
          <div className={s.head}>
            <span className={s.thumb}><img src={kindPic[o.kind]} width={52} height={52} alt="" style={{ objectFit: "contain" }} /></span>
            <div className={s.headText}>
              <p className="t-headline">{o.title}</p>
              <button className={s.venue} onClick={() => { if (venueId && findVenue(venueId)) go("/venue/" + venueId); else haptic.tap(); }}><span className="t-sub2 w-600">{o.venue}</span><img src={chev} width={18} height={18} alt="" /></button>
              <span className={`${s.chip} ${s["chip_" + state]}`}>{chip}</span>
            </div>
          </div>
          <hr className={s.sep} />
          <p className={s.count}><span>{pack.left} / {pack.total}</span><span className="t-sub1">қалды</span></p>
          <Timeline total={pack.total} used={pack.total - pack.left} warn={soon} width={348} />
          <p className={s.dateLine}>{dateLine}</p>
          {soon && (
            <div className={`${s.note} infoBox infoOk`}>
              <p>Қайта алсаң, қалған бірлік <b>келесі айға көшеді</b></p>
              <button className={s.noteBtn} onClick={() => go("/rebuy/" + pack.id)}>Қайта алу</button>
            </div>
          )}
          {state === "expired" && (
            <div className={`${s.note} ${s.noteWarn} infoBox infoWarn`}>
              <p>{late
                ? <>Мерзімі өткеніне {CARRY_DAYS} күннен асты, сондықтан пайдаланылмаған {pack.left} бірлік жаңа пакетке көшпейді.</>
                : <>Пакеттің мерзімі өтті. {CARRY_DAYS} күн ішінде қайта алсаң, пайдаланылмаған {pack.left} бірлік жаңа пакетке көшеді.</>}
                <button className={s.noteLink} onClick={() => go("/rules/carry")}>Көшіру ережесі туралы толығырақ</button></p>
            </div>
          )}
          {usable && <p className={s.howUse}>{o.kind === "hair" ? <>Алдын ала <b>«Жазылу»</b> арқылы уақыт таңда, не жазылусыз келіп QR сканерле. Жазылусыз келгенде тек бос уақытқа қабылданады.</> : quick ? <>Кассада «Medeo бойынша» деп айтып, QR-ды сканерле. Ақша төленбейді — бірлік пакеттен шегеріледі.</> : <>Кассада «Medeo бойынша» деп айтып, QR-ды сканерле. Не алдын ала <b>«Тапсырыс беру»</b> арқылы қазір не белгілі уақытқа дайындат. Ақша төленбейді — бірлік пакеттен шегеріледі.</>}</p>}
        </section>

        <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 1 }}>
          <h2 className={`t-sub2 w-600 ${s.groupTitle}`}>Пайдалану тарихы</h2>
          {pack.history.map((x, i) => (
            <div key={i} className={s.row}>
              <Tile e={x.emoji} size={40} />
              <span className={s.rowText}><span className={s.rowTitle}>{x.title}</span><span className={`t-sub2 ${s.muted}`}>{x.sub}</span></span>
              <span className={`t-sub2 w-600 ${s.muted}`}>{x.right}</span>
              {i < pack.history.length - 1 && <span className={s.line68} />}
            </div>
          ))}
        </section>

        <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 2 }}>
          <h2 className={`t-sub2 w-600 ${s.groupTitle}`}>Ақпарат</h2>
          {pack.extendedTo && <div className={`t-text ${s.kv}`}><span className={s.muted}>Мерзімі ұзартылды</span><span className="w-600">{pack.extendedTo}</span><span className={s.line16} /></div>}
          {/* Пакет иесінің артықшылығы / пакетке қоса (мекеме береді): кассада айтуды ұмытпау үшін */}
          {o.perk && <div className={`t-text ${s.kv}`}><span className={s.muted}>Пакет иесіне</span><span className="w-600">{o.perk}</span><span className={s.line16} /></div>}
          {o.bonus && <div className={`t-text ${s.kv}`}><span className={s.muted}>Пакетке қоса</span><span className="w-600">{o.bonus}</span><span className={s.line16} /></div>}
          <div className={`t-text ${s.kv}`}><span className={s.muted}>Бағасы</span><span className="w-600">{fmt(o.price)}</span><span className={s.line16} /></div>
          <div className={`t-text ${s.kv}`}><span className={s.muted}>Төлем тәсілі</span><span className="w-600">Kaspi Pay</span><span className={s.line16} /></div>
          <button className={s.cell} onClick={() => { haptic.tap(); if (pack.receiptId) go("/receipt/srv/" + pack.receiptId); }}><span className={s.rowTitle}>{`Чек${pack.receiptNo ? ` · ${pack.receiptNo}` : ""}`}</span><img src={chev} width={18} height={18} alt="" /></button>
          {state === "used" && <button className={`${s.cell} ${s.cellTop}`} onClick={() => { haptic.medium(); setRating(rateActivityOf(pack.id)); }}><span className={s.rowTitle}>Бағалау</span><span className={s.cellAction}>Бағала</span></button>}
        </section>

        {/* Автожаңарту (Патша, 2026-11-18): пакет біткенде сақталған картадан сол көлем өзі қайта алынады — бір рет, клиенттің келісімімен */}
        {pack.serverId && !pack.gifted && usable && (
          <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 3 }}>
            <div className={`${s.cell} ${s.cell2}`}>
              <span className={s.rowText} style={{ minWidth: 0, whiteSpace: "normal" }}><span className={s.rowTitle}>Автожаңарту</span>
                <span className={s.cellSub}>{pack.autoRenew ? `Пакет біткенде ${renewCard?.title ?? "сақталған карта"} арқылы ${fmt(pack.offPeak ? offPeakPrice(o.price, pack.offPeak.pct) : o.price)} алынады. Қалған бірлік жаңасына көшеді. Өшіргенше әр пакет біткенде жалғасады.` : "Ешқашан толық баға төлемейсің: пакет біткенде сол жеңілдікпен өзі жаңарады. Тоқтату — бір батырма."}</span></span>
              <Switch on={Boolean(pack.autoRenew)} onChange={(v) => void toggleRenew(v)} />
            </div>
          </section>
        )}

        {usable && (soon || pack.extendedTo) && (
          <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 3 }}>
            <button className={`${s.cell} ${s.cell2} ${noExtend ? s.cellOff : ""}`} disabled={noExtend} onClick={() => { haptic.medium(); setExtending(true); }}>
              <span className={s.rowText}><span className={s.rowTitle}>Мерзімін ұзарту</span><span className={s.cellSub}>{noExtend ? "Мекеме ұзартуға рұқсат бермейді" : pack.freeExtendUsed ? "Тегін мүмкіндік пайдаланылды, ақылы 14 не 30 күн" : "Бір рет тегін, кейін ақылы"}</span></span>
              {!noExtend && <img src={chev} width={18} height={18} alt="" />}
            </button>
          </section>
        )}

        <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 3 }}>
          {usable && <button className={s.cell} onClick={() => { haptic.tap(); go(`/complaint/${pack.id}?why=refused`); }}><span className={`${s.rowTitle} ${s.linkText}`}>Мекеме қабылдамады ма?</span></button>}
          <button className={s.cell} onClick={() => { haptic.tap(); go("/complaint/" + pack.id); }}><span className={`${s.rowTitle} ${s.linkText}`}>Мәселе туралы жазу</span></button>
          {/* B4: бірде-бір бірлік жұмсалмаса — 14 күн ішінде ақшаны толық қайтаруға болады (сервер тексереді) */}
          {pack.serverId && pack.left === pack.total && !pack.expired && !pack.gifted && <button className={s.cell} onClick={() => { haptic.tap(); setAskRefund(true); }}><span className={`${s.rowTitle} ${s.linkText}`}>Ақшаны қайтару</span></button>}
        </section>
      </div>

      {askRefund && <Confirm title="Ақшаны қайтару?" text="Пакеттен бірде-бір бірлік жұмсалмаған — ақша толық қайтарылады, пакет жабылады. Картадан төленген бөлігі картаңа, Squirrel бонусымен төленген бөлігі бонусыңа оралады." cancel="Жоқ" ok="Қайтару" danger onClose={() => setAskRefund(false)}
        onOk={() => { setAskRefund(false); void refundPack(pack.id).then((r) => { if (r.ok) { haptic.success(); go("/packs", "fade", { replace: true }); } else { haptic.error(); setToast(r.error === "too_late" ? "14 күн өтіп кеткен — қайтару мүмкін емес" : r.error === "gift_refund_giver" ? "Сыйлықты тек сыйлаған адам қайтара алады" : r.error === "units_used" ? "Пакеттен бірлік жұмсалған — қайтару мүмкін емес" : "Қайтару мүмкін болмады"); } }); }} />}
      {extending && <ExtendSheet pack={pack} onClose={() => setExtending(false)} onDone={onExtended} />}
      {rating && <RateSheet act={rating} onClose={() => setRating(null)} />}
      {toast && <div className={s.toast} role="status"><Tile e="📅" size={28} />{toast}</div>}
      {!inTelegram && (
        <div className={s.bar}>
          {usable && !quick && <button className={`${s.btn} ${s.btn2}`} onClick={scan.onClick}><img src={qr} width={22} height={22} alt="" />Сканерлеу</button>}
          <button className={`${s.btn} ${s.shine}`} onClick={usable ? (quick ? scanMain.onClick : order.onClick) : rebuy.onClick}>{usable ? (quick ? scanMain.text : order.text) : rebuy.text}</button>
        </div>
      )}
    </div>
  );
}
