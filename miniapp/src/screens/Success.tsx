// Figma: «Сатып алу / Сәтті / Light» (13886:25101)
import { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { fmt, offers } from "../mocks/offers";
import { useGo } from "../nav";
import { inTelegram, useBottomButtons } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Timeline } from "../ui/Timeline";
import halo1 from "../assets/icons/halo1.svg";
import halo2 from "../assets/icons/halo2.svg";
import confetti from "../assets/icons/confetti.svg";
import okCircle from "../assets/icons/okCircle.svg";
import okCheck from "../assets/icons/okCheck.svg";
import burger from "../assets/icons/cardBurger.svg";
import s from "./Success.module.css";

export function Success() {
  const { id } = useParams();
  const offer = offers.find((o) => o.id === id) ?? offers[0];
  const go = useGo();
  const toPacks = useCallback(() => go("/packs", "forward", { replace: true }), [go]);
  const close = useCallback(() => go("/", "fade", { replace: true }), [go]);
  const main = useMemo(() => ({ text: "Пакеттерге өту", onClick: toPacks }), [toPacks]);
  const secondary = useMemo(() => ({ text: "Жабу", onClick: close, position: "bottom" as const }), [close]);
  useBottomButtons(main, secondary);

  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={close} />
      <h1 className={s.title}>Пакет сатып алынды</h1>
      <img src={halo1} className={s.halo1} alt="" />
      <img src={halo2} className={s.halo2} alt="" />
      <img src={confetti} className={s.confetti} alt="" />
      <img src={okCircle} className={s.circle} alt="" />
      <svg className={s.check} width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden>
        <image href={okCheck} width="64" height="64" className={s.checkImg} />
      </svg>
      <p className={`t-sub2 ${s.paid}`}>Төлем қабылданды · {fmt(offer.price)}</p>

      <div className={s.card}>
        <div className={s.head}>
          <span className={s.icon}><img src={burger} width={32} height={32} alt="" /></span>
          <span className={s.headText}>
            <span className="t-headline">{offer.title}</span>
            <span className={`t-sub2 ${s.muted}`}>{offer.venue} · {offer.distance}</span>
          </span>
        </div>
        <Timeline total={offer.units} />
        <p className="t-sub2 w-600">{offer.units} / {offer.units} · 30 күн</p>
        <div className={s.next}>
          <span className={s.emoji} />
          <span className={`t-sub2 w-600 ${s.nextText}`}>Келесі қадам: мекемеде «Jazl бойынша» деп айт</span>
        </div>
      </div>

      {!inTelegram && (
        <>
          <button className={`${s.btn} ${s.main}`} onClick={toPacks}>Пакеттерге өту</button>
          <button className={`${s.btn} ${s.secondary}`} onClick={close}>Жабу</button>
        </>
      )}
    </div>
  );
}
