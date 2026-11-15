// Діріл сынағы: Telegram-ның әр нативті дірілін телефонда тікелей тексеруге арналған бет.
import { useState } from "react";
import { haptic, hapticInfo, rawHaptic } from "../telegram";
import { Group, Note, Row, SubPage } from "../ui/SubPage";

const raw: [string, "impact" | "notification" | "selection", string?][] = [
  ["impact · light", "impact", "light"], ["impact · soft", "impact", "soft"], ["impact · medium", "impact", "medium"],
  ["impact · rigid", "impact", "rigid"], ["impact · heavy", "impact", "heavy"], ["selection", "selection"],
  ["notification · success", "notification", "success"], ["notification · warning", "notification", "warning"], ["notification · error", "notification", "error"],
];
const app: [string, () => void][] = [["Жеңіл (карточка, ұяшық)", haptic.tap], ["Таңдау (сегмент, чип)", haptic.select], ["Орташа (Төлеу, Қолдану)", haptic.medium], ["Ауыр (QR оқылды)", haptic.heavy], ["Сәтті", haptic.success], ["Қате", haptic.error]];

export function HapticTest() {
  const i = hapticInfo();
  const [last, setLast] = useState("");
  return (
    <SubPage title="Діріл сынағы" variant="settings">
      <Group header="Орта" i={0}>
        <Row title="Telegram ішінде" right={<b>{i.inTelegram ? "иә" : "жоқ"}</b>} />
        <Row title="Платформа / нұсқа" right={<b>{i.platform} · {i.version}</b>} />
        <Row title="HapticFeedback" right={<b>{i.has && i.ok ? "бар" : "жоқ"}</b>} />
      </Group>
      <Group header="Қосымшадағы дірілдер" i={1}>
        {app.map(([t, f]) => <Row key={t} title={t} onClick={() => { f(); setLast(t); }} />)}
      </Group>
      <Group header="Нативті түрлер (өзгеріссіз)" i={2}>
        {raw.map(([t, k, v]) => <Row key={t} title={t} onClick={() => setLast(rawHaptic(k, v) ? t : t + " — қолжетімсіз")} />)}
      </Group>
      <Note>{last ? `Соңғы: ${last}` : "Әр жолды басып, дірілді сезесіз бе — тексеріңіз."}</Note>
    </SubPage>
  );
}
