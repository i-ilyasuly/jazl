// Figma «13 · Сыйлау»: «Сыйлау / Алушы таңдалмаған» 13886:33966, «Алушы таңдалды» 13886:34102.
// Өлшемдер Figma-дан емес, 18-ереже бойынша: UI kit шкаласы + 4/8px тор (шет 16, жол 48/68, блок арасы 12).
// «Сыйлау» — төлем → Telegram-ның нативті контакт/чат таңдау терезесі (WebApp.shareMessage, жоқ болса t.me/share).
// Mini App контактілер тізімін өзі оқи алмайды: таңдау тек Telegram терезесінде. «Сілтеме» — төлеп, сілтемені көшіру.
import { checkoutCard, type CheckoutCard } from "../pay/checkout";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { findOffer, fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { giftLink, prepareGift, sendGift, waitGift } from "../store";
import { haptic, inTelegram, shareToChat, tg, useBackButton, useBottomButtons } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { Switch } from "../ui/SubPage";
import { TelegramChrome } from "../ui/TelegramChrome";
import { usePayFlow } from "../ui/usePayFlow";
import tgIcon from "../assets/icons/vTg.svg";
import s from "./GiftSend.module.css";

const MAX = 120;

/** Сыйлықты Telegram контактісіне/чатына жіберу — нативті таңдау терезесі. */
export async function shareGift(id: string, pack: string): Promise<boolean> {
  const preparedId = await prepareGift(id);
  return shareToChat({ preparedId, url: giftLink(id), text: `🎁 Саған Medeo сыйлығы: ${pack}` });
}

export function GiftSend() {
  const { id } = useParams();
  const o = findOffer(id);
  const go = useGo();
  const flow = usePayFlow();
  const [msg, setMsg] = useState("");
  const [anon, setAnon] = useState(false);
  // Патша (2026-11-17): алушы төлемге ДЕЙІН көрсетіледі. Telegram мини апқа контакт тізімін бермейді, сондықтан — @username.
  // Көрсетілсе: тек сол адам қабылдай алады, төлемнен кейін бірден соның чаты ашылады. Бос қалса — төлемнен кейін Telegram тізімі.
  const [to, setTo] = useState("");
  const user = to.trim().replace(/^@/, "");
  const userOk = /^[A-Za-z0-9_]{4,32}$/.test(user);
  const [snack, setSnack] = useState("");
  const busy = flow.sheetOpen;
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !busy);
  useEffect(() => { if (!snack) return; const t = window.setTimeout(() => setSnack(""), 2400); return () => clearTimeout(t); }, [snack]);

  const gift = { ...o, title: `Сыйлық · ${o.title}` };
  // Карта төлемі: сыйлық серверде төлеммен бірге жасалады (код жауапта келеді)
  const giftCharge = (toUsername?: string) => (card: CheckoutCard) =>
    checkoutCard(o.id, card, { gift: { message: msg.trim() || undefined, anonymous: anon, toUsername }, methodLabel: flow.method?.title });
  // Төлем → сыйлық жасалады → Telegram-ның контакт/чат тізімі ашылады → сыйлық беті
  const send = useCallback(() => {
    if (to.trim() && !userOk) { haptic.error(); setSnack("Username дұрыс емес: латын әріп, сан, _ (4–32)"); return; }
    flow.pay(gift, async (r) => {
      const gid = sendGift(o.id, msg.trim(), anon, userOk ? user : undefined, r?.gift?.code);
      await waitGift(gid); // сервердегі код дайын болсын — сілтеме сонымен жіберіледі
      if (userOk) {
        // Алушының чаты ашылады, хабарлама дайын тұрады (сілтеме көшіріледі де — қажет болса қоюға)
        const text = `🎁 Саған Medeo сыйлығы: ${o.title}\n${giftLink(gid)}`;
        try { await navigator.clipboard.writeText(giftLink(gid)); } catch { /* рұқсат жоқ */ }
        const url = `https://t.me/${user}?text=${encodeURIComponent(text)}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank", "noopener");
      } else await shareGift(gid, o.title);
      go("/profile/gift/" + gid, "fade", { replace: true });
    }, giftCharge(userOk ? user : undefined));
  }, [flow, gift, o.id, o.title, msg, anon, go, to, user, userOk]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Сілтеме»: төлем → сілтеме көшіріледі (кез келген мессенджерге жіберуге болады)
  const byLink = useCallback(() => flow.pay(gift, async (r) => {
    const gid = sendGift(o.id, msg.trim(), anon, undefined, r?.gift?.code);
    await waitGift(gid);
    try { await navigator.clipboard.writeText(giftLink(gid)); haptic.success(); setSnack("Сілтеме көшірілді"); } catch { await shareGift(gid, o.title); }
    window.setTimeout(() => go("/profile/gift/" + gid, "fade", { replace: true }), 900);
  }, giftCharge()), [flow, gift, o.id, o.title, msg, anon, go]); // eslint-disable-line react-hooks/exhaustive-deps
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
          <label className={s.row}>
            <span className={`${s.avatar} ${userOk ? "" : s.tg}`}>{userOk ? <b className={s.letter}>{user.slice(0, 1).toUpperCase()}</b> : <img src={tgIcon} width={24} height={24} alt="" />}</span>
            <span className={s.cText}>
              <input className={`t-text ${s.toInput}`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="@username" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text" />
            </span>
            {to && <button type="button" className={s.clear} onClick={() => { haptic.soft(); setTo(""); }} aria-label="Тазалау" />}
          </label>
        </section>
        {/* Telegram Mini Apps UI Kit «Section Footer»: картаның астындағы бөлек түсініктеме — белгішесі күйге қарай (ақпарат / дұрыс / қате) */}
        <p className={`${s.footer} ${userOk ? s.footOk : to.trim() ? s.footBad : ""} rise`} role={to.trim() && !userOk ? "alert" : undefined}>
          <i className={s.footIcon} aria-hidden />
          <span>{userOk ? <>Тек <b>@{user}</b> қабылдай алады.<br />Төлемнен кейін оның чаты ашылады.</>
            : to.trim() ? "Username: латын әріп, сан және _ · 4–32 таңба"
            : "Бос қалдырсаң — төлемнен кейін Telegram тізімінен алушыны таңдайсың."}</span>
        </p>

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
