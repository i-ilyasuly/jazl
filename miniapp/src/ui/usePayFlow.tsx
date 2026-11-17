// Қайта алу мен ақылы ұзартудың ортақ төлем ағыны: Kaspi Pay — BuySheet-тің нөмір/күту қадамдары,
// карта — MainButton прогресі. Бэкенд қосылғанда осы жерде POST /payments шақырылады.
import { useState } from "react";
import type { Offer } from "../mocks/offers";
import { useDefaultMethod, useKaspiPhone, useMethods } from "../store";
import { haptic, nativeAlert, openExternal, tg } from "../telegram";
import { useGo } from "../nav";
import { failText, hasServer, pendingPay, type CheckoutCard, type CheckoutResult } from "../pay/checkout";
type Paid = Extract<CheckoutResult, { status: "paid" }>;
import { BuySheet, type BuyStep } from "./BuySheet";

interface Sheet { offer: Offer; start: BuyStep; done: () => void }

export function usePayFlow() {
  const methods = useMethods();
  const def = useDefaultMethod();
  const saved = useKaspiPhone();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const go = useGo();
  const method = methods.find((m) => m.id === def) ?? methods[0];

  /** offer — төленетін нәрсе (атауы, бағасы); done — төлем өткеннен кейін (картада — сервер жауабымен).
   *  charge — нақты карта төлемі (сервер бар, карта сақталған не бір реттік болса): қайта алу, сыйлық, ұзарту өздерінің сұрауын береді. */
  const pay = (offer: Offer, done: (r?: Paid) => void, charge?: (card: CheckoutCard) => Promise<CheckoutResult>) => {
    if (busy) return;
    haptic.medium();
    if (method?.id === "kaspi") { setSheet({ offer, start: saved ? "wait" : "kaspi", done }); return; }
    if (charge && method?.card && hasServer() && (method.cardId || method.cryptogram)) {
      setBusy(true); tg?.MainButton?.showProgress?.(false);
      void charge(method.cardId ? { id: method.cardId } : { cryptogram: method.cryptogram!, save: false }).then((r) => {
        tg?.MainButton?.hideProgress?.(); setBusy(false);
        if (r.status === "paid") { haptic.success(); done(r); return; }
        if (r.status === "action_required") {
          // Банк растауы: бет ауысады; расталған соң Pay3ds осы әрекетті шақырады (артқа оралып, жұмыс жалғасады)
          pendingPay.set(r.paymentId, (x) => done(x));
          const q = `?label=${encodeURIComponent(method.title)}&back=1`;
          if (r.confirmUrl.startsWith("app:")) go(r.confirmUrl.slice(4) + q, "up");
          else { openExternal(r.confirmUrl); go(`/pay/3ds/${r.paymentId}${q}&wait=1`, "up"); }
          return;
        }
        haptic.error(); nativeAlert(`Төлем өтпеді. ${failText[r.reason] ?? failText.declined}`);
      });
      return;
    }
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
