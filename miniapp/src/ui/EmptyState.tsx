// Бос күй: үйрек стикері + тақырып + түсіндірме. Figma-да екі түрі бар:
//  • ішкі беттер («Үнем / Бос күй» т.б.): стикер y=300, тақырып 432, мәтін 468, әрекет — төменгі MainButton;
//  • негізгі беттер («Пакеттерім / Бос күй», «Таңдаулы / Бос күй»): аралығы 16, батырма мәтіннің астында.
import { useMemo } from "react";
import { inTelegram, useBottomButtons } from "../telegram";
import { Sticker, type StickerName } from "./Sticker";
import s from "./EmptyState.module.css";

export function EmptyState({ sticker, title, text, action, top = 300, inline }: { sticker: StickerName; title: string; text: string; action?: { text: string; onClick: () => void }; top?: number; inline?: boolean }) {
  const main = useMemo(() => action ?? { text: "", onClick: () => {} }, [action]);
  useBottomButtons(main, undefined, Boolean(action) && !inline);
  return (
    <div className={`${s.box} ${inline ? s.inline : ""}`} style={{ top: `calc(${top}px + var(--top-shift))` }}>
      <Sticker name={sticker} />
      <h2 className={s.title}>{title}</h2>
      <p className={`t-sub2 ${s.text}`}>{text}</p>
      {action && inline && <button className={s.btn} onClick={action.onClick}>{action.text}</button>}
      {action && !inline && !inTelegram && <div className={s.bar}><button className={s.main} onClick={action.onClick}>{action.text}</button></div>}
    </div>
  );
}
