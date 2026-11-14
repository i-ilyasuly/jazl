// Әрекеттер мәзірі. Telegram ішінде нативті showPopup терезесі ашылады (ең көбі 3 батырма),
// браузерде Figma-дағы төменгі парақ салынады («Төлем тәсілдері / Карта әрекеттері»).
import { useEffect, useMemo, useState } from "react";
import { haptic, inTelegram, tg } from "../telegram";
import s from "./ActionSheet.module.css";

export interface SheetAction { id: string; text: string; danger?: boolean }

export function ActionSheet({ title, actions, onPick, onClose, custom, selected }: { title: string; actions: SheetAction[]; onPick: (id: string) => void; onClose: () => void; custom?: boolean; selected?: string }) {
  const [closing, setClosing] = useState(false);
  const native = !custom && inTelegram && Boolean(tg?.showPopup);
  const close = useMemo(() => (id?: string) => { setClosing(true); setTimeout(() => { onClose(); if (id) onPick(id); }, 200); }, [onClose, onPick]);
  useEffect(() => {
    if (!native) return;
    tg!.showPopup!({ title, message: "Әрекетті таңда", buttons: [...actions.slice(0, 2).map((a) => ({ id: a.id, type: a.danger ? ("destructive" as const) : ("default" as const), text: a.text })), { type: "cancel" as const }] },
      (id) => { onClose(); if (id) onPick(id); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (native) return null;
  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={() => close()} />
      <div className={s.sheet}>
        <span className={s.grabber} />
        <h2 className={s.title}>{title}</h2>
        {actions.map((a) => <button key={a.id} className={`${s.row} ${a.danger ? s.danger : ""} ${selected !== undefined ? s.tall : ""}`} onClick={() => { haptic.tap(); close(a.id); }}>{a.text}{selected !== undefined && <span className={`${s.radio} ${selected === a.id ? s.radioOn : ""}`} />}</button>)}
        {selected === undefined && <button className={`t-sub1 w-600 ${s.cancel}`} onClick={() => close()}>Бас тарту</button>}
      </div>
    </div>
  );
}
