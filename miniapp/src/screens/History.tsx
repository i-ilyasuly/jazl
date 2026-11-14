// Figma: «Сатып алу тарихы / Тізім» (13886:36715)
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { Group, Row, SkRows, SubPage } from "../ui/SubPage";
import s from "./History.module.css";

const data = [
  { month: "Қараша", items: [
    { id: "h1", e: "🍔", t: "Тауық донері · 4 дана", sub: "Dämdi Doner • 8 қараша", v: "−6 000 ₸" },
    { id: "h2", e: "✂️", t: "Шаш қию · 4 рет", sub: "Qala Barber • 3 қараша", v: "−12 000 ₸" },
    { id: "h3", e: "🎁", t: "Латте · 15 стақан", sub: "Brew Point • сыйлық", v: "−27 000 ₸" },
  ] },
  { month: "Қазан", items: [
    { id: "h4", e: "↩️", t: "Кофе · 10 стақан", sub: "Coffee Lab • қайтарылды", v: "+18 000 ₸", plus: true },
    { id: "h5", e: "🍔", t: "Бургер комбо · 4 дана", sub: "Bahandi • 20 қазан", v: "−10 800 ₸" },
  ] },
];

export function History() {
  const go = useGo();
  const { loading } = useMock("history", true, 450);
  return (
    <SubPage title="Сатып алу тарихы">
      {data.map((g, gi) => (
        <Group key={g.month} header={g.month} i={gi}>
          {loading ? <SkRows n={g.items.length} /> : g.items.map((it) => (
            <Row key={it.id} title={it.t} sub={it.sub} onClick={() => go("/profile/receipt/" + it.id)}
              left={<span className={s.emoji}>{it.e}</span>}
              right={<span className={`t-sub1 w-600 ${s.value} ${it.plus ? s.plus : ""}`}>{it.v}</span>} />
          ))}
        </Group>
      ))}
    </SubPage>
  );
}
