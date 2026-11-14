// Растау диалогы. Figma-да «Telegram нативті диалог» деп белгіленген: Telegram ішінде нағыз
// нативті showPopup ашылады, браузерде соның көшірмесі (312 ені, r24) салынады.
import { useEffect, useState } from "react";
import { haptic, inTelegram, tg } from "../telegram";
import s from "./Confirm.module.css";

export function Confirm({ title, text, cancel, ok, danger, onOk, onClose }: { title: string; text: string; cancel: string; ok: string; danger?: boolean; onOk: () => void; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const native = inTelegram && Boolean(tg?.showPopup);
  useEffect(() => {
    if (!native) return;
    tg!.showPopup!({ title, message: text, buttons: [{ id: "no", type: "default", text: cancel }, { id: "ok", type: danger ? "destructive" : "default", text: ok }] }, (id) => { onClose(); if (id === "ok") onOk(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (native) return null;
  const close = (yes: boolean) => { haptic.tap(); setClosing(true); setTimeout(() => { onClose(); if (yes) onOk(); }, 180); };
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={() => close(false)} />
      <div className={s.box} role="alertdialog">
        <h2 className={s.title}>{title}</h2>
        <p className={`t-sub1 ${s.text}`}>{text}</p>
        <div className={s.btns}>
          <button className={`t-sub1 w-600 ${s.btn}`} onClick={() => close(false)}>{cancel}</button>
          <button className={`t-sub1 w-600 ${s.btn} ${danger ? s.danger : ""}`} onClick={() => close(true)}>{ok}</button>
        </div>
      </div>
    </div>
  );
}
