// Figma «13 · Сыйлау»: «Сыйлау / Алушы таңдалмаған» 13886:33966, «Алушы таңдалды» 13886:34102.
// Өлшемдер Figma-дан емес, 18-ереже бойынша: UI kit шкаласы + 4/8px тор (шет 16, жол 48/68, блок арасы 12).
// «Сыйлау» — алушыға; «Сілтеме» — төлеп, сілтемені кез келген чатқа жіберу (Telegram-ның нативті бөлісу терезесі).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { findOffer, fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { contacts, sendGift, type Contact } from "../store";
import { haptic, inTelegram, tg, useBackButton, useBottomButtons } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { Switch } from "../ui/SubPage";
import { TelegramChrome } from "../ui/TelegramChrome";
import { usePayFlow } from "../ui/usePayFlow";
import chev from "../assets/icons/chevRight.svg";
import s from "./GiftSend.module.css";

const MAX = 120;

/** Сыйлық сілтемесін Telegram чатына жіберу (нативті бөлісу терезесі). */
export function shareGift(id: string, pack: string) {
  const link = `${window.location.origin}/#/gift/open/${id}`;
  const url = "https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(`🎁 Саған Jazl+ сыйлығы: ${pack}`);
  if (inTelegram && tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank", "noopener");
}

function ContactSheet({ onPick, onClose }: { onPick: (c: Contact) => void; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => { haptic.soft(); setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet} role="dialog" aria-label="Алушы">
        <span className={s.grabber} />
        <h2 className="t-title3 w-700">Кімге сыйлайсың?</h2>
        <p className={`t-sub2 ${s.muted}`}>Telegram контактілерің</p>
        <div className={s.list}>
          {contacts.map((c) => (
            <button key={c.username} className={s.contact} onClick={() => { haptic.select(); onPick(c); }}>
              <span className={s.avatar} style={{ background: c.color }}>{c.name[0]}</span>
              <span className={s.cText}><span className="t-text">{c.name}</span><span className={`t-sub2 ${s.muted}`}>@{c.username}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GiftSend() {
  const { id } = useParams();
  const o = findOffer(id);
  const go = useGo();
  const flow = usePayFlow();
  const [to, setTo] = useState<Contact | null>(null);
  const [msg, setMsg] = useState("");
  const [anon, setAnon] = useState(false);
  const [picking, setPicking] = useState(false);
  const busy = flow.sheetOpen || picking;
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !busy);
  useEffect(() => { if (/[?&]to=1/.test(window.location.hash)) { setTo(contacts[0]); setMsg("Туған күніңмен! Донер менің атымнан 🎉"); } }, []);

  const done = useCallback((gid: string, link: boolean) => {
    go("/profile/gift/" + gid, "fade", { replace: true });
    if (link) window.setTimeout(() => shareGift(gid, o.title), 350);
  }, [go, o.title]);
  const send = useCallback(() => {
    if (!to) { haptic.warning(); setPicking(true); return; }
    flow.pay({ ...o, title: `Сыйлық · ${o.title}` }, () => done(sendGift(o.id, to, msg.trim(), anon), false));
  }, [to, flow, o, msg, anon, done]);
  const byLink = useCallback(() => flow.pay({ ...o, title: `Сыйлық · ${o.title}` }, () => done(sendGift(o.id, null, msg.trim(), anon), true)), [flow, o, msg, anon, done]);
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
          <button className={s.row} onClick={() => { haptic.tap(); setPicking(true); }}>
            {to ? <span className={s.avatar} style={{ background: to.color }}>{to.name[0]}</span> : <span className={`${s.avatar} ${s.plus}`}>+</span>}
            <span className={s.cText}>
              <span className={`t-text ${to ? "w-600" : s.link}`}>{to ? to.name : "Алушыны таңда"}</span>
              <span className={`t-sub2 ${s.muted}`}>{to ? "@" + to.username : "Telegram контактілерінен"}</span>
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
      {picking && <ContactSheet onPick={(c) => { setTo(c); setPicking(false); }} onClose={() => setPicking(false)} />}
      {flow.node}
    </div>
  );
}
