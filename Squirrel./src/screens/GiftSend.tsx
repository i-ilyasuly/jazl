// Figma «13 · Сыйлау»: «Сыйлау / Алушы таңдалмаған» 13886:33966, «Алушы таңдалды» 13886:34102.
// Өлшемдер Figma-дан емес, 18-ереже бойынша: UI kit шкаласы + 4/8px тор (шет 16, жол 48/68, блок арасы 12).
// «Сыйлау» — төлем → Telegram-ның нативті контакт/чат таңдау терезесі (WebApp.shareMessage, жоқ болса t.me/share).
// Mini App контактілер тізімін өзі оқи алмайды: таңдау тек Telegram терезесінде. «Сілтеме» — төлеп, сілтемені көшіру.
import { checkoutCard, type CheckoutCard } from "../pay/checkout";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { findOffer, fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { giftLink, prepareGift, sendGift, sendGiftsBulk, waitGift } from "../store";
import { copyText } from "../telegram";
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
  return shareToChat({ preparedId, url: giftLink(id), text: `🎁 Саған Squirrel сыйлығы: ${pack}` });
}

export function GiftSend() {
  const { id } = useParams();
  // Ұсыныс бетінде таңдалған дана нұсқасы (?units=8): сыйлық сол көлеммен есептеледі
  const units = Number(new URLSearchParams(useLocation().search).get("units")) || 0;
  const o0 = findOffer(id);
  const z = units ? o0.sizes?.find((x) => x.units === units) : undefined;
  const o = z ? { ...o0, ...z, title: o0.title.replace(/· \d+ /, `· ${z.units} `) } : o0;
  const sized = z ? { units: z.units } : {};
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
  // Корпоративтік сыйлық (Патша, 2026-11-18): бір төлеммен 2–50 адамға, әрқайсысына жеке сілтеме (30 күн)
  const [count, setCount] = useState(1);
  const bulk = count > 1;
  const [links, setLinks] = useState<string[] | null>(null);
  const busy = flow.sheetOpen;
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !busy);
  useEffect(() => { if (!snack) return; const t = window.setTimeout(() => setSnack(""), 2400); return () => clearTimeout(t); }, [snack]);

  const gift = { ...o, title: bulk ? `Сыйлық · ${o.title} × ${count}` : `Сыйлық · ${o.title}`, price: o.price * count, oldPrice: o.oldPrice * count };
  // Карта төлемі: сыйлық серверде төлеммен бірге жасалады (код жауапта келеді)
  const giftCharge = (toUsername?: string) => (card: CheckoutCard) =>
    checkoutCard(o.id, card, { ...sized, gift: { message: msg.trim() || undefined, anonymous: anon, toUsername, ...(bulk ? { count } : {}) }, methodLabel: flow.method?.title });
  // Көп сыйлық: төлем → барлық сілтеме бір тізімде (көшіру, тарату)
  const payBulk = useCallback(() => flow.pay(gift, async (r) => {
    const list = await sendGiftsBulk(o.id, count, msg.trim(), anon, r?.gifts?.map((x) => x.code), flow.method?.title, z?.units);
    if (!list.length) { haptic.error(); setSnack("Сыйлықтар жасалмады. Қайталап көр."); return; }
    haptic.success(); setLinks(list);
  }, giftCharge()), [flow, gift, o.id, count, msg, anon]); // eslint-disable-line react-hooks/exhaustive-deps
  const copyAll = useCallback(() => { if (!links) return; void copyText(links.map((l, i) => `${i + 1}. ${l}`).join("\n")); haptic.success(); setSnack(`${links.length} сілтеме көшірілді`); }, [links]);
  // Төлем → сыйлық жасалады → Telegram-ның контакт/чат тізімі ашылады → сыйлық беті
  const send = useCallback(() => {
    if (bulk) { payBulk(); return; }
    if (to.trim() && !userOk) { haptic.error(); setSnack("Username дұрыс емес: латын әріп, сан, _ (4–32)"); return; }
    flow.pay(gift, async (r) => {
      const gid = sendGift(o.id, msg.trim(), anon, userOk ? user : undefined, r?.gift?.code, 7, z?.units);
      await waitGift(gid); // сервердегі код дайын болсын — сілтеме сонымен жіберіледі
      if (userOk) {
        // Алушының чаты ашылады, хабарлама дайын тұрады (сілтеме көшіріледі де — қажет болса қоюға)
        const text = `🎁 Саған Squirrel сыйлығы: ${o.title}\n${giftLink(gid)}`;
        try { await navigator.clipboard.writeText(giftLink(gid)); } catch { /* рұқсат жоқ */ }
        const url = `https://t.me/${user}?text=${encodeURIComponent(text)}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank", "noopener");
      } else await shareGift(gid, o.title);
      go("/profile/gift/" + gid, "fade", { replace: true });
    }, giftCharge(userOk ? user : undefined));
  }, [flow, gift, o.id, o.title, msg, anon, go, to, user, userOk, bulk, payBulk]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Сілтеме»: төлем → сілтеме көшіріледі (кез келген мессенджерге жіберуге болады)
  const byLink = useCallback(() => flow.pay(gift, async (r) => {
    const gid = sendGift(o.id, msg.trim(), anon, undefined, r?.gift?.code, 7, z?.units);
    await waitGift(gid);
    try { await navigator.clipboard.writeText(giftLink(gid)); haptic.success(); setSnack("Сілтеме көшірілді"); } catch { await shareGift(gid, o.title); }
    window.setTimeout(() => go("/profile/gift/" + gid, "fade", { replace: true }), 900);
  }, giftCharge()), [flow, gift, o.id, o.title, msg, anon, go]); // eslint-disable-line react-hooks/exhaustive-deps
  const main = useMemo(() => links ? { text: "Барлығын көшіру", shine: true, onClick: copyAll }
    : { text: bulk ? `${count} сыйлық · ${fmt(o.price * count)}` : `Сыйлау · ${fmt(o.price)}`, shine: true, onClick: send }, [o.price, send, bulk, count, links, copyAll]);
  const second = useMemo(() => links ? { text: "Сыйлықтарым", position: "left" as const, onClick: () => go("/profile/gifts", "fade", { replace: true }) }
    : bulk ? undefined : { text: "Сілтеме", position: "left" as const, onClick: byLink }, [byLink, bulk, links, go]);
  useBottomButtons(main, second, !busy);

  if (links) return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <div className={s.col}>
        <div className={s.hero}>
          <Sticker name="gift" size={112} />
          <h1 className="t-title2 w-700">{`${links.length} сыйлық дайын`}</h1>
          <p className={`t-sub2 ${s.muted}`}>Әр адамға бір сілтеме жібер: ол ашып, пакетті өзіне қабылдайды</p>
        </div>
        <section className={`${s.card} rise`}>
          {links.map((l, i) => (
            <div key={l} className={s.row}>
              <span className={`${s.avatar} ${s.num}`}><b className={s.letter}>{i + 1}</b></span>
              <span className={s.cText}><span className={`t-sub2 ${s.link}`}>{l.replace(/^https?:\/\//, "")}</span></span>
              <button type="button" className={s.copy} onClick={() => { void copyText(l); haptic.select(); setSnack("Көшірілді"); }}>Көшіру</button>
            </div>
          ))}
        </section>
        <p className={`t-sub2 ${s.note} rise`} style={{ ["--i" as string]: 1 }}>
          {"Сілтемелер 30 күн жарамды. Қабылданбаған сыйлық саған пакет болып қайтарылады — оны өзің қолдана не қайта сыйлай аласың. Ақшасын сатып алғаннан кейін 14 күн ішінде, сыйлық әлі қабылданбаса қайтаруға болады."}
        </p>
      </div>
      {!inTelegram && (
        <div className={s.bar}>
          <button className={`${s.btn} ${s.btn2}`} onClick={second!.onClick}>{second!.text}</button>
          <button className={`${s.btn} ${s.shine}`} onClick={copyAll}>{main.text}</button>
        </div>
      )}
      {snack && <div className={`t-sub2 ${s.snack}`} role="status">{snack}</div>}
    </div>
  );

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
          <div className={s.row}>
            <span className={s.cText}><span className="t-text">Неше адамға</span><span className={`t-sub2 ${s.muted}`} style={{ whiteSpace: "normal" }}>{bulk ? "Корпоративтік: әр адамға жеке сілтеме" : "Әріптестерге, командаға — 50-ге дейін"}</span></span>
            <span className={s.stepper}>
              <button type="button" aria-label="Азайту" disabled={count <= 1} onClick={() => { haptic.select(); setCount(Math.max(1, count - 1)); }}>−</button>
              <b>{count}</b>
              <button type="button" aria-label="Көбейту" disabled={count >= 50} onClick={() => { haptic.select(); setCount(Math.min(50, count + (count >= 10 ? 5 : 1))); }}>+</button>
            </span>
          </div>
        </section>

        {!bulk && <>
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
        </>}

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
          {bulk ? "Әр адамға жеке сілтеме. 30 күн ішінде қабылданбаған сыйлық саған қайтарылады. Пакет мерзімі әркім қабылдаған сәттен басталады."
            : <>Алушы сыйлықты <b className={s.blue}>7 күн</b> ішінде қабылдамаса, пакет саған <b className={s.green}>қайтарылады</b>. 30 күн мерзім алушы қабылдаған сәттен басталады.</>}
        </p>
      </div>

      {!inTelegram && (
        <div className={s.bar}>
          {!bulk && <button className={`${s.btn} ${s.btn2}`} onClick={byLink}>Сілтеме</button>}
          <button className={`${s.btn} ${s.shine}`} disabled={flow.busy} onClick={send}>{flow.busy ? <span className={s.spinner} /> : main.text}</button>
        </div>
      )}
      {snack && <div className={`t-sub2 ${s.snack}`} role="status">{snack}</div>}
      {flow.node}
    </div>
  );
}
