// Figma «Төлем / Карта қосу (Telegram нативті)» 13886:25021.
// Нақты өнімде карта Telegram-ның нативті төлем формасы (bot invoice → openInvoice) арқылы енгізіледі;
// бұл бет сол форманың үлгісі. Карта деректері ешқайда сақталмайды — тек соңғы 4 цифр мен мерзімі.
import { useMemo, useState } from "react";
import { useGo } from "../nav";
import { addMethod } from "../store";
import { haptic, inTelegram, useBottomButtons } from "../telegram";
import { Group, Row, SubPage, Switch } from "../ui/SubPage";
import s from "./CardAdd.module.css";

const brandOf = (n: string) => (/^4/.test(n) ? "VISA" : /^(5[1-5]|2[2-7])/.test(n) ? "Mastercard" : /^220[0-4]/.test(n) ? "МИР" : "");
const luhn = (n: string) => { let sum = 0; for (let i = 0; i < n.length; i++) { let d = +n[n.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; };

export function CardAdd() {
  const go = useGo();
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(true);
  const brand = brandOf(num);
  const mm = +exp.slice(0, 2), yy = +exp.slice(2);
  const now = new Date(); const cy = now.getFullYear() % 100, cm = now.getMonth() + 1;
  const expOk = exp.length === 4 && mm >= 1 && mm <= 12 && (yy > cy || (yy === cy && mm >= cm));
  const ok = num.length === 16 && luhn(num) && expOk && cvc.length === 3 && name.trim().length > 2;
  const save = useMemo(() => ({ text: "Сақтау", onClick: () => {
    if (!ok) { haptic.error(); return; }
    haptic.success();
    if (keep) addMethod({ id: "card" + num.slice(-4), emoji: "💳", title: `${brand || "Карта"} •• ${num.slice(-4)}`, sub: `Жарамдылық мерзімі ${exp.slice(0, 2)}/${exp.slice(2)}`, card: true });
    go(-1, "back");
  } }), [ok, keep, num, exp, brand, go]);
  useBottomButtons(save);

  return (
    <SubPage title="Төлем тәсілі" variant="settings">
      <Group header="Карта ақпараты" i={0}>
        <label className={s.field}>
          <span className={s.label}>Карта нөмірі</span>
          <span className={s.line}>
            <input className={s.input} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={num.replace(/(\d{4})(?=\d)/g, "$1 ")} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 16))} />
            {brand && <span className={s.brand}>{brand}</span>}
          </span>
          {num.length === 16 && !luhn(num) && <span className={s.err}>Карта нөмірі қате</span>}
        </label>
        <div className={s.pair}>
          <label className={s.field}>
            <span className={s.label}>Жарамдылық мерзімі</span>
            <input className={s.input} inputMode="numeric" autoComplete="cc-exp" placeholder="АА / ЖЖ" value={exp.length > 2 ? `${exp.slice(0, 2)} / ${exp.slice(2)}` : exp} onChange={(e) => setExp(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            {exp.length === 4 && !expOk && <span className={s.err}>Мерзімі қате</span>}
          </label>
          <label className={s.field}>
            <span className={s.label}>CVC</span>
            <input className={s.input} inputMode="numeric" autoComplete="cc-csc" type="password" placeholder="•••" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </label>
        </div>
        <label className={`${s.field} ${s.last}`}>
          <span className={s.label}>Карта иесінің аты</span>
          <input className={s.input} autoComplete="cc-name" placeholder="AIGERIM NURLANOVA" value={name} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z\s-]/g, ""))} />
        </label>
      </Group>
      <Group i={1}>
        <Row wrap title="Картаны сақтау" sub="Келесі төлемдер үшін. Карта деректері төлем провайдеріне қауіпсіз жіберіледі." right={<Switch on={keep} onChange={setKeep} />} inset={16} />
      </Group>
      {!inTelegram && <div className={s.bar}><button className={s.btn} disabled={!ok} onClick={save.onClick}>Сақтау</button></div>}
    </SubPage>
  );
}
