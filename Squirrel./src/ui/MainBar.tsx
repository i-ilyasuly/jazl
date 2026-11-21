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
import { Sticker, type StickerName } from "./Sticker";
export function DoneHero({ top, title, text, sticker = "party" }: { top: number; title: string; text: string; sticker?: StickerName }) {
  return (
    <div className={s.done} style={{ top: `calc(${top - 48}px + var(--top-shift))` }}>
      <Sticker name={sticker} size={120} />
      <h2 className={s.doneTitle}>{title}</h2>
      <p className={`t-sub2 ${s.doneText}`}>{text}</p>
    </div>
  );
}
