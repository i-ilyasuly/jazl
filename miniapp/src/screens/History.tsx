// Figma: «Сатып алу тарихы / Тізім» (13886:36715)
import { useMock } from "../mocks/useMock";
import { history as data } from "../mocks/history";
import { useGo } from "../nav";
import { Group, Row, SkRows, SubPage } from "../ui/SubPage";
import s from "./History.module.css";

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
