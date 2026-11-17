// Figma «10»: «Жеке басты растау: деректер (шартты)» 13918:8271 — тек банк-серіктес талап етсе (ScanState kyc → /kyc).
// Телефон Telegram-ның нативті requestContact терезесімен толтырылады. Деректер тек банкке кетеді (бэкенд: POST /kyc).
// Сонымен бірге құжаттар беті: /profile/doc/:id, /welcome/doc/:id (Figma-да жоқ еді — осы кодпен бірге қосылды).
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { askPhone, haptic, inTelegram, useBottomButtons } from "../telegram";
import { Group, SubPage } from "../ui/SubPage";
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

const docs: Record<string, { title: string; parts: [string, string][] }> = {
  terms: { title: "Пайдалану шарттары", parts: [
    ["Medeo деген не", "Medeo — мекемелердің пакеттерін (бірнеше бірлікті алдын ала) жеңілдікпен сатып алып, кейін бөліп қолдануға арналған Telegram Mini App."],
    ["Пакет және бірлік", "Пакет сатып алынған сәттен мерзімі басталады. Әр қолдану — пакеттен бір бірлік. Бірлік мекемеде QR сканерлегенде не алдын ала тапсырыс/жазылу растағанда шегеріледі."],
    ["Мерзім және көшіру", "Мерзім біткен соң 3 күн ішінде пакетті қайта алсаң, қалған бірліктер жаңа пакетке көшеді. Одан кейін қалған бірліктер жойылады."],
    ["Сыйлау", "Пакетті досыңа сыйлай аласың. Алушы 7 күн ішінде қабылдамаса, пакет өзіңе қайтады."],
  ] },
  privacy: { title: "Құпиялылық саясаты", parts: [
    ["Қандай деректер", "Telegram аты мен ID-і, сатып алу және қолдану тарихы. Телефон нөмірі мен жеке басты растау деректері тек төлем үшін банкке беріледі."],
    ["Не үшін", "Пакеттерді есептеу, чек беру, мерзім туралы ескерту және қауіпсіздік үшін."],
    ["Деректерді жою", "Профиль → Қолданба туралы → «Деректерді жою». Заң талап ететін төлем жазбалары белгіленген мерзімге дейін сақталады."],
  ] },
  refund: { title: "Қайтару ережесі", parts: [
    ["Пайдаланылмаған пакет", "«Мәселе туралы жазу» → «Қайтару керек» арқылы өтінім бер. Қолдау 24 сағат ішінде хабарласады."],
    ["Қате қолдану", "Бірлік қате шегерілсе, қолдану чегінен шағым жібер. Мекеме растаса, бірлік пакетке қайтарылады."],
    ["Мерзімі өткен бірлік", "Мерзімі өткен және көшірілмеген бірліктің ақшасы қайтарылмайды."],
  ] },
  offer: { title: "Оферта", parts: [
    ["Тараптар", "Medeo сервисі, мекеме (серіктес) және пайдаланушы. Қызметті мекеме көрсетеді, Medeo төлем мен есепті жүргізеді."],
    ["Келісім", "Пакетті төлеу — осы офертаны қабылдау. Баға мен құрам ұсыныс бетінде көрсетіледі."],
  ] },
};

export function Doc() {
  const d = docs[useParams().id ?? ""] ?? docs.terms;
  return (
    <SubPage title={d.title} top={92}>
      {d.parts.map(([h, t], i) => (
        <section key={h} className={`${b.head} ${s.part} rise`} style={{ ["--i" as string]: i }}>
          <h2 className="t-title3 w-600">{h}</h2>
          <p className="t-text">{t}</p>
        </section>
      ))}
      <p className={`t-cap1 ${s.draft}`}>Мәтін — үлгі; заңгер тексергеннен кейін ауыстырылады.</p>
    </SubPage>
  );
}
