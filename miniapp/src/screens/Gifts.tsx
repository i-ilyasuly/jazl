// Figma: «Сыйлықтарым / Жіберілген» (13886:37243) және «Алынған» (13886:37343)
import { useMemo, useState } from "react";
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { Group, Note, Row, SkRows, SubPage } from "../ui/SubPage";
import s from "./Gifts.module.css";

type Status = "wait" | "ok" | "expired" | "open";
interface Gift { id: string; name: string; color: string; pack: string; status: Status; label: string }
const sent: Gift[] = [
  { id: "g1", name: "Айгерім Нұрланова", color: "#e25a7a", pack: "Тауық донері · 4 дана", status: "wait", label: "Күтілуде · 5 күн" },
  { id: "g2", name: "Ерлан Серіков", color: "#4378ff", pack: "Латте · 15 стақан", status: "ok", label: "Қабылданды" },
  { id: "g3", name: "Дана Әбілова", color: "#fe9500", pack: "Шаш қию · 4 рет", status: "expired", label: "Мерзімі өтті" },
];
const got: Gift[] = [
  { id: "g4", name: "Берік Нұрлан", color: "#31d158", pack: "Бургер комбо · 4 дана", status: "open", label: "Ашу" },
  { id: "g5", name: "Мадина Ж.", color: "#b00fb4", pack: "Кофе · 10 стақан", status: "ok", label: "Қабылданды" },
];

export function Gifts() {
  const go = useGo();
  const { loading } = useMock("gifts", true, 450);
  const [tab, setTab] = useState(0);
  const list = tab === 0 ? sent : got;
  const toGift = useMemo(() => ({ text: "Пакетті сыйлау", onClick: () => go("/packs", "fade") }), [go]);
  if (demoEmpty()) return <SubPage title="Сыйлықтарым"><EmptyState sticker="gift" title="Әзірге сыйлық жоқ" text="Пакетті досыңа сыйла, ол осында көрінеді" action={toGift} /></SubPage>;
  return (
    <SubPage title="Сыйлықтарым">
      <div className={`${s.seg} rise`}>
        <span className={s.thumb} style={{ translate: `${tab * 189}px 0` }} />
        {["Жіберілген", "Алынған"].map((t, i) => (
          <button key={t} className={`t-sub2 w-600 ${s.segBtn} ${tab === i ? s.on : ""}`} onClick={() => { if (tab !== i) { haptic.select(); setTab(i); } }}>{t}</button>
        ))}
      </div>
      <div key={tab} className={`${s.pane} ${tab ? s.fromRight : s.fromLeft}`}>
        <Group i={1}>
          {loading ? <SkRows n={list.length} /> : list.map((g) => (
            <Row key={g.id} title={g.name} sub={g.pack} onClick={() => go("/profile/gift/" + g.id)}
              left={<span className={s.avatar} style={{ background: g.color }}>{g.name.slice(0, 1)}</span>}
              right={<span className={`t-cap1 ${s.chip} ${s[g.status]}`}>{g.label}</span>} />
          ))}
        </Group>
        <Note>{tab === 0 ? "Сыйлықты алушы 7 күн ішінде қабылдамаса, пакет өзіңе қайтады." : "Сыйлықты алған соң пакет Пакеттерімде көрінеді."}</Note>
      </div>
    </SubPage>
  );
}
