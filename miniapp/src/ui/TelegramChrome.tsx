// Telegram толық экран режиміндегі жүйелік батырмалар (сол жақта Жабу/Артқа, оң жақта ⌄ ⋯).
// Нағыз Telegram-да бұларды клиенттің өзі салады, сондықтан тек браузерде көрсетеміз.
import { inTelegram } from "../telegram";
import closeIcon from "../assets/icons/close.svg";
import backIcon from "../assets/icons/back.svg";
import collapseIcon from "../assets/icons/collapse.svg";
import dotsIcon from "../assets/icons/dots.svg";
import s from "./TelegramChrome.module.css";

export function TelegramChrome({ mode, onBack }: { mode: "close" | "back"; onBack?: () => void }) {
  if (inTelegram) return null;
  return (
    <>
      <button className={`${s.pill} ${mode === "back" ? s.back : s.close}`} onClick={onBack} aria-label={mode === "back" ? "Артқа" : "Жабу"}>
        <img src={mode === "back" ? backIcon : closeIcon} className={s.leftIcon} alt="" />
        <span className={`t-sub2 w-600 ${s.label}`}>{mode === "back" ? "Артқа" : "Жабу"}</span>
      </button>
      <div className={`${s.pill} ${s.menu}`} aria-hidden>
        <img src={collapseIcon} className={s.collapse} alt="" />
        <img src={dotsIcon} className={s.dots} alt="" />
      </div>
    </>
  );
}
