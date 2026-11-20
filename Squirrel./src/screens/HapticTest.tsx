// Діріл сынағы: Telegram-ның нативті дірілдерін және Android WebView-дің тікелей дірілін (navigator.vibrate)
// телефонда тексеруге арналған бет. Себебі мен шешімі — telegram.ts-тегі «СЕБЕБІ» түсініктемесінде.
import { useState } from "react";
import { haptic, hapticInfo, rawHaptic, rawVibrate } from "../telegram";
import { Group, Note, Row, SubPage } from "../ui/SubPage";

const raw: [string, "impact" | "notification" | "selection", string?][] = [
  ["impact · light", "impact", "light"], ["impact · soft", "impact", "soft"], ["impact · medium", "impact", "medium"],
  ["impact · rigid", "impact", "rigid"], ["impact · heavy", "impact", "heavy"], ["selection", "selection"],
  ["notification · success", "notification", "success"], ["notification · warning", "notification", "warning"], ["notification · error", "notification", "error"],
];
const app: [string, () => void][] = [["Жеңіл (карточка, ұяшық)", haptic.tap], ["Таңдау (сегмент, чип)", haptic.select], ["Жұмсақ (парақ жабу)", haptic.soft], ["Орташа (Төлеу, Қолдану)", haptic.medium], ["Қатаң (PIN енгізілді)", haptic.rigid], ["Ауыр (QR оқылды)", haptic.heavy], ["Сәтті", haptic.success], ["Ескерту", haptic.warning], ["Қате", haptic.error]];
const direct: [string, number | number[]][] = [["10 мс (таңдау)", 10], ["12 мс (жеңіл)", 12], ["16 мс (жұмсақ)", 16], ["24 мс (орташа)", 24], ["36 мс (ауыр)", 36], ["Екі соққы", [20, 60, 20]]];

export function HapticTest() {
  const i = hapticInfo();
  const [last, setLast] = useState("");
  return (
    <SubPage title="Діріл сынағы" variant="settings">
      <Group header="Орта" i={0}>
        <Row title="Telegram ішінде" right={<b className="t-text">{i.inTelegram ? "иә" : "жоқ"}</b>} />
        <Row title="Платформа / нұсқа" right={<b className="t-text">{i.platform} · {i.version}</b>} />
        <Row title="HapticFeedback" right={<b className="t-text">{i.has && i.ok ? "бар" : "жоқ"}</b>} />
        <Row title="navigator.vibrate" right={<b className="t-text">{i.vibrateApi ? "бар" : "жоқ"}</b>} />
      </Group>
      <Group header="Қосымшадағы дірілдер" i={1}>
        {app.map(([t, f]) => <Row key={t} title={t} onClick={() => { f(); const h = hapticInfo(); setLast(`${t}${h.android ? ` · vibrate: ${h.lastVibe === null ? "—" : h.lastVibe ? "иә" : "жоқ → Telegram"}` : ""}`); }} />)}
      </Group>
      <Group header="Android: тікелей діріл (navigator.vibrate)" i={2}>
        {direct.map(([t, p]) => <Row key={t} title={t} onClick={() => { const r = rawVibrate(p); setLast(`${t} → ${r === "none" ? "API жоқ" : r ? "жіберілді" : "бас тартты"}`); }} />)}
      </Group>
      <Group header="Telegram нативті түрлері (өзгеріссіз)" i={3}>
        {raw.map(([t, k, v]) => <Row key={t} title={t} onClick={() => setLast(rawHaptic(k, v) ? t : t + " — қолжетімсіз")} />)}
      </Group>
      <Note i={4}>{last ? `Соңғы: ${last}` : "Huawei сияқты амплитуда басқаруы жоқ телефондарда Telegram-ның impact/selection дірілдері сезілмейді — сондықтан Android-та тікелей діріл қолданылады."}</Note>
    </SubPage>
  );
}
