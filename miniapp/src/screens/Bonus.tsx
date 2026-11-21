// Medeo бонусы (Патша, 2026-11-17): мерзімі өтіп, пайдаланылмай қалған бірліктің ақшасы күймейді — клиентке бонус болып қайтады.
// 12 ай жарамды, кез келген мекемеде келесі сатып алуда бағадан шегеріледі. Figma-да жоқ — «Профиль» беттерінің стилімен.
import { fmt } from "../mocks/offers";
import { useBonus } from "../pay/bonus";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { Sticker } from "../ui/Sticker";
import s from "./Bonus.module.css";

const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const dm = (d: string) => { const x = new Date(d); return `${x.getDate()} ${MON[x.getMonth()]} ${x.getFullYear()}`; };

export function Bonus() {
  const b = useBonus(true);
  return (
    <SubPage title="Medeo бонусы" variant="roomy">
      <div className={`${s.hero} rise`}>
        <Sticker name="partyhat" size={112} />
        <span className={s.label}>Қолжетімді</span>
        <b className={s.sum}>{b ? fmt(b.balance) : "–"}</b>
        {b?.nextExpiry && b.balance > 0 && <span className={s.label}>{`Ең жақын мерзімі: ${dm(b.nextExpiry)}`}</span>}
      </div>
      <Note i={1}>Пакет мерзімі өтіп, бірліктер пайдаланылмай қалса, ақшаң күймейді: күту кезеңі (3 күн) біткен соң қалған бірліктің құны осында бонус болып түседі. Бонус 12 ай жарамды, кез келген мекемеде келесі сатып алуда бағадан шегеріледі.</Note>
      {b && b.items.length > 0 && <Group i={2}>
        {b.items.map((x) => (
          <Row key={x.id} inset={68} left={<Tile e={x.left === 0 || x.expired ? "↩" : "💰"} size={36} />} dim={x.expired}
            title={x.title ?? "Medeo бонусы"}
            sub={[x.venue, x.expired ? `мерзімі өтті ${dm(x.expiresAt)}` : x.left === 0 ? "толық жұмсалды" : `${x.units ? x.units + " бірліктен · " : ""}${dm(x.expiresAt)} дейін`].filter(Boolean).join(" · ")}
            right={<span className={s.amount}>{x.left > 0 && x.left < x.amount ? `${fmt(x.left)} / ${fmt(x.amount)}` : `+${fmt(x.amount)}`}</span>} />
        ))}
      </Group>}
      {b && b.items.length === 0 && <Note i={2}>Әзірге бонус жоқ. Пакеттеріңді мерзімінде пайдалансаң, бұл бет бос қала береді: ол да жақсы.</Note>}
    </SubPage>
  );
}
