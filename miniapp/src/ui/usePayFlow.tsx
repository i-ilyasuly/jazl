// Қайта алу мен ақылы ұзартудың ортақ төлем ағыны: Kaspi Pay — BuySheet-тің нөмір/күту қадамдары,
// карта — MainButton прогресі. Бэкенд қосылғанда осы жерде POST /payments шақырылады.
import { useState } from "react";
import type { Offer } from "../mocks/offers";
import { useDefaultMethod, useKaspiPhone, useMethods } from "../store";
import { haptic, nativeAlert, openExternal, tg } from "../telegram";
import { useGo } from "../nav";
import { cardOf, failText, hasServer, openBank, pendingPay, type CheckoutCard, type CheckoutResult } from "../pay/checkout";
type Paid = Extract<CheckoutResult, { status: "paid" }>;
import { BuySheet, type BuyStep } from "./BuySheet";

interface Sheet { offer: Offer; start: BuyStep; done: (r?: Paid) => void; charge?: (card: CheckoutCard) => Promise<CheckoutResult> }

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
  const pay = (offer: Offer, done: (r?: Paid) => void, charge?: (card: CheckoutCard) => Promise<CheckoutResult>, opts?: { confirm?: boolean }) => {
    if (busy) return;
    haptic.medium();
    // Сыйлық (Патша, 2026-11-22): өзіне сатып алғандағыдай — төлем парағы, тәсілді таңдау (Kaspi, карта), сосын төлем
    if (opts?.confirm) { setSheet({ offer, start: "sum", done, charge }); return; }
    if (method?.id === "kaspi") { setSheet({ offer, start: saved ? "wait" : "kaspi", done }); return; }
    const cardBody = charge && method?.card && hasServer() ? cardOf(method) : null;
    if (charge && cardBody) {
      setBusy(true); tg?.MainButton?.showProgress?.(false);
      void charge(cardBody).then((r) => {
        tg?.MainButton?.hideProgress?.(); setBusy(false);
        if (r.status === "paid") { haptic.success(); done(r); return; }
        if (r.status === "action_required") {
          // Банк растауы: бет ауысады; расталған соң Pay3ds осы әрекетті шақырады (артқа оралып, жұмыс жалғасады)
          pendingPay.set(r.paymentId, (x) => done(x));
          const q = `?label=${encodeURIComponent(method.title)}&back=1`;
          if (r.confirmUrl.startsWith("app:")) go(r.confirmUrl.slice(4) + q, "up");
          else { openBank(r); go(`/pay/3ds/${r.paymentId}${q}&wait=1`, "up"); }
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
    <BuySheet offer={sheet.offer} start={sheet.start} charge={sheet.charge} onClose={() => setSheet(null)}
      onPaid={(r) => { const d = sheet.done; setSheet(null); d(r); }} />
  );
  return { method, pay, pickMethod, busy, sheetOpen: Boolean(sheet), node };
}
