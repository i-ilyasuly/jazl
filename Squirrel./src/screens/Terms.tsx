// Figma: «Шарттар және құпиялылық» (13886:39881). Құжаттар — legal/texts.ts (бір дереккөз).
// /profile/terms — профильден; /legal — ашық тізім (тіркелусіз, сайт тексеруі үшін).
import { useLocation } from "react-router-dom";
import { useGo } from "../nav";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import { LEGAL } from "../legal/texts";
import chev from "../assets/icons/cardMore.svg";

export function Terms() {
  const go = useGo();
  const pub = useLocation().pathname.startsWith("/legal");
  return (
    <SubPage title="Шарттар" variant="roomy">
      <Group>
        {LEGAL.map((d) => <Row key={d.id} inset={16} title={d.title} sub={d.short} onClick={() => go((pub ? "/legal/" : "/profile/doc/") + d.id)} right={<img src={chev} width={20} height={20} alt="" />} />)}
      </Group>
      <Note i={1}>Құжаттар Telegram ішінде ашылады.</Note>
    </SubPage>
  );
}
