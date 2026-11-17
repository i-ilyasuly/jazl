// Figma «13 · Сыйлау»: «Сыйлау / Алушы таңдалмаған» 13886:33966, «Алушы таңдалды» 13886:34102.
// Өлшемдер Figma-дан емес, 18-ереже бойынша: UI kit шкаласы + 4/8px тор (шет 16, жол 48/68, блок арасы 12).
// «Сыйлау» — төлем → Telegram-ның нативті контакт/чат таңдау терезесі (WebApp.shareMessage, жоқ болса t.me/share).
// Mini App контактілер тізімін өзі оқи алмайды: таңдау тек Telegram терезесінде. «Сілтеме» — төлеп, сілтемені көшіру.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { findOffer, fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { giftLink, prepareGift, sendGift, waitGift } from "../store";
import { haptic, inTelegram, shareToChat, useBackButton, useBottomButtons } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { Switch } from "../ui/SubPage";
import { TelegramChrome } from "../ui/TelegramChrome";
import { usePayFlow } from "../ui/usePayFlow";
import chev from "../assets/icons/chevRight.svg";
import tgIcon from "../assets/icons/vTg.svg";
import s from "./GiftSend.module.css";

const MAX = 120;

/** Сыйлықты Telegram контактісіне/чатына жіберу — нативті таңдау терезесі. */
export async function shareGift(id: string, pack: string): Promise<boolean> {
  const preparedId = await prepareGift(id);
  return shareToChat({ preparedId, url: giftLink(id), text: `🎁 Саған Jazl+ сыйлығы: ${pack}` });
}

export function GiftSend() {
  const { id } = useParams();
  const o = findOffer(id);
  const go = useGo();
  const flow = usePayFlow();
  const [msg, setMsg] = useState("");
  const [anon, setAnon] = useState(false);
  const [snack, setSnack] = useState("");
  const busy = flow.sheetOpen;
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !busy);
  useEffect(() => { if (!snack) return; const t = window.setTimeout(() => setSnack(""), 2400); return () => clearTimeout(t); }, [snack]);

  const gift = { ...o, title: `Сыйлық · ${o.title}` };
  // Төлем → сыйлық жасалады → Telegram-ның контакт/чат тізімі ашылады → сыйлық беті
  const send = useCallback(() => flow.pay(gift, async () => {
    const gid = sendGift(o.id, msg.trim(), anon);
    await waitGift(gid); // сервердегі код дайын болсын — сілтеме сонымен жіберіледі
    await shareGift(gid, o.title);
    go("/profile/gift/" + gid, "fade", { replace: true });
  }), [flow, gift, o.id, o.title, msg, anon, go]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Сілтеме»: төлем → сілтеме көшіріледі (кез келген мессенджерге жіберуге болады)
  const byLink = useCallback(() => flow.pay(gift, async () => {
    const gid = sendGift(o.id, msg.trim(), anon);
    await waitGift(gid);
    try { await navigator.clipboard.writeText(giftLink(gid)); haptic.success(); setSnack("Сілтеме көшірілді"); } catch { await shareGift(gid, o.title); }
    window.setTimeout(() => go("/profile/gift/" + gid, "fade", { replace: true }), 900);
  }), [flow, gift, o.id, o.title, msg, anon, go]); // eslint-disable-line react-hooks/exhaustive-deps
  const main = useMemo(() => ({ text: `Сыйлау · ${fmt(o.price)}`, shine: true, onClick: send }), [o.price, send]);
  const second = useMemo(() => ({ text: "Сілтеме", position: "left" as const, onClick: byLink }), [byLink]);
  useBottomButtons(main, second, !busy);

  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <div className={s.col}>
        <div className={s.hero}>
          <Sticker name="gift" size={112} />
          <h1 className="t-title2 w-700">Пакетті сыйла</h1>
          <p className={`t-sub2 ${s.muted}`}>{o.title} · {o.venue}</p>
        </div>

        <section className={`${s.card} rise`}>
          <h2 className={`t-sub2 w-600 ${s.head}`}>Кімге</h2>
          <button className={s.row} onClick={send}>
            <span className={`${s.avatar} ${s.tg}`}><img src={tgIcon} width={24} height={24} alt="" /></span>
            <span className={s.cText}>
              <span className={`t-text ${s.link}`}>Telegram контактілерінен таңда</span>
              <span className={`t-sub2 ${s.muted}`}>Төлемнен кейін тізім ашылады</span>
            </span>
            <img src={chev} width={18} height={18} alt="" />
          </button>
        </section>

        <section className={`${s.card} rise`} style={{ ["--i" as string]: 1 }}>
          <h2 className={`t-sub2 w-600 ${s.head}`}>Құттықтау<span className={`t-cap1 ${s.count}`}>{msg.length} / {MAX}</span></h2>
          <div className={s.field}>
            <textarea className={s.input} rows={2} maxLength={MAX} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Құттықтау жазуы (міндетті емес)" />
          </div>
        </section>

        <section className={`${s.card} rise`} style={{ ["--i" as string]: 2 }}>
          <div className={s.row}>
            <span className={s.cText}><span className="t-text">Атымды жасыру</span><span className={`t-sub2 ${s.muted}`}>Алушы сенің атыңды көрмейді</span></span>
            <Switch on={anon} onChange={setAnon} />
          </div>
        </section>

        <p className={`t-sub2 ${s.note} rise`} style={{ ["--i" as string]: 3 }}>
          Алушы сыйлықты <b className={s.blue}>7 күн</b> ішінде қабылдамаса, пакет саған <b className={s.green}>қайтарылады</b>. 30 күн мерзім алушы қабылдаған сәттен басталады.
        </p>
      </div>

      {!inTelegram && (
        <div className={s.bar}>
          <button className={`${s.btn} ${s.btn2}`} onClick={byLink}>Сілтеме</button>
          <button className={`${s.btn} ${s.shine}`} disabled={flow.busy} onClick={send}>{flow.busy ? <span className={s.spinner} /> : main.text}</button>
        </div>
      )}
      {snack && <div className={`t-sub2 ${s.snack}`} role="status">{snack}</div>}
      {flow.node}
    </div>
  );
}
