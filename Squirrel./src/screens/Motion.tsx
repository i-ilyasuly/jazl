// Профиль → Анимациялар (Патша, 2026-11-21): адам стикерлер мен анимациялық эмодзилерді өзі өшіре алады.
// Өшірілсе — бәрі бір кадрда тоқтап тұрады (суреттің өзі көрінеді), бет ауысулары мен батырмалар бұрынғыдай жұмыс істейді.
import { setSettings, useSettings } from "../store";
import { Group, Note, Row, SubPage, Switch } from "../ui/SubPage";
import { Sticker } from "../ui/Sticker";

export function Motion() {
  const st = useSettings();
  const on = st.motion !== false;
  return (
    <SubPage title="Анимациялар" variant="settings">
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 8px" }}><Sticker name="hello" size={120} /></div>
      <Group i={0}>
        <Row inset={16} title="Анимациялар" sub={on ? "Стикерлер мен эмодзилер қозғалады" : "Өшірулі — бәрі тоқтап тұрады"} right={<Switch on={on} onChange={(v) => setSettings({ motion: v })} />} />
      </Group>
      <Note i={1}>Үйрек стикерлері мен карточкалардағы 🔥 🔝 ⏳ ⚡ 🚀 🆕 ⭐ сияқты эмодзилер қозғалып тұрады. Телефоныңыз ескі не баяу болса, бет айналдырғанда қатып қалса, батарея тез отырса немесе қозғалыс көзге ауыр тисе — өшіріп қойыңыз. Суреттер орнында қала береді, тек қимылы тоқтайды. Кез келген уақытта қайта қоса аласыз.</Note>
    </SubPage>
  );
}
