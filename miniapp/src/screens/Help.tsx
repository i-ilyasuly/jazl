// Figma 18 · Баптаулар және көмек: «Сұрақ қою / ЖҚС» (13886:39537), «Қолданба туралы» (13940:8432),
// «Деректі жою: кіріспе» (13940:8380), «Деректі жою: растау» (13940:8406)
import { Brand } from "../ui/Brand";
import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { useGo } from "../nav";
import { SUPPORT_BOT } from "../config";
import { resetAll } from "../store";
import { haptic, inTelegram, openChat, useBottomButtons } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { MainBar } from "../ui/MainBar";
import { Sticker } from "../ui/Sticker";
import { Group, Row, SubPage } from "../ui/SubPage";
import chev from "../assets/icons/cardMore.svg";
import down from "../assets/icons/chevRight.svg";
import s from "./Help.module.css";

// Жауаптағы боялған сөздер: [көк] және {жасыл} (Figma: тек екі түс, тек маңызды жерде)
const faq: [string, string][] = [
  ["Қалай төлеймін?", "Мекемеде навигациядағы [Сканер] батырмасын басып, кассирдің QR-ын сканерле. Бірлік пакеттен {өзі шегеріледі}."],
  ["Төлем өтпесе не істеймін?", "Төлем өтпесе, кассирге [QR-ды қайта шығарт]. Бірлік төлем өткен соң ғана {шегеріледі}, интернет керек."],
  ["Пакеттің мерзімі өтсе не болады?", "Мерзімі өткен соң 3 күн ішінде [Қайта алсаң], қалған бірліктер жаңа пакетке {көшеді}."],
  ["Ақшаны қалай қайтарамын?", "Сатып алу тарихындағы чектен [Мәселе туралы жаз] → «Қайтару керек». Қолдау {24 сағат ішінде} хабарласады."],
  ["Сыйлықты қалай жіберемін?", "Ұсыныс бетінде не Пакеттерімде [Сыйлау] батырмасын бас. Дос 7 күнде қабылдамаса, пакет {өзіңе қайтады}."],
  ["Мекеме жабық болса?", "Мекеме бетінде [жұмыс уақыты] көрсетіледі. Пакетті мерзімі ішінде {басқа күні} қолдана аласың."],
];

function rich(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]|\{[^}]+\})/).map((p, i) =>
    p.startsWith("[") ? <span key={i} className={`${s.mark} ${s.blue}`}>{p.slice(1, -1)}</span>
    : p.startsWith("{") ? <span key={i} className={`${s.mark} ${s.green}`}>{p.slice(1, -1)}</span>
    : <Fragment key={i}>{p}</Fragment>);
}

export function Faq() {
  const [open, setOpen] = useState(1);
  const support = useCallback(() => { haptic.tap(); openChat(SUPPORT_BOT); }, []);
  return (
    <SubPage title="Жиі сұрақтар">
      <Group i={0}>
        {faq.map(([q, a], i) => (
          <div key={q} className={`${s.item} ${open === i ? s.open : ""}`}>
            <button className={s.q} aria-expanded={open === i} onClick={() => { haptic.select(); setOpen(open === i ? -1 : i); }}>
              <span className="t-text">{q}</span>
              <img src={down} width={20} height={20} className={s.chev} alt="" />
            </button>
            <div className={s.a}><div><p className="t-sub2">{rich(a)}</p></div></div>
          </div>
        ))}
      </Group>
      <div style={{ height: 70 }} />
      <MainBar text="Қолдауға жазу" onClick={support} />
    </SubPage>
  );
}

export function About() {
  const go = useGo();
  const rows: [string, () => void][] = [
    ["Шарттар және құпиялылық", () => go("/profile/terms")],
    ["Көшіру ережесі", () => go("/rules/carry")],
    ["Қолдауға жазу", () => { haptic.tap(); openChat(SUPPORT_BOT); }],
    ["Деректерді жою", () => go("/profile/delete")],
  ];
  return (
    <SubPage title="Қолданба туралы" top={312}>
      {/* Логотип әлі дайын емес — орнында бос дөңгелек (Figma дизайн ережесі) */}
      <div className={s.about}>
        <span className={s.logo} />
        <h2 className={s.name}><Brand /></h2>
        <p className={`t-sub2 ${s.ver}`}>Нұсқа 0.1.0</p>
      </div>
      <Group i={1}>
        {rows.map(([t, on]) => <Row key={t} inset={16} title={t} onClick={on} right={<img src={chev} width={20} height={20} alt="" />} />)}
      </Group>
    </SubPage>
  );
}

export function DeleteData() {
  const go = useGo();
  const [ask, setAsk] = useState(false);
  const cancel = useMemo(() => ({ text: "Бас тарту", position: "left" as const, onClick: () => { haptic.soft(); go(-1, "back"); } }), [go]);
  const next = useMemo(() => ({ text: "Жалғастыру", onClick: () => { haptic.warning(); setAsk(true); } }), []);
  useBottomButtons(next, cancel, !ask);
  return (
    <SubPage title="">
      <div className={s.del}>
        <Sticker name="clean" />
        <h2 className={s.delTitle}>Деректерді жою</h2>
        <p className={`t-sub2 ${s.delText}`}>Аккаунтың мен пакеттерің жойылады. Бұл әрекетті қайтару мүмкін емес.</p>
        <div className={`${s.warn} infoBox infoWarn`}><span className={s.bar} /><p className="t-sub2">Қалған бірліктер мен Squirrel бонусы да жойылады. Алдымен оларды пайдалан.</p><span className={s.quote} aria-hidden>”</span></div>
      </div>
      {!inTelegram && (
        <div className={s.btns}>
          <button className={`${s.btn} ${s.btn2}`} onClick={cancel.onClick}>Бас тарту</button>
          <button className={s.btn} onClick={next.onClick}>Жалғастыру</button>
        </div>
      )}
      {ask && <Confirm title="Деректерді жоясыз ба?" text="Бұл әрекетті қайтару мүмкін емес." cancel="Жоқ" ok="Иә, жою" danger onClose={() => setAsk(false)}
        onOk={() => { haptic.success(); resetAll(); }} />}
    </SubPage>
  );
}
