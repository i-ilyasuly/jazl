// Figma: «Төлем тәсілдері / Тізім» (13886:36367) және «Карта әрекеттері» (13886:36451)
import { useState } from "react";
import { useGo } from "../nav";
import { removeMethod, setDefaultMethod, useDefaultMethod, useMethods, type PayMethod } from "../store";
import { haptic } from "../telegram";
import { ActionSheet } from "../ui/ActionSheet";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import more from "../assets/icons/cardMore.svg";
import s from "./Payment.module.css";

export function Payment() {
  const go = useGo();
  const methods = useMethods();
  const def = useDefaultMethod();
  const [sheet, setSheet] = useState<PayMethod | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  function pick(id: string) {
    if (!sheet) return;
    if (id === "default") { haptic.success(); setDefaultMethod(sheet.id); }
    if (id === "delete") { const m = sheet.id; setLeaving(m); setTimeout(() => { removeMethod(m); setLeaving(null); }, 300); }
  }
  return (
    <SubPage title="Төлем тәсілдері">
      <Group>
        {methods.map((m) => (
          <Row key={m.id} wrap title={m.title} sub={m.sub} onClick={m.card || m.id !== def ? () => { haptic.tap(); setSheet(m); } : undefined}
            left={<span className={`${s.emoji} ${leaving === m.id ? s.leave : ""}`}>{m.emoji}</span>}
            right={m.id === def ? <span key="d" className={`t-cap1 w-600 ${s.def}`}>Әдепкі</span> : <img src={more} width={20} height={20} alt="" />} />
        ))}
        <button className={s.add} onClick={() => go("/profile/card-add")}>
          <span className={`${s.emoji} ${s.plus}`}>➕</span><span className={s.addText}>Карта қосу</span>
        </button>
      </Group>
      <Note i={1}>Карта деректері төлем провайдеріне қауіпсіз жіберіледі.</Note>
      {sheet && <ActionSheet title={sheet.title} onClose={() => setSheet(null)} onPick={pick}
        actions={[...(sheet.id !== def ? [{ id: "default", text: "Әдепкі ету" }] : []), ...(sheet.card ? [{ id: "delete", text: "Жою", danger: true }] : [])]} />}
    </SubPage>
  );
}
