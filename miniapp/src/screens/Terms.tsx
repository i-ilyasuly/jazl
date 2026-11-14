// Figma: «Шарттар және құпиялылық» (13886:39881)
import { useGo } from "../nav";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import chev from "../assets/icons/cardMore.svg";

const docs = [["Пайдалану шарттары", "terms"], ["Құпиялылық саясаты", "privacy"], ["Қайтару ережесі", "refund"], ["Оферта", "offer"]];

export function Terms() {
  const go = useGo();
  return (
    <SubPage title="Шарттар және құпиялылық" variant="roomy">
      <Group>
        {docs.map(([t, id]) => <Row key={id} inset={16} title={t} onClick={() => go("/profile/doc/" + id)} right={<img src={chev} width={20} height={20} alt="" />} />)}
      </Group>
      <Note i={1}>Құжаттар Telegram ішінде ашылады.</Note>
    </SubPage>
  );
}
