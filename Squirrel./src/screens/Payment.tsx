// Figma: «Төлем тәсілдері / Тізім» (13886:36367) және «Карта әрекеттері» (13886:36451)
import { Tile } from "../ui/Tile";
import { useCallback, useState } from "react";
import { useGo } from "../nav";
import { removeMethod, setDefaultMethod, useDefaultMethod, useMethods, type PayMethod } from "../store";
import { haptic } from "../telegram";
import { ActionSheet } from "../ui/ActionSheet";
import { MainBar } from "../ui/MainBar";
import { Confirm } from "../ui/Confirm";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import more from "../assets/icons/cardMore.svg";
import s from "./Payment.module.css";

export function Payment() {
  const go = useGo();
  const methods = useMethods();
  const def = useDefaultMethod();
  const [sheet, setSheet] = useState<PayMethod | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [ask, setAsk] = useState<PayMethod | null>(null);
  const hasCard = methods.some((m) => m.card) && !/[?&]nocard=1/.test(window.location.hash);
  const addCard = useCallback(() => go("/profile/card-add"), [go]);
  const remove = (m: string) => { haptic.warning(); setLeaving(m); setTimeout(() => { removeMethod(m); setLeaving(null); }, 300); };
  function pick(id: string) {
    if (!sheet) return;
    if (id === "default") { haptic.success(); setDefaultMethod(sheet.id); }
    if (id === "delete") setAsk(sheet);
  }
  return (
    <SubPage title="Төлем тәсілдері">
      <Group>
        {methods.filter((m) => hasCard || !m.card).map((m) => (
          <Row key={m.id} wrap title={m.title} sub={m.sub} onClick={m.card || m.id !== def ? () => { haptic.tap(); setSheet(m); } : undefined}
            left={<Tile e={m.emoji} size={40} className={leaving === m.id ? s.leave : undefined} />}
            right={m.id === def ? <span key="d" className={`t-cap1 w-600 ${s.def}`}>Әдепкі</span> : <img src={more} width={20} height={20} alt="" />} />
        ))}
        {hasCard && <button className={s.add} onClick={() => go("/profile/card-add")}>
          <Tile e="+" size={40} /><span className={s.addText}>Карта қосу</span>
        </button>}
      </Group>
      {/* Figma «Төлем тәсілдері / Карта жоқ» 13886:36663 — «Карта қосу» төменгі негізгі батырмаға шығады */}
      <Note i={1}>{hasCard ? "Карта деректері төлем провайдеріне қауіпсіз жіберіледі." : "Карта қосылмаған. Kaspi Pay арқылы төлей аласың."}</Note>
      {!hasCard && <MainBar text="Карта қосу" onClick={addCard} />}
      {sheet && <ActionSheet title={sheet.title} onClose={() => setSheet(null)} onPick={pick}
        actions={[...(sheet.id !== def ? [{ id: "default", text: "Әдепкі ету" }] : []), ...(sheet.card && !sheet.hosted ? [{ id: "delete", text: "Жою", danger: true }] : [])]} />}
      {ask && <Confirm title="Картаны жою?" text={`${ask.title} төлем тәсілдерінен жойылады.`} cancel="Бас тарту" ok="Жою" danger onClose={() => setAsk(null)} onOk={() => remove(ask.id)} />}
    </SubPage>
  );
}
