// Figma: «Хабарландырулар / Негізгі» (13886:37921), «Жаңа жоқ» (13886:38041), «Рұқсат жоқ» (13886:38075),
// «Бот рұқсаты: диалог» (13886:38203), «қосылды» (13886:38349), «берілмеді» (13886:38473)
import { useEffect, useState } from "react";
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { askWriteAccess, botCanWrite, haptic, inTelegram, kv, openChat } from "../telegram";
import { useGo } from "../nav";
import { readNotice, setNoticePref, useNoticePrefs, useNotices, type NoticePrefs } from "../store";
import { Confirm } from "../ui/Confirm";
import { Group, Row, SkRows, SubPage, Switch } from "../ui/SubPage";
import s from "./Notifications.module.css";

const settings: [keyof NoticePrefs, string, string][] = [
  ["expiry", "Мерзім ескертулері", "Пакет бітер алдында хабарлау"],
  ["rating", "Бағалау сұраулары", "Пайдаланғаннан кейін"],
  ["offers", "Жаңа ұсыныстар", "Таңдаулы мекемелерден"],
  ["promo", "Акциялар", "Арнайы ұсыныстар мен жеңілдіктер"],
];

type Access = "ok" | "need" | "denied";
/** Демо: ?bot=no — рұқсат жоқ, ?bot=denied — берілмеді. Telegram ішінде — allows_write_to_pm. */
function initialAccess(): Access {
  const m = window.location.hash.match(/bot=(no|denied)/);
  if (m) return m[1] === "no" ? "need" : "denied";
  return botCanWrite() === false ? "need" : "ok";
}

export function Notifications() {
  const { loading } = useMock("notifications", true, 450);
  const list = useNotices();
  const prefs = useNoticePrefs();
  const go = useGo();
  const [access, setAccess] = useState<Access>(initialAccess);
  const [ask, setAsk] = useState(false);
  const [snack, setSnack] = useState(false);
  useEffect(() => { if (!snack) return; const t = setTimeout(() => setSnack(false), 2600); return () => clearTimeout(t); }, [snack]);
  const granted = () => { haptic.success(); setAccess("ok"); setSnack(true); kv.set("jazl_bot_ok", "1"); };
  const refused = () => { haptic.warning(); setAccess("denied"); };
  // Telegram ішінде — нативті requestWriteAccess диалогы; браузерде — соның көшірмесі
  const request = () => {
    haptic.medium();
    if (inTelegram) void askWriteAccess().then((ok) => (ok ? granted() : refused()));
    else setAsk(true);
  };

  if (demoEmpty() || !list.length) return <SubPage title="Хабарландырулар"><EmptyState sticker="sleep" title="Жаңа хабарлама жоқ" text="Мерзім ескертулері мен жаңа ұсыныстар осында көрінеді" /></SubPage>;
  return (
    <SubPage title="Хабарландырулар">
      {access !== "ok" && (
        <div key={access} className={`${s.banner} ${access === "denied" ? s.warn : ""} rise`} role="status">
          <span className={s.bar} />
          <p className={`t-sub2 w-600 ${s.bannerText}`}>{access === "need" ? "Хабарлама алу үшін ботқа рұқсат бер" : "Рұқсат берілмеді. Ботты ашып, Start түймесін бас."}</p>
          <button className={`t-sub2 w-600 ${s.bannerBtn}`} onClick={access === "need" ? request : () => { haptic.tap(); openChat("oylarbot"); }}>
            {access === "need" ? "Рұқсат беру" : "Ботты ашу"}
          </button>
          <span className={s.mark} aria-hidden>”</span>
        </div>
      )}
      <Group header="Жаңа" i={0}>
        {loading ? <SkRows n={2} circle={false} /> : list.map((n) => (
          <Row key={n.id} wrap inset={38} title={n.title} sub={n.sub} onClick={() => { if (!n.read) { haptic.select(); readNotice(n.id); } if (n.to) go(n.to); }}
            left={<span className={`${s.dot} ${n.read ? s.read : ""}`} />}
            right={<span className={`t-cap1 ${s.time}`}>{n.time}</span>} />
        ))}
      </Group>
      <Group header="Баптаулар" i={1}>
        {settings.map(([k, t, sub]) => (
          <Row key={k} inset={16} title={t} sub={sub} right={<Switch on={prefs[k]} onChange={(v) => setNoticePref(k, v)} />} />
        ))}
      </Group>
      {snack && <div className={`t-sub2 ${s.snack}`} role="status">Хабарландырулар қосылды</div>}
      {ask && <Confirm title="Хабарламаға рұқсат" text="Jazl+ ботына сізге хабарлама жіберуге рұқсат бересіз бе?" cancel="Бас тарту" ok="Рұқсат ету"
        onClose={() => setAsk(false)} onOk={granted} onCancel={refused} />}
    </SubPage>
  );
}
