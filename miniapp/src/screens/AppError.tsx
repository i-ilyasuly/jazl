// Figma «19 · Қате және желі күйлері»: «Желі жоқ» 13886:40201, «Сервер қатесі» 13886:40239,
// «Техникалық жұмыстар» 13886:40281, «Сессия мерзімі өтті» 13940:8477, «Аккаунт шектелді» 13940:8497,
// «Қала қолдау таппайды» 13940:8517. Бэкенд қосылғанда API жауабы осы беттерге бағыттайды
// (желі қатесі → offline, 5xx → server, 503 → maintenance, 401 → session, 403 → banned).
// Демо: #/error/<offline|server|maintenance|session|banned|city>
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { SUPPORT_BOT } from "../config";
import { useGo } from "../nav";
import { setSettings } from "../store";
import { haptic, inTelegram, openChat, tg, useBackButton, useBottomButtons } from "../telegram";
import { Sticker, type StickerName } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import s from "./PayResult.module.css";

export const errorKinds = ["offline", "server", "maintenance", "session", "banned", "city"] as const;
type Kind = (typeof errorKinds)[number];
const copy: Record<Kind, { sticker: StickerName; title: string; text: string; left?: string; main: string }> = {
  offline: { sticker: "offline", title: "Желі жоқ", text: "Интернетті тексеріп, қайта көр", main: "Қайта көру" },
  server: { sticker: "cry", title: "Қате орын алды", text: "Біз оны түзетіп жатырмыз. Сәл күтіп, қайта көр", left: "Қолдауға жазу", main: "Қайта көру" },
  maintenance: { sticker: "repair", title: "Техникалық жұмыстар", text: "Қызмет уақытша қолжетімсіз. Шамамен 30 минуттан кейін қайта кір", main: "Тексеру" },
  session: { sticker: "sleep", title: "Сессия аяқталды", text: "Қауіпсіздік үшін қолданбаны қайта аш.", main: "Қайта ашу" },
  banned: { sticker: "stop", title: "Аккаунт уақытша шектелген", text: "Күдікті әрекеттер байқалды. Қолдауға жазсаң, көмектесеміз.", main: "Қолдауға жазу" },
  city: { sticker: "search", title: "Қалаңда Jazl+ әлі жоқ", text: "Қала ашылғанда хабарлаймыз.", left: "Басқа қала", main: "Хабарла" },
};

export function AppError() {
  const { kind = "server" } = useParams();
  const k = ((errorKinds as readonly string[]).includes(kind) ? kind : "server") as Kind;
  const c = copy[k];
  const go = useGo();
  const [notified, setNotified] = useState(false);
  const [checking, setChecking] = useState(false);
  // Желі/сервер қайта тексеріледі: желі болса бастапқы бетке қайтамыз (кейін — сол сұрауды қайталау)
  const retry = useCallback(() => {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      if (k === "offline" && !navigator.onLine) { haptic.error(); return; }
      haptic.success(); go("/", "fade", { replace: true });
    }, 700);
  }, [k, go]);
  const close = useCallback(() => { if (inTelegram && (k === "session" || k === "banned")) tg?.close?.(); else go("/", "fade", { replace: true }); }, [k, go]);
  useBackButton(close);
  const mainText = k === "city" && notified ? "Хабарлаймыз" : c.main;
  const main = useMemo(() => ({ text: mainText, onClick: () => {
    haptic.medium();
    if (k === "banned") openChat(SUPPORT_BOT);
    else if (k === "session") window.location.reload();
    else if (k === "city") { if (!notified) { haptic.success(); setSettings({ astanaNotify: true }); setNotified(true); } }
    else retry();
  } }), [mainText, k, notified, retry]);
  const left = useMemo(() => c.left ? ({ text: c.left, position: "left" as const, onClick: () => {
    haptic.tap();
    if (k === "city") go("/profile/city", "forward", { replace: true }); else openChat(SUPPORT_BOT);
  } }) : undefined, [c.left, k, go]);
  useBottomButtons(main, left);
  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={s.body}>
        <Sticker name={c.sticker} size={120} className={s.sticker} />
        <h1 className={s.title}>{c.title}</h1>
        <p className={s.text}>{c.text}</p>
      </div>
      {!inTelegram && (
        <div className={s.bar}>
          {left && <button className={`${s.btn} ${s.second}`} onClick={left.onClick}>{left.text}</button>}
          <button className={s.btn} disabled={checking} onClick={main.onClick}>{checking ? "Тексерілуде…" : main.text}</button>
        </div>
      )}
    </div>
  );
}
