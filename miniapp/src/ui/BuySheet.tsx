// Figma: «Ұсыныс беті / Сатып алу парағы» → Modal (412×478, жоғарғы бұрыштары r16), Scrim 50%.
import { useEffect, useMemo, useState } from "react";
import { fmt, saving, type Offer } from "../mocks/offers";
import { haptic, inTelegram, tg, useBackButton, useBottomButtons } from "../telegram";
import burger from "../assets/icons/sheetBurger.svg";
import chev from "../assets/icons/chevRight.svg";
import check from "../assets/icons/checkWhite.svg";
import s from "./BuySheet.module.css";

export function BuySheet({ offer, onClose, onPaid }: { offer: Offer; onClose: () => void; onPaid: () => void }) {
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);

  const close = useMemo(() => () => { setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);

  const pay = useMemo(() => ({
    text: `Төлеу · ${fmt(offer.price)}`,
    onClick: () => {
      if (!agree || busy) return;
      haptic.tap();
      setBusy(true);
      tg?.MainButton?.showProgress?.(false);
      setTimeout(() => { tg?.MainButton?.hideProgress?.(); haptic.success(); onPaid(); }, 1100);
    },
  }), [offer.price, agree, busy, onPaid]);
  useBottomButtons(pay);

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet} role="dialog" aria-label="Төлем">
        <span className={s.grabber} />
        <h2 className={`t-title3 w-700 ${s.title}`}>Төлем</h2>
        <div className={s.item}>
          <span className={s.icon}><img src={burger} width={30} height={30} alt="" /></span>
          <span className={s.itemText}>
            <span className="t-sub1 w-600">{offer.title}</span>
            <span className={`t-cap1 ${s.muted}`} style={{ whiteSpace: "pre" }}>{`${offer.venue}  •  30 күн`}</span>
          </span>
        </div>
        <hr className={s.sep} />
        <div className={`t-sub2 ${s.row} ${s.muted}`}><span>Бөлек баға</span><s className="w-600">{fmt(offer.oldPrice)}</s></div>
        <div className={`t-sub2 ${s.row}`}><span className={s.muted}>Үнем</span><span className={`w-600 ${s.green}`}>−{fmt(saving(offer))}</span></div>
        <div className={`t-sub2 ${s.row}`}><span>Жиыны</span><span className={s.total}>{fmt(offer.price)}</span></div>
        <hr className={s.sep} />
        <button className={s.row} onClick={() => haptic.tap()}>
          <span className={`t-sub2 ${s.muted}`}>Төлем тәсілі</span>
          <span className={s.method}><span className={`t-sub2 w-600 ${s.link}`}>Kaspi Pay</span><img src={chev} width={20} height={20} alt="" /></span>
        </button>
        <button className={s.agree} onClick={() => { haptic.select(); setAgree(!agree); }} aria-pressed={agree}>
          <span className={`${s.box} ${agree ? s.boxOn : ""}`}>{agree && <img src={check} width={16} height={16} alt="" />}</span>
          <span className={`t-cap1 ${s.agreeText}`}>
            Пайдалану <b>шарттарымен</b> және <b>қайтару ережелерімен</b> келісемін
          </span>
        </button>
        {!inTelegram && (
          <div className={s.bar}>
            <button className={`t-sub1 w-600 ${s.pay}`} disabled={!agree || busy} onClick={pay.onClick}>
              {busy ? <span className={s.spinner} /> : pay.text}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
