// Беттің негізгі әрекеті: Telegram ішінде нативті MainButton, браузерде Figma-дағы төменгі жолақ (412×66, батырма 392×50 r8).
import { useMemo } from "react";
import { inTelegram, useBottomButtons } from "../telegram";
import s from "./MainBar.module.css";

export function MainBar({ text, onClick }: { text: string; onClick: () => void }) {
  const main = useMemo(() => ({ text, onClick }), [text, onClick]);
  useBottomButtons(main);
  if (inTelegram) return null;
  return <div className={s.bar}><button className={s.btn} onClick={onClick}>{text}</button></div>;
}

/** «Өтінім қабылданды» сияқты нәтиже: жасыл белгі 72, тақырып, түсіндірме. */
import ok from "../assets/icons/ok72.svg";
export function DoneHero({ top, title, text }: { top: number; title: string; text: string }) {
  return (
    <div className={s.done} style={{ top: `calc(${top}px + var(--top-shift))` }}>
      <img src={ok} width={72} height={72} className={s.ok} alt="" />
      <h2 className={s.doneTitle}>{title}</h2>
      <p className={`t-sub2 ${s.doneText}`}>{text}</p>
    </div>
  );
}
