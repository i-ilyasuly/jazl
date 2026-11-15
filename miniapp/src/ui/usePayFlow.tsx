// Қайта алу мен ақылы ұзартудың ортақ төлем ағыны: Kaspi Pay — BuySheet-тің нөмір/күту қадамдары,
// карта — MainButton прогресі. Бэкенд қосылғанда осы жерде POST /payments шақырылады.
import { useState } from "react";
import type { Offer } from "../mocks/offers";
import { useDefaultMethod, useKaspiPhone, useMethods } from "../store";
import { haptic, tg } from "../telegram";
import { BuySheet, type BuyStep } from "./BuySheet";

interface Sheet { offer: Offer; start: BuyStep; done: () => void }

export function usePayFlow() {
  const methods = useMethods();
  const def = useDefaultMethod();
  const saved = useKaspiPhone();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const method = methods.find((m) => m.id === def) ?? methods[0];

  /** offer — төленетін нәрсе (атауы, бағасы); done — төлем өткеннен кейін. */
  const pay = (offer: Offer, done: () => void) => {
    if (busy) return;
    haptic.medium();
    if (method?.id === "kaspi") { setSheet({ offer, start: saved ? "wait" : "kaspi", done }); return; }
    setBusy(true);
    tg?.MainButton?.showProgress?.(false);
    window.setTimeout(() => { tg?.MainButton?.hideProgress?.(); setBusy(false); haptic.success(); done(); }, 1100);
  };
  const pickMethod = (offer: Offer) => { haptic.tap(); setSheet({ offer, start: "method", done: () => undefined }); };

  const node = sheet && (
    <BuySheet offer={sheet.offer} start={sheet.start} onClose={() => setSheet(null)}
      onPaid={() => { const d = sheet.done; setSheet(null); d(); }} />
  );
  return { method, pay, pickMethod, busy, sheetOpen: Boolean(sheet), node };
}
