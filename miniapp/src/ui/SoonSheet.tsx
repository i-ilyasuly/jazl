// Figma: «Жуырда / Санат парағы» 13886:15399, «Рұқсат диалогы» 13886:15701, «Қосылды» 13886:15957
import { useEffect, useMemo, useState } from "react";
import { toggleSoon, useSoon } from "../store";
import { askWriteAccess, haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Confirm } from "./Confirm";
import { Sticker } from "./Sticker";
import s from "./SoonSheet.module.css";

export function SoonSheet({ pct, onClose }: { pct: number; venues?: number; onClose: () => void }) {
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
  const subscribe = useMemo(() => ({ text: "Ашылғанда хабарла", onClick: async () => { haptic.medium(); if (!inTelegram) return setAsk(true); if (await askWriteAccess()) done(); } }), [pct]); // eslint-disable-line react-hooks/exhaustive-deps
  useBottomButtons(subscribe, undefined, !on && !closing);
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet}>
        <span className={s.grabber} />
        {/* Патша (2026-11-21): «дайындап жатырмыз» — сызба ұстаған үйрек */}
        <span className={s.duck}><Sticker name="repair" size={132} /></span>
        <div className={s.card}>
          <span className={s.fill} style={{ width: `${pct}%` }} />
          <p className={s.cardTitle}>Жаңа санат</p>
          <p className={s.pct}>{pct}%</p>
          <span className={s.tag}>жуырда</span>
          <span className={s.bar2}><i style={{ width: `${pct}%` }} /></span>
        </div>
        <p className={s.text}>Бұл санатты дайындап жатырмыз. Ашылғанда бірінші болып <b>хабарлаймыз</b>.</p>
        {!inTelegram && <div className={s.bar}><button key={String(on)} className={`${s.btn} ${on ? s.btnDone : ""}`} onClick={on ? undefined : subscribe.onClick}>{on ? "Хабарланады" : "Ашылғанда хабарла"}</button></div>}
      </div>
      {snack && <div className={s.snack}>Санат ашылғанда хабарлаймыз</div>}
      {ask && <Confirm title="Хабарламаға рұқсат" text="Medeo ботына сізге хабарлама жіберуге рұқсат бересіз бе?" cancel="Бас тарту" ok="Рұқсат ету" onClose={() => setAsk(false)} onOk={done} />}
    </div>
  );
}
