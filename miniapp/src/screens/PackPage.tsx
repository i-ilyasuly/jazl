// Figma «09 · Пакеттерім»: «Пакет беті / Белсенді» 13886:29335, «Мерзімі жақын» 13886:29489,
// «Толық пайдаланылды» 13886:29723, «Мерзімі өтті» 13886:29947. Жаңа бөліктер — UI kit шкаласы + 4/8px тор.
import { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { findVenue, venues } from "../mocks/venues";
import { getPack, offerOf, packState, usePacks } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Timeline } from "../ui/Timeline";
import burger from "../assets/icons/burger36.svg";
import chev from "../assets/icons/chevRight.svg";
import qr from "../assets/icons/qr22.svg";
import s from "./PackPage.module.css";

export function PackPage() {
  const { id } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(id);
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  // Figma «Пакет беті: екі әрекет» 13913:8091: мекемеде — сканерлеу, үйде — тапсырыс беру (шаштаразда — жазылу)
  const hairPack = pack ? offerOf(pack).kind === "hair" : false;
  const scan = useMemo(() => ({ text: "Сканерлеу", position: "left" as const, onClick: () => { haptic.medium(); go("/scan?pack=" + id, "up"); } }), [go, id]);
  const order = useMemo(() => ({ text: hairPack ? "Жазылу" : "Тапсырыс беру", shine: true, onClick: () => { haptic.medium(); go("/order/" + id); } }), [go, id, hairPack]);
  // Біткен не мерзімі өткен пакетте жалғыз негізгі әрекет — «Қайта алу»
  const usable = Boolean(pack && pack.left > 0 && !pack.expired);
  const offerId = pack?.offerId;
  const rebuy = useMemo(() => ({ text: "Қайта алу", shine: true, onClick: () => { haptic.medium(); go("/offer/" + offerId); } }), [go, offerId]);
  useBottomButtons(usable ? order : rebuy, usable ? scan : undefined, Boolean(pack));
  if (!pack) return null;
  const o = offerOf(pack);
  const state = packState(pack);
  const soon = state === "soon";
  const venueId = venues.find((v) => v.name === o.venue)?.id;
  const chip = { active: "Белсенді", soon: `${pack.daysLeft} күн қалды`, used: "Толық пайдаланылды", expired: "Мерзімі өтті" }[state];
  const dateLine = state === "expired" ? `${pack.endedOn ?? pack.until} аяқталды` : state === "used" ? `Мерзімі: ${pack.until}` : `${pack.until} · ${pack.daysLeft} күн қалды`;
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <h1 className="pageTitle">Пакет</h1>
      <div className={s.col}>
        <section className={`${s.card} ${s.main} rise`}>
          <div className={s.head}>
            <span className={s.thumb}><img src={burger} width={36} height={36} alt="" /></span>
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
            <div className={s.note}>
              <p>Қайта алсаң, қалған бірлік <b>келесі айға көшеді</b></p>
              <button className={s.noteBtn} onClick={() => go("/offer/" + o.id)}>Қайта алу</button>
            </div>
          )}
          {state === "expired" && (
            <div className={`${s.note} ${s.noteWarn}`}>
              <p>Пакеттің мерзімі өтті. 3 күн ішінде қайта алсаң, пайдаланылмаған {pack.left} бірлік жаңа пакетке көшеді.<button className={s.noteLink} onClick={() => go("/profile/terms")}>Көшіру ережесі туралы толығырақ</button></p>
            </div>
          )}
          {usable && <p className={s.howUse}>{o.kind === "hair" ? <>Салонда шеберге QR-ды сканерлейсің, не үйден <b>«Жазылу»</b> арқылы уақыт таңдайсың.</> : <>Кассада «Jazl бойынша» деп айтып, QR-ды сканерле. Не мекемеге бармай <b>«Тапсырыс беру»</b> батырмасын бас — ақша төленбейді, бірлік пакеттен шегеріледі.</>}</p>}
        </section>

        <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 1 }}>
          <h2 className={`t-sub2 w-600 ${s.groupTitle}`}>Пайдалану тарихы</h2>
          {pack.history.map((x, i) => (
            <div key={i} className={s.row}>
              <span className={s.emoji}>{x.emoji}</span>
              <span className={s.rowText}><span className={s.rowTitle}>{x.title}</span><span className={`t-sub2 ${s.muted}`}>{x.sub}</span></span>
              <span className={`t-sub1 w-600 ${s.muted}`}>{x.right}</span>
              {i < pack.history.length - 1 && <span className={s.line68} />}
            </div>
          ))}
        </section>

        <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 2 }}>
          <h2 className={`t-sub2 w-600 ${s.groupTitle}`}>Ақпарат</h2>
          <div className={`t-text ${s.kv}`}><span className={s.muted}>Бағасы</span><span className="w-600">{fmt(o.price)}</span><span className={s.line16} /></div>
          <div className={`t-text ${s.kv}`}><span className={s.muted}>Төлем тәсілі</span><span className="w-600">Kaspi Pay</span><span className={s.line16} /></div>
          <button className={s.cell} onClick={() => haptic.tap()}><span className={s.rowTitle}>Чек</span><img src={chev} width={18} height={18} alt="" /></button>
          {state === "used" && <button className={`${s.cell} ${s.cellTop}`} onClick={() => go("/rate/" + pack.id)}><span className={s.rowTitle}>Бағалау</span><span className={s.cellAction}>Бағала</span></button>}
        </section>

        {soon && (
          <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 3 }}>
            <button className={`${s.cell} ${s.cell2}`} onClick={() => go("/extend/" + pack.id)}>
              <span className={s.rowText}><span className={s.rowTitle}>Мерзімін ұзарту</span><span className={s.cellSub}>Бір рет тегін, кейін ақылы</span></span>
              <img src={chev} width={18} height={18} alt="" />
            </button>
          </section>
        )}

        <section className={`${s.card} ${s.group} rise`} style={{ ["--i" as string]: 3 }}>
          <button className={s.cell} onClick={() => haptic.tap()}><span className={`${s.rowTitle} ${s.linkText}`}>Мәселе туралы жазу</span></button>
        </section>
      </div>

      {!inTelegram && (
        <div className={s.bar}>
          {usable && <button className={`${s.btn} ${s.btn2}`} onClick={scan.onClick}><img src={qr} width={22} height={22} alt="" />Сканерлеу</button>}
          <button className={`${s.btn} ${s.shine}`} onClick={usable ? order.onClick : rebuy.onClick}>{usable ? order.text : rebuy.text}</button>
        </div>
      )}
    </div>
  );
}
