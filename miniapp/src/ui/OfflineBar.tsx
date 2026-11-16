// Figma «19 · Қате / Желі жоқ жолағы» (13886:40319): желі үзілгенде таб беттерінде навигацияның үстінде
// сары жолақ шығады, деректер ескі болуы мүмкін. Желі қайта қосылса өзі жоғалады. Демо: ?net=off
import { useEffect, useState } from "react";
import { haptic } from "../telegram";
import s from "./OfflineBar.module.css";

const demo = () => window.location.hash.includes("net=off");

export function OfflineBar() {
  const [off, setOff] = useState(() => demo() || !navigator.onLine);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => setOff(demo());
    const down = () => setOff(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", down); };
  }, []);
  if (!off) return null;
  const retry = () => {
    haptic.tap(); setBusy(true);
    setTimeout(() => { setBusy(false); if (navigator.onLine && !demo()) { haptic.success(); setOff(false); } else haptic.error(); }, 700);
  };
  return (
    <div className={`${s.bar} infoBox infoWarn`} role="status">
      <span className={s.edge} />
      <p className={`t-sub2 ${s.text}`}>Желі жоқ • деректер ескі болуы мүмкін</p>
      <button className={`t-sub2 w-600 ${s.btn}`} disabled={busy} onClick={retry}>Қайта көру</button>
      <span className={s.mark} aria-hidden>”</span>
    </div>
  );
}
