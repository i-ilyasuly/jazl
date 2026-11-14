// Figma: «Жуырда / Санат парағы» 13886:15399, «Рұқсат диалогы» 13886:15701, «Қосылды» 13886:15957
import { useEffect, useMemo, useState } from "react";
import { toggleSoon, useSoon } from "../store";
import { askWriteAccess, haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Confirm } from "./Confirm";
import s from "./SoonSheet.module.css";

export function SoonSheet({ pct, venues, onClose }: { pct: number; venues: number; onClose: () => void }) {
  const on = useSoon().includes(pct);
  const [closing, setClosing] = useState(false);
  const [ask, setAsk] = useState(false);
  const [snack, setSnack] = useState(false);
  const close = useMemo(() => () => { setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  useEffect(() => { if (!snack) return; const t = setTimeout(() => setSnack(false), 2600); return () => clearTimeout(t); }, [snack]);
  const done = () => { haptic.success(); toggleSoon(pct); setSnack(true); };
  // Рұқсат диалогы Telegram-да нативті (requestWriteAccess); браузерде соның көшірмесі
  const subscribe = useMemo(() => ({ text: "Ашылғанда хабарла", onClick: async () => { haptic.tap(); if (!inTelegram) return setAsk(true); if (await askWriteAccess()) done(); } }), [pct]); // eslint-disable-line react-hooks/exhaustive-deps
  useBottomButtons(subscribe, undefined, !on && !closing);
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet}>
        <span className={s.grabber} />
        <div className={s.card}>
          <span className={s.fill} style={{ width: `${pct}%` }} />
          <p className={`t-headline ${s.cardTitle}`}>Жаңа санат</p>
          <p className={s.pct}>{pct}%</p>
          <span className={`t-cap1 ${s.tag}`}>жуырда</span>
        </div>
        <p className={`t-sub2 ${s.text}`}>
          <span>Бұл</span><span>санат</span><span>дайындалып</span><span>жатыр:</span><span>мекемелермен</span><span>келісім</span><span>жүріп</span><span>жатыр.</span><span>Ашылғанда</span><span className={s.nogap}><b>хабарлаймыз</b>.</span>
        </p>
        <div className={s.rows}>
          <p className="t-sub2"><span>Дайындық</span><b>{pct}%</b></p>
          <p className="t-sub2"><span>Келісілген мекеме</span><b>{venues}</b></p>
        </div>
        {!inTelegram && <div className={s.bar}><button key={String(on)} className={`${s.btn} ${on ? s.btnDone : ""}`} onClick={on ? undefined : subscribe.onClick}>{on ? "Хабарланады" : "Ашылғанда хабарла"}</button></div>}
      </div>
      {snack && <div className={`t-sub2 ${s.snack}`}>Санат ашылғанда хабарлаймыз</div>}
      {ask && <Confirm title="Хабарламаға рұқсат" text="Jazl+ ботына сізге хабарлама жіберуге рұқсат бересіз бе?" cancel="Бас тарту" ok="Рұқсат ету" onClose={() => setAsk(false)} onOk={done} />}
    </div>
  );
}
