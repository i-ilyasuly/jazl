// Figma: «Сыйлықтарым / Жіберілген» (13886:37243) және «Алынған» (13886:37343)
import { useMemo, useState } from "react";
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { useGo } from "../nav";
import { useGifts } from "../store";
import { haptic } from "../telegram";
import { Group, Note, Row, SkRows, SubPage } from "../ui/SubPage";
import s from "./Gifts.module.css";

export function Gifts() {
  const go = useGo();
  const { loading } = useMock("gifts", true, 450);
  const [tab, setTab] = useState(0);
  const all = useGifts();
  const list = all.filter((x) => x.dir === (tab === 0 ? "sent" : "got"));
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
            <Row key={g.id} title={g.name} sub={g.pack} onClick={g.status === "ok" ? undefined : () => go("/profile/gift/" + g.id)}
              left={<span className={s.avatar} style={{ background: g.color }}>{g.name.slice(0, 1)}</span>}
              right={<span className={`t-cap1 ${s.chip} ${s[g.status]}`}>{g.label}</span>} />
          ))}
        </Group>
        <Note>{tab === 0 ? "Сыйлықты алушы 7 күн ішінде қабылдамаса, пакет өзіңе қайтады." : "Сыйлықты алған соң пакет Пакеттерімде көрінеді."}</Note>
      </div>
    </SubPage>
  );
}
