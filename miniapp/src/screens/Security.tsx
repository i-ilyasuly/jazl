// Figma: «Қауіпсіздік / Экран құлпы» (13886:38835)
// Биометрия Telegram-ның нативті BiometricManager-і арқылы жүреді (Face ID / саусақ ізі).
import { useGo } from "../nav";
import { hasPin, setSettings, useSettings } from "../store";
import { biometricAuth, biometricKind, haptic, nativeAlert, nativePick } from "../telegram";
import { Group, Note, Row, SubPage, Switch } from "../ui/SubPage";
import s from "./Security.module.css";

const lockTimes = [{ id: "0", text: "Бірден" }, { id: "1", text: "1 минут" }, { id: "5", text: "5 минут" }];

export function Security() {
  const go = useGo();
  const st = useSettings();
  const off = !st.lock;
  const kind = biometricKind();
  const bioSub = kind === "face" ? "Face ID" : kind === "finger" ? "Саусақ ізі" : "Саусақ ізі немесе бет";

  async function toggleBio(v: boolean) {
    if (!v) return setSettings({ bio: false });
    const r = await biometricAuth("Jazl+ төлемдерін биометриямен растау");
    if (r === "ok" || r === "browser") { haptic.success(); setSettings({ bio: true }); }
    else if (r === "none") nativeAlert("Бұл құрылғыда биометрия бапталмаған.");
  }
  async function toggleLock(v: boolean) {
    if (!v) return setSettings({ lock: false, bio: false });
    if (!hasPin()) return go("/profile/pin/create", "up"); // алдымен PIN, содан кейін биометрия
    setSettings({ lock: true });
    await toggleBio(true);
  }
  async function pickTime() {
    const next = lockTimes[(lockTimes.findIndex((t) => t.id === st.autolock) + 1) % lockTimes.length].id;
    const id = await nativePick("Автоқұлып", "Қолданба қанша уақыттан кейін құлыпталсын?", lockTimes, next);
    if (id) { haptic.select(); setSettings({ autolock: id }); }
  }
  return (
    <SubPage title="Қауіпсіздік" variant="settings">
      <Group i={0}>
        <Row inset={16} title="Экран құлпы" sub="PIN-код немесе биометрия" right={<Switch on={st.lock} onChange={toggleLock} />} />
        <Row inset={16} dim={off} title="PIN-ді өзгерту" onClick={() => go("/profile/pin/change", "up")} />
        <Row inset={16} dim={off} title="Биометрия" sub={bioSub} right={<Switch on={st.bio} onChange={toggleBio} />} />
        <Row inset={16} dim={off} title="Автоқұлып" onClick={pickTime} right={<span key={st.autolock} className={`t-text ${s.value}`}>{lockTimes.find((t) => t.id === st.autolock)?.text}</span>} />
      </Group>
      <h2 className={`t-sub2 w-600 ${s.section} rise`} style={{ ["--i" as string]: 1 }}>Қашан сұралады</h2>
      <Group i={1}>
        <Row inset={16} dim={off} title="Сақталған картамен төлеу" right={<Switch on={st.onCard} onChange={(v) => setSettings({ onCard: v })} />} />
        <Row inset={16} dim={off} title="Төлем тәсілдерін өзгерту" right={<Switch on={st.onMethods} onChange={(v) => setSettings({ onMethods: v })} />} />
        <Row inset={16} dim={off} title="Қолданбаны ашқанда" sub="Құлып уақыты өткенде" right={<Switch on={st.onOpen} onChange={(v) => setSettings({ onOpen: v })} />} />
      </Group>
      <Note>Экран құлпы төлем қауіпсіздігі үшін: PIN төлемді растағанда сұралады. PIN-ді ұмытсаң, Telegram аккаунтың арқылы қалпына келтіре аласың.</Note>
    </SubPage>
  );
}
