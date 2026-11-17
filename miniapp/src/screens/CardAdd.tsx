// Figma «Төлем / Карта қосу (Telegram нативті)» 13886:25021 — Telegram-ның карта енгізу формасының үлгісі (Патша, 2026-11-17).
// Карта нөмірі, мерзімі, CVC біздің серверге ЕШҚАШАН жіберілмейді: pay/tokenize.ts оларды провайдердің криптограммасына айналдырады,
// «Картаны сақтау» қосулы болса — сервер провайдерден токен алып, тек бренд, соңғы 4 цифр мен мерзімді сақтайды.
import { useMemo, useState } from "react";
import { useGo } from "../nav";
import { api } from "../api";
import { addMethod } from "../store";
import { haptic, inTelegram, nativeAlert, useBottomButtons } from "../telegram";
import { brandOf as brandName, luhn as luhnOk, tokenizeCard } from "../pay/tokenize";
import { hasServer } from "../pay/checkout";
import { Group, Row, SubPage, Switch } from "../ui/SubPage";
import s from "./CardAdd.module.css";

const brandOf = (n: string) => { const b = brandName(n); return b === "Visa" ? "VISA" : b; };
const luhn = luhnOk;

export function CardAdd() {
  const go = useGo();
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  // Сатып алу парағынан келсе (state.back) — карта сол төлемге таңдалады
    const brand = brandOf(num);
  const mm = +exp.slice(0, 2), yy = +exp.slice(2);
  const now = new Date(); const cy = now.getFullYear() % 100, cm = now.getMonth() + 1;
  const expOk = exp.length === 4 && mm >= 1 && mm <= 12 && (yy > cy || (yy === cy && mm >= cm));
  const ok = num.length === 16 && luhn(num) && expOk && cvc.length === 3 && name.trim().length > 2;
  const save = useMemo(() => ({ text: busy ? "…" : "Сақтау", disabled: busy, onClick: async () => {
    if (!ok || busy) { haptic.error(); return; }
    setBusy(true);
    try {
      const t = await tokenizeCard({ number: num, exp, cvc, holder: name });
      const title = `${t.brand} •• ${t.last4}`; const sub = `Жарамдылық мерзімі ${t.exp}`;
      if (!hasServer()) addMethod({ id: "card" + t.last4, emoji: "💳", title, sub, card: true }); // үлгі режим (браузер)
      else if (keep) {
        const r = await api<{ card: { id: string; brand: string; last4: string; exp: string } }>("/v1/cards", { method: "POST", body: JSON.stringify({ cryptogram: t.cryptogram }) });
        addMethod({ id: "card:" + r.card.id, emoji: "💳", title: `${r.card.brand} •• ${r.card.last4}`, sub: `Жарамдылық мерзімі ${r.card.exp}`, card: true, cardId: r.card.id });
      } else addMethod({ id: "once:" + t.last4, emoji: "💳", title, sub: "Бір реттік · сақталмайды", card: true, cryptogram: t.cryptogram });
      haptic.success();
      go(-1, "back");
    } catch { haptic.error(); nativeAlert("Картаны қосу мүмкін болмады. Деректерді тексеріп, қайталап көр."); }
    finally { setBusy(false); }
  } }), [ok, keep, num, exp, cvc, name, busy, go]);
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
      {!inTelegram && <div className={s.bar}><button className={s.btn} disabled={!ok || busy} onClick={() => void save.onClick()}>{save.text}</button></div>}
    </SubPage>
  );
}
