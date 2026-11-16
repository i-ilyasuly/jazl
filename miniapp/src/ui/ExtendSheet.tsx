// Figma «Мерзімін ұзарту / Тегін» 13886:32051, «Ақылы» 13886:32347 — пакет бетінің үстіндегі парақ.
// Таңдау — жиексіз, тек фон (ереже 7); радио — Telegram UI kit «Android / Radio».
import { useEffect, useMemo, useState } from "react";
import { fmt } from "../mocks/offers";
import { EXTEND_OPTIONS, extendPack, offerOf, shiftUntil, type Pack } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { usePayFlow } from "./usePayFlow";
import s from "./ExtendSheet.module.css";

export function ExtendSheet({ pack, onClose, onDone }: { pack: Pack; onClose: () => void; onDone: (until: string) => void }) {
  const flow = usePayFlow();
  const opts = EXTEND_OPTIONS.filter((x) => x.price > 0 || !pack.freeExtendUsed);
  const [pick, setPick] = useState(opts[0]);
  const [closing, setClosing] = useState(false);
  const until = shiftUntil(pack.until, pick.days);

  const close = useMemo(() => () => { haptic.soft(); setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close, !flow.sheetOpen);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const finish = useMemo(() => () => { const u = extendPack(pack.id, pick.days, pick.price); if (u) { haptic.success(); onDone(u); } }, [pack.id, pick, onDone]);
  const main = useMemo(() => pick.price === 0
    ? { text: "Тегін ұзарту", onClick: () => { haptic.medium(); finish(); } }
    : { text: `Төлеу · ${fmt(pick.price)}`, shine: true, onClick: () => flow.pay({ ...offerOf(pack), title: `Мерзімін ұзарту · +${pick.days} күн`, price: pick.price }, finish) },
  [pick, finish, flow, pack]);
  useBottomButtons(main, undefined, !flow.sheetOpen);

  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet} role="dialog" aria-label="Мерзімін ұзарту">
        <span className={s.grabber} />
        <h2 className="t-title3 w-700">Мерзімін ұзарту</h2>
        <p className={`t-sub2 ${s.muted}`}>Қазіргі мерзім: {pack.until}</p>
        <div className={s.list}>
          {opts.map((x) => (
            <button key={x.days} className={`${s.opt} ${pick === x ? s.on : ""}`} onClick={() => { if (pick !== x) { haptic.select(); setPick(x); } }}>
              <span className={s.optText}>
                <span className="t-text">+{x.days} күн</span>
                {x.price === 0 && <span className={`t-cap1 ${s.muted}`}>Бір реттік, мекеме берген мүмкіндік</span>}
              </span>
              {x.price === 0 ? <span className={s.free}>Тегін</span> : <span className="t-text w-600">{fmt(x.price)}</span>}
              <span className={`${s.radio} ${pick === x ? s.radioOn : ""}`} />
            </button>
          ))}
        </div>
        <div className={s.kv}><span className={s.muted}>Жаңа мерзім</span><span className="w-600">{until}</span></div>
        {!inTelegram && (
          <div className={s.bar}>
            <button className={`${s.btn} ${main.shine ? s.shine : ""}`} disabled={flow.busy} onClick={main.onClick}>{flow.busy ? <span className={s.spinner} /> : main.text}</button>
          </div>
        )}
      </div>
      {flow.node}
    </div>
  );
}
