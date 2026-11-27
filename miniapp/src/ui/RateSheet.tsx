// Figma «12 · Бағалау»: «1 Бағасыз» 13886:33294, «2 Жоғары баға» 13886:33455, «3 Төмен баға (себеп)» 13886:33622,
// «4 Рахмет» 13886:33817, «5 Жоғары баға (пікір)» 13929:12534. Себеп чиптері — жиексіз, тек фон (ереже 7);
// «Рахмет» — жасыл белгінің орнында балапан стикері (ереже 9); себептер санатқа сай (ереже 13).
import { kindPic } from "./Emo";
import { useEffect, useMemo, useState } from "react";
import { findOffer, type OfferKind } from "../mocks/offers";
import { rateActivity, type Activity } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Sticker, preloadSticker } from "./Sticker";
import burger from "../assets/icons/sheetBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import s from "./RateSheet.module.css";
import { TgEmoji, preloadTgEmoji } from "./TgEmoji";

// Сервер қабылдамаса — себебі (b4.ts: POST /v1/ratings)
const ERR: Record<string, string> = {
  not_used_yet: "Пакет әлі қолданылмаған: баға тек мекемеде қолданғаннан кейін қойылады.",
  not_found: "Пакет табылмады. Қосымшаны жауып, қайта ашып көр.",
  bad_request: "Пікір жіберілмеді. Мәтінді қысқартып, қайта көр.",
  network: "Байланыс жоқ — пікір жіберілмеді. Интернетті тексеріп, қайта жібер.",
};

/** Пернетақта биіктігі (px): Android Telegram-да тақта бетті кішірейтпей үстінен жабады — терезені соның үстіне көтереміз */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const upd = () => { const h = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)); setInset(h > 80 ? h : 0); };
    vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd); upd();
    return () => { vv.removeEventListener("resize", upd); vv.removeEventListener("scroll", upd); };
  }, []);
  return inset;
}

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

// Патша (2026-11-21): басында — бос жұлдыз орындары. Басылғанда таңдалған жұлдыздар Telegram-ның анимациялық ⭐ эмодзиіне
// айналып, бір рет ойнайды. Кейін тағы біреуі қосылса — тек сол жаңасы ойнайды (бұрынғылары қайта ойнамайды).
function Star({ on, i, onPick }: { on: boolean; i: number; onPick: (n: number) => void }) {
  return (
    <button className={`${s.star} ${on ? s.starTg : ""}`} aria-label={`${i + 1} жұлдыз`} onClick={() => onPick(i + 1)}>
      {on ? <TgEmoji name="star" size={44} once />
        : <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" /></svg>}
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
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [local, setLocal] = useState(false);
  const kb = useKeyboardInset();
  useEffect(() => { void preloadSticker("love"); void preloadTgEmoji("star").catch(() => null); }, []); // жұлдыз қойып жатқанда стикер мен ⭐ дайын болады
  const [closing, setClosing] = useState(false);
  const low = stars > 0 && stars <= 3;
  const high = stars >= 4;
  const reasons = low ? BAD[o.kind] : GOOD[o.kind];
  const [title, sub] = [act.title, act.sub.replace(" · ", "  •  ")];

  const close = useMemo(() => () => { haptic.soft(); setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const pickStars = (n: number) => { if (n === stars) return; haptic.select(); if (n <= 3 !== stars <= 3 || !stars) setTags([]); setStars(n); };
  const toggle = (t: string) => { haptic.select(); setTags((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t])); };
  const send = useMemo(() => async () => {
    if (!stars) { haptic.warning(); return; }
    if (sending) return;
    setSending(true); setErr("");
    const r = await rateActivity(act.id, stars, tags, text.trim());
    setSending(false);
    if (r.result === "error") { haptic.error(); setErr(ERR[r.error ?? ""] ?? ERR.network); return; }
    haptic.success(); setLocal(r.result === "local"); setDone(true);
  }, [stars, tags, text, act.id, sending]);
  const main = useMemo(() => (done ? { text: "Дайын", onClick: close } : { text: sending ? "Жіберілуде…" : "Жіберу", onClick: () => { void send(); } }), [done, close, send, sending]);
  useBottomButtons(main);

  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet} role="dialog" aria-label="Бағалау" key={done ? "done" : "rate"}
        style={kb ? { bottom: kb, maxHeight: `calc(100% - ${kb}px - 8px)`, overflowY: "auto" } : undefined}>
        <span className={s.grabber} />
        {done ? <>
          <Sticker name="love" size={96} className={s.sticker} />
          <h2 className={`t-title3 w-700 ${s.center}`}>Рахмет!</h2>
          <p className={`t-sub2 ${s.muted} ${s.center}`}>{local
            ? "Бұл — үлгі пакет: бағаң тек осы құрылғыда сақталды, мекемеге жіберілмейді."
            : "Бағаң мекемеге жетті және ұсыныс бетіндегі пікірлерде көрінеді."}</p>
        </> : <>
          <h2 className="t-title3 w-700">Қалай болды?</h2>
          <div className={s.item}>
            <span className={s.icon}><img src={kindPic[o.kind]} width={40} height={40} alt="" style={{ objectFit: "contain" }} /></span>
            <span className={s.itemText}><span className="t-text w-600">{title}</span><span className={`t-cap1 ${s.muted}`}>{sub}</span></span>
          </div>
          <Stars value={stars} onPick={pickStars} />
          <p className={`t-sub1 ${stars ? "w-600" : s.muted} ${s.center} ${s.label}`} key={stars}>{LABEL[stars]}</p>
          {/* Патша (2026-11-21): 4–5 жұлдызда да 1–3 жұлдыздағыдай белгілер бірден шығады («Не ұнады?») */}
          {(low || high) && <>
            <p className={`t-sub2 w-600 ${s.ask}`}>{low ? "Не ұнамады?" : "Не ұнады?"}</p>
            <div className={s.chips}>
              {reasons.map((t) => <button key={t} className={`${s.chip} ${tags.includes(t) ? s.chipOn : ""}`} onClick={() => toggle(t)}>{t}</button>)}
            </div>
            <textarea className={s.input} rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
              onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350); }}
              placeholder={low ? "Не болғанын жаз (міндетті емес)" : "Не ұнағанын жаз (міндетті емес)"} />
            {err && <p className={`t-cap1 ${s.err}`} role="alert">{err}</p>}
            <p className={`t-cap1 ${s.muted}`}>{low ? "Пікір мекемеге жіберіледі, біз де 24 сағат ішінде қараймыз." : "Бағаң мен пікірің ұсыныс бетінде көрінеді."}</p>
          </>}
        </>}
        {!inTelegram && (
          <div className={s.bar}><button className={s.btn} disabled={(!done && !stars) || sending} onClick={main.onClick}>{main.text}</button></div>
        )}
      </div>
    </div>
  );
}
