// Figma «23 · Шағым, код енгізу, бот»: «Шағым: қате қолдану» 14041:12738, «Шағым жіберілді» 14041:12839,
// «Код енгізу» 14041:12879, «Код қате» 14041:12957. Бот хабарламалары (14044:12950) — түбірдегі бот коды, бұл жерде жоқ.
// Өлшемдер: UI kit шкаласы және 4/8px тор (ұяшық 52/48, шет 16, белгі 13/16).
import { api } from "../api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fmt, unitPrice } from "../mocks/offers";
import { useGo } from "../nav";
import { getPack, offerOf, usePacks } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons, type BottomAction } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Group, SubPage } from "../ui/SubPage";
import r from "./PayResult.module.css";
import rp from "./Report.module.css";
import b from "./Booking.module.css";
import s from "./Extra.module.css";

function Bar({ left, main }: { left: BottomAction; main: BottomAction & { disabled?: boolean } }) {
  useBottomButtons(main, left);
  if (inTelegram) return null;
  return (
    <div className={b.bar}>
      <button className={`${b.btn} ${b.second}`} onClick={left.onClick}>{left.text}</button>
      <button className={b.btn} disabled={main.disabled} onClick={main.onClick}>{main.text}</button>
    </div>
  );
}

const reasons = ["Қате дана алынды", "Қызмет көрсетілмеді", "Қате сома", "Басқа"];

/** «Шағым: қате қолдану»: /complaint/:packId — соңғы қолдануға шағым (мекемеге жіберіледі) */
export function Complaint() {
  const { packId = "" } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(packId);
  const o = pack ? offerOf(pack) : null;
  const [why, setWhy] = useState(0);
  const [text, setText] = useState("");
  const left = useMemo(() => ({ text: "Артқа", position: "left" as const, onClick: () => { haptic.soft(); go(-1, "back"); } }), [go]);
  const main = useMemo(() => ({ text: "Жіберу", onClick: () => { haptic.success(); go("/complaint/done", "up", { replace: true }); } }), [go]);
  if (!pack || !o) return <SubPage title="Шағым жіберу"><p className={`t-sub2 ${b.empty}`}>Пакет табылмады</p></SubPage>;
  const last = pack.history.find((h) => h.title.includes("пайдаланылды"));
  return (
    <SubPage title="Шағым жіберу" top={92}>
      <section className={`${b.head} rise`}>
        <b className="t-text w-600">{o.venue} • {o.title.split(" · ")[0]}</b>
        <small className="t-sub2">{last ? last.sub.split(" • ")[0].replace("бүгін", "Бүгін") : "Соңғы қолдану"} • 1 {o.unitWord === "рет" ? "рет" : "дана"} • {fmt(unitPrice(o))}</small>
      </section>
      <h2 className={`t-sub2 w-600 ${b.h2} rise`} style={{ ["--i" as string]: 1 }}>Не болды?</h2>
      <Group i={1}>
        {reasons.map((k, i) => (
          <button key={k} className={rp.row} onClick={() => { if (why !== i) { haptic.select(); setWhy(i); } }}>
            <span className={rp.label}>{k}</span><span className={`${rp.radio} ${why === i ? rp.on : ""}`} />
          </button>
        ))}
      </Group>
      <h2 className={`t-sub2 w-600 ${b.h2} rise`} style={{ ["--i" as string]: 2 }}>Қысқаша сипаттама</h2>
      <label className={`${rp.area} ${s.area} rise`} style={{ ["--i" as string]: 2 }}>
        <textarea value={text} rows={1} maxLength={300} placeholder="Не болғанын қысқаша жаз" onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} />
      </label>
      <p className={`t-sub2 ${b.note} infoBox infoWarn rise`} style={{ ["--i" as string]: 3 }}>Мекеме 24 сағат ішінде жауап береді. Қате расталса, дана пакетке қайтарылады.<i>”</i></p>
      <div style={{ height: 70 }} />
      <Bar left={left} main={main} />
    </SubPage>
  );
}

/** «Шағым жіберілді»: /complaint/done */
export function ComplaintDone() {
  const go = useGo();
  const close = useCallback(() => go(-1, "back"), [go]);
  useBackButton(close);
  const main = useMemo(() => ({ text: "Түсінікті", onClick: () => { haptic.soft(); close(); } }), [close]);
  useBottomButtons(main);
  return (
    <div className={r.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={r.body}>
        <Sticker name="wait" size={120} className={r.sticker} />
        <h1 className={r.title}>Шағым жіберілді</h1>
        <p className={r.text}>Мекеме 24 сағат ішінде жауап береді. Нәтижесін Telegram-да хабарлаймыз.</p>
      </div>
      {!inTelegram && <div className={b.bar}><button className={b.btn} onClick={main.onClick}>{main.text}</button></div>}
    </div>
  );
}

/** «Код енгізу»: /scan/code — сканер істемесе кассир экранындағы 6 таңбалы код. Демо: ?code=bad — «Код қате». */
export function CodeEntry() {
  const go = useGo();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 350); return () => clearTimeout(t); }, []);
  const left = useMemo(() => ({ text: "Артқа", position: "left" as const, onClick: () => { haptic.soft(); go(-1, "back"); } }), [go]);
  const main = useMemo(() => ({ text: "Растау", disabled: code.length < 6, onClick: () => {
    if (code.length < 6) return;
    haptic.medium();
    // Кассир QR-ының астындағы 6 таңбалы код → сервер сол сеанстың QR-ын қайтарады → әдеттегі төлем парағы
    api<{ qr: string }>("/v1/qr/code", { method: "POST", body: JSON.stringify({ code }) })
      .then((r) => go(`/scan?via=qr&qr=${encodeURIComponent(r.qr)}`, "fade", { replace: true }))
      .catch(() => { haptic.error(); setError(true); setShake((n) => n + 1); });
  } }), [code, go]);
  return (
    <SubPage title="Код енгізу" top={92}>
      <p className={`t-text ${s.lead} rise`}>Сканер істемесе, кассирдің экранындағы 6 таңбалы кодты енгіз.</p>
      <label key={shake} className={`${s.boxes} ${shake ? s.shake : ""} rise`} style={{ ["--i" as string]: 1 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`t-title2 ${s.box} ${i === code.length && !error ? s.active : ""} ${error ? s.bad : ""}`}>{code[i] ?? ""}</span>
        ))}
        <input ref={input} className={s.input} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="Код"
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); if (v.length > code.length) haptic.tap(); setError(false); setCode(v); }} />
      </label>
      {error
        ? <p className={`t-sub2 ${s.err}`} role="alert">Код қате немесе мерзімі өтті. Кассирден жаңа код сұра.</p>
        : <>
            <p className={`t-sub2 ${s.hint} rise`} style={{ ["--i" as string]: 2 }}>Код QR-дың астында жазылған және 2 минут жарамды.</p>
            <p className={`t-sub2 ${b.note} infoBox infoWarn rise`} style={{ ["--i" as string]: 3 }}>Қолмен енгізу де төлемді дәл сол пакеттен алып, кассаға жібереді.<i>”</i></p>
          </>}
      <Bar left={left} main={main} />
    </SubPage>
  );
}
