// Профиль → Анимациялар (Патша, 2026-11-21): адам стикерлер мен анимациялық эмодзилерді өзі өшіре алады.
// Өшірілсе — бәрі бір кадрда тоқтап тұрады (суреттің өзі көрінеді), бет ауысулары мен батырмалар бұрынғыдай жұмыс істейді.
import { setSettings, useSettings } from "../store";
import { Group, Note, Radio, Row, SubPage, Switch } from "../ui/SubPage";
import { BadgeIcon } from "../ui/BadgeIcon";
import { haptic } from "../telegram";
import type { Badge } from "../ui/badges";
import { Sticker } from "../ui/Sticker";

export function Motion() {
  const st = useSettings();
  const on = st.motion !== false;
  const style = st.badgeStyle ?? "emoji";
  const pick = (v: "emoji" | "icon") => { if (v !== style) { haptic.select(); setSettings({ badgeStyle: v }); } };
  return (
    <SubPage title="Анимациялар" variant="settings">
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 8px" }}><Sticker name="hello" size={120} /></div>
      <Group i={0}>
        <Row inset={16} title="Анимациялар" sub={on ? "Стикерлер мен эмодзилер қозғалады" : "Өшірулі — бәрі тоқтап тұрады"} right={<Switch on={on} onChange={(v) => setSettings({ motion: v })} />} />
      </Group>
      <Note i={1}>Үйрек стикерлері мен карточкалардағы 🔥 🔝 ⏳ ⚡ 🚀 🆕 ⭐ сияқты эмодзилер қозғалып тұрады. Телефоныңыз ескі не баяу болса, бет айналдырғанда қатып қалса, батарея тез отырса немесе қозғалыс көзге ауыр тисе — өшіріп қойыңыз. Суреттер орнында қала береді, тек қимылы тоқтайды. Кез келген уақытта қайта қоса аласыз.</Note>
      {/* Патша (2026-11-21): карточка белгілерінің түрін өзі таңдайды — анимациялық эмодзи не krisha.kz сияқты иконкалар */}
      <Group i={2} header="Карточкадағы белгілер">
        <Row title="Анимациялық эмодзи" sub="Telegram эмодзилері, қимылдайды" left={<Preview kind="emoji" />} onClick={() => pick("emoji")} right={<Radio on={style === "emoji"} />} />
        <Row title="Иконкалар" sub="Түрлі-түсті белгілер, қимылсыз" left={<Preview kind="icon" />} onClick={() => pick("icon")} right={<Radio on={style === "icon"} />} />
      </Group>
      <Note i={3}>Белгілер ұсыныс туралы қысқаша айтады: 🔥 ыстық, 🔝 топ, 🚀 хит, ⏳ аяқталуға жақын, ⚡ аз қалды, 🆕 жаңа, ⭐ жоғары рейтинг. Иконкалар тыныш әрі айқын көрінеді, ал эмодзилер көзге көбірек түседі.</Note>
    </SubPage>
  );
}

const SAMPLE: Badge["emo"][] = ["fire", "top", "rocket"];
/** Үлгі: үш белгі қатар (сол жақтағысы үстінде) */
function Preview({ kind }: { kind: "emoji" | "icon" }) {
  return (
    <span style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", width: 40, justifyContent: "center", flex: "none" }}>
      {SAMPLE.map((n, i) => kind === "icon"
        ? <span key={n} style={{ zIndex: i + 1, marginRight: i ? -6 : 0, display: "flex", position: "relative" }}><BadgeIcon name={n} size={22} ring /></span>
        : <span key={n} style={{ fontSize: 15, lineHeight: 1, marginRight: i ? -3 : 0 }}>{({ fire: "🔥", top: "🔝", rocket: "🚀" } as Record<string, string>)[n]}</span>)}
    </span>
  );
}
