// Карта төлемі: банк растауы (3-D Secure). Нақты провайдерде клиент банктің бетінде растайды, біз нәтижесін күтеміз (wait=1, сервер сұралады);
// сынақ провайдерінде — банк бетінің үлгісі осы жерде (SMS коды → «Растау» / «Бас тарту»). Стилі — PayResult (Figma «Төлем өңделуде»).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import { adoptPurchase } from "../store";
import { paymentStatus, testConfirm, type CheckoutResult } from "../pay/checkout";
import { api } from "../api";
import s from "./PayResult.module.css";

export function Pay3ds() {
  const { id = "" } = useParams();
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const offer = q.get("offer") ?? ""; const label = q.get("label") ?? "Карта"; const wait = q.get("wait") === "1";
  const go = useGo();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const done = useCallback((r: CheckoutResult) => {
    // Банктен startapp арқылы оралса (offer белгісіз) — ұсынысты сервер жауабынан аламыз
    const off = offer || (r.status === "paid" ? r.pack.offerSlug : "");
    if (r.status === "paid") { adoptPurchase(off, r.pack, label); haptic.success(); go(`/success/${off}`, "up", { replace: true }); return true; }
    if (r.status === "failed") { haptic.error(); go(off ? `/pay/fail/${off}?r=${encodeURIComponent(r.reason)}` : "/packs", "up", { replace: true }); return true; }
    return false;
  }, [go, offer, label]);
  useEffect(() => { void api<{ amount?: number }>(`/v1/payments/${id}`).then((j) => setAmount(j.amount ?? null)).catch(() => null); }, [id]);
  // Банк бетінде растау (нақты провайдер): нәтиже вебхукпен серверге келеді — 2 секунд сайын сұраймыз
  useEffect(() => {
    if (!wait) return;
    let live = true;
    const tick = async () => { if (!live) return; const r = await paymentStatus(id); if (live && !done(r)) setTimeout(() => void tick(), 2000); };
    void tick();
    return () => { live = false; };
  }, [wait, id, done]);
  const confirm = useCallback(async (approve: boolean) => {
    if (busy) return;
    if (approve && code.length < 6) { haptic.error(); return; }
    setBusy(true); haptic.medium();
    const r = await testConfirm(id, approve);
    setBusy(false);
    if (!done(r)) haptic.error();
  }, [busy, code, id, done]);
  const cancel = useCallback(() => void confirm(false), [confirm]);
  useBackButton(cancel);
  const main = useMemo<{ text: string; disabled?: boolean; onClick: () => void }>(() => (wait ? { text: "Тексеру", onClick: () => { void paymentStatus(id).then(done); } } : { text: busy ? "…" : "Растау", disabled: busy || code.length < 6, onClick: () => { void confirm(true); } }), [wait, busy, code, id, done, confirm]);
  const second = useMemo(() => ({ text: "Бас тарту", position: "left" as const, onClick: cancel }), [cancel]);
  useBottomButtons(main, second);
  const sum = amount !== null ? `${amount.toLocaleString("ru-RU").replace(/,/g, " ")} ₸` : "";
  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={cancel} />
      <div className={s.body} style={{ paddingTop: "calc(180px + var(--top-shift, 0px))" }}>
        <Sticker name={wait ? "wait" : "lock"} size={120} className={s.sticker} />
        <h1 className={s.title}>{wait ? "Банк растауын күтудеміз" : "Төлемді банкте растаңыз"}</h1>
        <p className={s.text}>{wait ? "Банк бетінде төлемді растаңыз. Расталған сәтте пакет өзі қосылады." : "Банк картаңызға жіберген SMS кодын енгізіңіз (3-D Secure)."}</p>
        <div className={s.kvBox}>
          <p><span>Алушы</span><b>Jazl+</b></p>
          {sum && <p><span>Сома</span><b>{sum}</b></p>}
          <p><span>Карта</span><b>{label}</b></p>
        </div>
        {!wait && <>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" aria-label="SMS коды"
            style={{ marginTop: 16, width: 220, height: 56, borderRadius: 12, border: 0, outline: 0, textAlign: "center", fontSize: 28, letterSpacing: 8, background: "var(--surface-white)", color: "var(--text-strong)", boxShadow: "inset 0 0 0 1px var(--separator)" }} />
          <p className={`t-cap1 ${s.note}`} style={{ color: "var(--text-secondary)", marginTop: 4 }}>Сынақ режимі: кез келген 6 сан</p>
        </>}
      </div>
      {!inTelegram && <div className={s.bar}><button className={`${s.btn} ${s.second}`} onClick={cancel}>Бас тарту</button><button className={s.btn} disabled={main.disabled} onClick={main.onClick}>{main.text}</button></div>}
    </div>
  );
}
