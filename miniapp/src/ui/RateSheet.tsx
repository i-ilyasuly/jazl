// Figma «12 · Бағалау»: «1 Бағасыз» 13886:33294, «2 Жоғары баға» 13886:33455, «3 Төмен баға (себеп)» 13886:33622,
// «4 Рахмет» 13886:33817, «5 Жоғары баға (пікір)» 13929:12534. Себеп чиптері — жиексіз, тек фон (ереже 7);
// «Рахмет» — жасыл белгінің орнында балапан стикері (ереже 9); себептер санатқа сай (ереже 13).
import { kindPic } from "./Emo";
import { useEffect, useMemo, useState } from "react";
import { findOffer, type OfferKind } from "../mocks/offers";
import { rateActivity, type Activity } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Sticker } from "./Sticker";
import burger from "../assets/icons/sheetBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import s from "./RateSheet.module.css";

const LABEL = ["Бағаңды таңда", "Өте нашар", "Нашар", "Орташа", "Жақсы", "Тамаша!"];
const BAD: Record<OfferKind, string[]> = {
  food: ["Порция аз", "Дәмі ұнамады", "Күту ұзақ", "Пакет қабылданбады", "Тазалық", "Басқа"],
  coffee: ["Көлемі аз", "Дәмі ұнамады", "Күту ұзақ", "Пакет қабылданбады", "Тазалық", "Басқа"],
  hair: ["Нәтиже ұнамады", "Кешікті", "Күту ұзақ", "Пакет қабылданбады", "Тазалық", "Басқа"],
};
const GOOD: Record<OfferKind, string[]> = {
  food: ["Дәмі", "Жылдам", "Қызмет", "Таза", "Баға", "Басқа"],
  coffee: ["Дәмі", "Жылдам", "Бариста", "Таза", "Баға", "Басқа"],
  hair: ["Шебер", "Нәтиже", "Уақытында", "Таза", "Баға", "Басқа"],
};

function Star({ on, i, onPick }: { on: boolean; i: number; onPick: (n: number) => void }) {
  return (
    <button className={`${s.star} ${on ? s.starOn : ""}`} style={{ ["--d" as string]: `${i * 40}ms` }} aria-label={`${i + 1} жұлдыз`} onClick={() => onPick(i + 1)}>
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" /></svg>
    </button>
  );
}

export function Stars({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return <div className={s.stars}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} i={i} on={i < value} onPick={onPick} />)}</div>;
}

export function RateSheet({ act, initial = 0, onClose }: { act: Activity; initial?: number; onClose: () => void }) {
  const o = findOffer(act.offerId);
  const [stars, setStars] = useState(initial);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  const [done, setDone] = useState(false);
  const [closing, setClosing] = useState(false);
  const low = stars > 0 && stars <= 3;
  const high = stars >= 4;
  const reasons = low ? BAD[o.kind] : GOOD[o.kind];
  const [title, sub] = [act.title, act.sub.replace(" · ", "  •  ")];

  const close = useMemo(() => () => { haptic.soft(); setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const pickStars = (n: number) => { if (n === stars) return; haptic.select(); setStars(n); setTags([]); if (n <= 3) setMore(false); };
  const toggle = (t: string) => { haptic.select(); setTags((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t])); };
  const send = useMemo(() => () => {
    if (!stars) { haptic.warning(); return; }
    haptic.success(); rateActivity(act.id, stars, tags, text.trim()); setDone(true);
  }, [stars, tags, text, act.id]);
  const main = useMemo(() => (done ? { text: "Дайын", onClick: close } : { text: "Жіберу", onClick: send }), [done, close, send]);
  useBottomButtons(main);

  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet} role="dialog" aria-label="Бағалау" key={done ? "done" : "rate"}>
        <span className={s.grabber} />
        {done ? <>
          <Sticker name="love" size={96} loop={false} className={s.sticker} />
          <h2 className={`t-title3 w-700 ${s.center}`}>Рахмет!</h2>
          <p className={`t-sub2 ${s.muted} ${s.center}`}>Бағаң мекемеге жеткізіледі. Ол Jazl+ сапасын жақсартуға көмектеседі.</p>
        </> : <>
          <h2 className="t-title3 w-700">Қалай болды?</h2>
          <div className={s.item}>
            <span className={s.icon}><img src={kindPic[o.kind]} width={40} height={40} alt="" style={{ objectFit: "contain" }} /></span>
            <span className={s.itemText}><span className="t-text w-600">{title}</span><span className={`t-cap1 ${s.muted}`}>{sub}</span></span>
          </div>
          <Stars value={stars} onPick={pickStars} />
          <p className={`t-sub1 ${stars ? "w-600" : s.muted} ${s.center} ${s.label}`} key={stars}>{LABEL[stars]}</p>
          {high && !more && (
            <button className={s.more} onClick={() => { haptic.tap(); setMore(true); }}>
              <span className="t-text w-600">Пікір қосу</span><span className={`t-cap1 ${s.muted}`}>міндетті емес</span>
            </button>
          )}
          {(low || (high && more)) && <>
            <p className={`t-sub2 w-600 ${s.ask}`}>{low ? "Не ұнамады?" : "Не ұнады?"}</p>
            <div className={s.chips}>
              {reasons.map((t) => <button key={t} className={`${s.chip} ${tags.includes(t) ? s.chipOn : ""}`} onClick={() => toggle(t)}>{t}</button>)}
            </div>
            <textarea className={s.input} rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={low ? "Не болғанын жаз (міндетті емес)" : "Не ұнағанын жаз (міндетті емес)"} />
            <p className={`t-cap1 ${s.muted}`}>{low ? "Пікір мекемеге жіберіледі, біз де 24 сағат ішінде қараймыз." : "Пікір мекеме бетінде көрінеді (3 бағадан кейін)."}</p>
          </>}
        </>}
        {!inTelegram && (
          <div className={s.bar}><button className={s.btn} disabled={!done && !stars} onClick={main.onClick}>{main.text}</button></div>
        )}
      </div>
    </div>
  );
}
