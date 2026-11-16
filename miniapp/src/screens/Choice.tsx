// Figma: «Тіл» (13886:39121) және «Қала» (13886:39189)
import { Emo } from "../ui/Emo";
import { setSettings, useSettings } from "../store";
import { askWriteAccess, haptic, nativeAlert, tg } from "../telegram";
import { Group, Note, Radio, Row, SubPage } from "../ui/SubPage";
import s from "./Choice.module.css";

export function Language() {
  const st = useSettings();
  const code = tg?.initDataUnsafe?.user?.language_code;
  const pick = (lang: "tg" | "kk") => { haptic.select(); setSettings({ lang }); };
  return (
    <SubPage title="Тіл">
      <Group>
        <Row inset={16} title="Telegram тілі" sub={code === "ru" ? "Русский" : "Қазақша"} onClick={() => pick("tg")} right={<Radio on={st.lang === "tg"} />} />
        <Row inset={16} title="Қазақша" onClick={() => pick("kk")} right={<Radio on={st.lang === "kk"} />} />
        {/* Орыс тілі кейін қосылады: жол көрініп тұрады, бірақ әзірге таңдалмайды */}
        <Row inset={16} title="Русский" onClick={() => { haptic.tap(); nativeAlert("Орыс тілі жуырда қосылады."); }} right={<Radio on={false} />} />
      </Group>
      <Note i={1}>Қолданба тілі Telegram тіліне сәйкес өзгереді. Қаласаң, бөлек тіл таңда.</Note>
    </SubPage>
  );
}

export function City() {
  const st = useSettings();
  async function notify() {
    if (st.astanaNotify) return setSettings({ astanaNotify: false });
    if (await askWriteAccess()) { haptic.success(); setSettings({ astanaNotify: true }); }
  }
  return (
    <SubPage title="Қала">
      <Group>
        <Row inset={16} title="Қарағанды" sub="10 мекеме" right={<Radio on />} />
        <Row inset={16} title="Астана" sub="Жуырда ашылады" right={
          <button className={`t-sub2 w-600 ${s.notify} ${st.astanaNotify ? s.done : ""}`} onClick={notify}>
            <span key={String(st.astanaNotify)} className={s.swap}>{st.astanaNotify ? "✓ Қосылды" : <><Emo e="🔔" size={20} />Хабарла</>}</span>
          </button>} />
      </Group>
      <Note i={1}>Қалаңыз ашылғанда, Telegram арқылы хабарлаймыз.</Note>
    </SubPage>
  );
}
