// Figma: «Сатып алу тарихы / Тізім» (13886:36715)
import { Tile, isEvent } from "../ui/Tile";
import { Emo } from "../ui/Emo";
import { useMemo } from "react";
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { history as data } from "../mocks/history";
import { useGo } from "../nav";
import { Group, Row, SkRows, SubPage } from "../ui/SubPage";
import chev from "../assets/icons/chevRight.svg";
import s from "./History.module.css";

export function History() {
  const go = useGo();
  const { loading } = useMock("history", true, 450);
  const toOffers = useMemo(() => ({ text: "Ұсыныстарды көру", onClick: () => go("/", "fade") }), [go]);
  if (demoEmpty() || !data.length) return <SubPage title="Сатып алу тарихы"><EmptyState sticker="archive" title="Әзірге сатып алу жоқ" text="Алғашқы пакет сатып алынғаннан кейін чектер осында көрінеді" action={toOffers} /></SubPage>;
  return (
    <SubPage title="Сатып алу тарихы">
      {/* Кассада QR арқылы пайдаланылған бірліктер — бөлек бетте (Figma «Қолдану тарихы» 13918:8337) */}
      <Group i={0}>
        <Row title="Қолдану тарихы" sub="Кассада пайдаланылған бірліктер" onClick={() => go("/profile/usage")}
          left={<Tile e="🧾" size={40} />} right={<img src={chev} width={18} height={18} alt="" />} />
      </Group>
      {data.map((g, gi) => (
        <Group key={g.month} header={g.month} i={gi}>
          {loading ? <SkRows n={g.items.length} /> : g.items.map((it) => (
            <Row key={it.id} title={it.t} sub={it.sub} onClick={() => go("/profile/receipt/" + it.id)}
              left={isEvent(it.e) ? <Tile e={it.e} size={40} /> : <span className={s.emoji}><Emo e={it.e} size={28} /></span>}
              right={<span className={`t-text w-600 ${s.value} ${it.plus ? s.plus : ""}`}>{it.v}</span>} />
          ))}
        </Group>
      ))}
    </SubPage>
  );
}
