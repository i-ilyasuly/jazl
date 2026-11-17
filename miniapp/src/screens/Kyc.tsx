// Figma «10»: «Жеке басты растау: деректер (шартты)» 13918:8271 — тек банк-серіктес талап етсе (ScanState kyc → /kyc).
// Телефон Telegram-ның нативті requestContact терезесімен толтырылады. Деректер тек банкке кетеді (бэкенд: POST /kyc).
// Сонымен бірге құжаттар беті: /profile/doc/:id, /welcome/doc/:id (Figma-да жоқ еді — осы кодпен бірге қосылды).
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { askPhone, haptic, inTelegram, useBottomButtons } from "../telegram";
import { Group, SubPage } from "../ui/SubPage";
import { LEGAL_UPDATED, legalDoc } from "../legal/texts";
import b from "./Booking.module.css";
import s from "./Kyc.module.css";

const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, "").replace(/^8/, "7").slice(0, 11);
  if (!d) return "";
  const p = d.startsWith("7") ? d.slice(1) : d;
  return "+7 " + [p.slice(0, 3), p.slice(3, 6), p.slice(6, 8), p.slice(8, 10)].filter(Boolean).join(" ");
};

export function Kyc() {
  const go = useGo();
  const [iin, setIin] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [tried, setTried] = useState(false);
  const ok = iin.length === 12 && phone.replace(/\D/g, "").length === 11 && name.trim().split(/\s+/).length >= 2;
  const fromTg = useCallback(async () => { haptic.tap(); const p = await askPhone(); if (p) { haptic.success(); setPhone(fmtPhone(p)); } }, []);
  const next = useMemo(() => ({ text: "Жалғастыру", onClick: () => {
    if (!ok) { haptic.error(); setTried(true); return; }
    haptic.success(); go("/scan", "fade", { replace: true });
  } }), [ok, go]);
  useBottomButtons(next);
  const err = (bad: boolean) => (tried && bad ? s.bad : "");
  return (
    <SubPage title="Жеке басты растау" top={92}>
      <Group i={0}>
        <label className={`${s.field} ${err(iin.length !== 12)}`}>
          <span className="t-cap1">ЖСН</span>
          <input className="t-text" inputMode="numeric" maxLength={12} placeholder="12 цифр" value={iin} onChange={(e) => setIin(e.target.value.replace(/\D/g, "").slice(0, 12))} />
        </label>
        <label className={`${s.field} ${err(phone.replace(/\D/g, "").length !== 11)}`}>
          <span className="t-cap1">Телефон нөмірі</span>
          <input className="t-text" inputMode="tel" placeholder="+7 700 000 00 00" value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} />
          {inTelegram && !phone && <button type="button" className={`t-sub2 w-600 ${s.tg}`} onClick={fromTg}>Telegram-нан алу</button>}
        </label>
        <label className={`${s.field} ${err(name.trim().split(/\s+/).length < 2)}`}>
          <span className="t-cap1">Тегі мен аты</span>
          <input className="t-text" autoComplete="name" placeholder="Нұрланова Айгерім" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </Group>
      {tried && !ok && <p className={`t-sub2 ${s.errText}`} role="alert">Барлық өрісті толтыр: ЖСН 12 цифр, телефон толық, тегі мен аты.</p>}
      <p className={`t-sub2 ${s.note} infoBox rise`} style={{ ["--i" as string]: 1 }}>Деректер тек банкке жіберіледі және Medeo профилінде көрсетілмейді.<i>”</i></p>
      {!inTelegram && <div className={b.bar}><button className={b.btn} onClick={next.onClick}>Жалғастыру</button></div>}
    </SubPage>
  );
}

/** [Толтырылатын орын] — сары белгімен (компания деректемелері тіркелгенше) */
const marked = (t: string) => t.split(/(\[[^\]]+\])/).map((x, i) => (x.startsWith("[") ? <mark key={i} className={s.fill}>{x}</mark> : x));

/** Заңды құжат: /legal/:id (ашық, тіркелусіз — төлем провайдері тексеруі үшін), /profile/doc/:id, /welcome/doc/:id */
export function Doc() {
  const d = legalDoc(useParams().id) ?? legalDoc("terms")!;
  return (
    <SubPage title={d.title} top={92}>
      <p className={`t-cap1 ${s.draft}`}>Редакция: {LEGAL_UPDATED}</p>
      {d.parts.map((x, i) => (
        <section key={x.h} className={`${b.head} ${s.part} rise`} style={{ ["--i" as string]: Math.min(i, 6) }}>
          <h2 className="t-title3 w-600">{x.h}</h2>
          {x.p.map((t, k) => <p key={k} className="t-text">{marked(t)}</p>)}
        </section>
      ))}
      <p className={`t-cap1 ${s.draft}`}>Жоба: заңгер тексергеннен кейін түпкілікті нұсқамен ауыстырылады.</p>
    </SubPage>
  );
}
