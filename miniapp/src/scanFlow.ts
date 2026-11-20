// Сканерді ашу ағыны (Патша, 2026-11-17): экран құлпы қосулы болса — PIN сканерлеуден БҰРЫН сұралады,
// содан кейін Telegram-ның нативті сканері ашылады; QR оқылса — төлем парағы (/scan?via=qr&qr=…).
import type { NavigateOptions } from "react-router-dom";
import { getSettings, hasPin, markPinOk, pinFresh, pinServerBio } from "./store";
import { biometricAuth, scanQrNative } from "./telegram";
import type { Dir } from "./nav";

type Go = (to: string | number, dir?: Dir, opts?: NavigateOptions) => void;

/** Бірлік жұмсар алдындағы растау (Патша, 2026-11-17): алдымен саусақ ізі / Face ID, өтпесе — PIN беті.
 *  Растау 5 минут жарамды. "ok" — жалғастыра бер; "pin" — PIN бетіне жіберу керек. */
export async function confirmSpend(): Promise<"ok" | "pin"> {
  if (!(getSettings().lock && hasPin()) || pinFresh()) return "ok";
  if (getSettings().bio && (await biometricAuth("Бірлікті жұмсауды растау")) === "ok") { markPinOk(); await pinServerBio(); return "ok"; }
  return "pin";
}

export function startScan(go: Go, packId?: string) {
  void confirmSpend().then((r) => (r === "ok" ? openScanner(go, packId) : go("/profile/pin/scan", "up", { state: { packId } })));
}

/** replace — PIN бетінен шақырылғанда (PIN беті тарихта қалмайды). */
export function openScanner(go: Go, packId?: string, replace = false) {
  const q = packId ? `pack=${packId}&` : "";
  const r = scanQrNative();
  if (!r) { go(`/scan${packId ? "?pack=" + packId : ""}`, replace ? "forward" : "up", { replace }); return; }
  void r.then((qr) => {
    if (qr !== false) go(`/scan?${q}via=qr&qr=${encodeURIComponent(qr)}`, "up", { replace });
    else if (replace) go(-1, "back");
  });
}
