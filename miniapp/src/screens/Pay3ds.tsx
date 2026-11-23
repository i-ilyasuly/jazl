// Карта төлемі: банк растауы (3-D Secure). Нақты провайдерде клиент банктің бетінде растайды, біз нәтижесін күтеміз (wait=1, сервер сұралады);
// сынақ провайдерінде — банк бетінің үлгісі осы жерде (SMS коды → «Растау» / «Бас тарту»). Стилі — PayResult (Figma «Төлем өңделуде»).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, inTelegram, nativeAlert, useBackButton, useBottomButtons } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import { adoptPurchase } from "../store";
import { failText, isDesktop, paymentStatus, pendingPay, testConfirm, type CheckoutResult } from "../pay/checkout";
import { openExternal } from "../telegram";
import QRCode from "qrcode";
import { api } from "../api";
import s from "./PayResult.module.css";

export function Pay3ds() {
  const { id = "" } = useParams();
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const offer = q.get("offer") ?? ""; const label = q.get("label") ?? "Карта"; const wait = q.get("wait") === "1"; const back = q.get("back") === "1";
  const go = useGo();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  // «Halyk арқылы төлеу»: Homebank сілтемесі (телефонда қайта ашу) және QR (компьютерде телефонмен сканерлеу)
  const [hb, setHb] = useState<{ link: string; qr: string } | null>(null);
  const [qrSvg, setQrSvg] = useState("");
  const desk = isDesktop();
  const done = useCallback((r: CheckoutResult) => {
    // Банктен startapp арқылы оралса (offer белгісіз) — ұсынысты сервер жауабынан аламыз
    // Қайта алу / сыйлық / ұзарту: артқа (бастапқы бетке) оралып, сол беттің әрекетін жалғастырамыз
    const pend = pendingPay.get(id);
    if (pend && back) {
      if (r.status === "paid") { pendingPay.delete(id); haptic.success(); go(-1, "back"); setTimeout(() => pend(r), 350); return true; }
      if (r.status === "failed") { pendingPay.delete(id); haptic.error(); go(-1, "back"); setTimeout(() => nativeAlert(`Төлем өтпеді. ${failText[r.reason] ?? failText.declined}`), 350); return true; }
      return false;
    }
    const off = offer || (r.status === "paid" ? r.pack.offerSlug : "");
    if (r.status === "paid") { adoptPurchase(off, r.pack, label); haptic.success(); go(`/success/${off}`, "up", { replace: true }); return true; }
    if (r.status === "failed") { haptic.error(); go(off ? `/pay/fail/${off}?r=${encodeURIComponent(r.reason)}` : "/packs", "up", { replace: true }); return true; }
    return false;
  }, [go, offer, label, id, back]);
  useEffect(() => { void api<{ amount?: number; qr?: string; confirmUrl?: string | null }>(`/v1/payments/${id}`).then((j) => { setAmount(j.amount ?? null); if (j.qr && j.confirmUrl) setHb({ link: j.confirmUrl, qr: j.qr }); }).catch(() => null); }, [id]);
  useEffect(() => { if (hb && desk) void QRCode.toString(hb.qr, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111a26", light: "#ffffff" } }).then(setQrSvg); }, [hb, desk]);
  // Банк бетінде растау (нақты провайдер): нәтиже вебхукпен серверге келеді — 2 секунд сайын сұраймыз
  useEffect(() => {
    if (!wait) return;
    let live = true;
    const tick = async () => { if (!live) return; const r = await paymentStatus(id); if (live && !done(r)) setTimeout(() => void tick(), 2000); };
    void tick();
    // Банк қосымшасынан оралған сәтте бірден тексереміз (2 секунд күтпей)
    const back = () => { if (document.visibilityState === "visible") void paymentStatus(id).then((r) => { if (live) done(r); }); };
    document.addEventListener("visibilitychange", back);
    return () => { live = false; document.removeEventListener("visibilitychange", back); };
  }, [wait, id, done]);
  const confirm = useCallback(async (approve: boolean) => {
    if (busy) return;
    if (approve && code.length < 6) { haptic.error(); return; }
    setBusy(true); haptic.medium();
    const r = await testConfirm(id, approve);
    setBusy(false);
    if (!done(r)) haptic.error();
  }, [busy, code, id, done]);
  // Банк бетінде күтіп тұрғанда «Бас тарту» — тек артқа: төлемді банк бетінде өзі жабады (төленбесе, пакет берілмейді)
  const cancel = useCallback(() => { if (wait) { haptic.soft(); if (window.history.length > 1) go(-1, "back"); else go("/packs", "fade", { replace: true }); } else void confirm(false); }, [confirm, wait, go]);
  useBackButton(cancel);
  // Телефонда QR төлемі: негізгі батырма — Homebank-ті қайта ашу (күй бәрібір 2 секунд сайын өзі тексеріледі)
  const main = useMemo<{ text: string; disabled?: boolean; onClick: () => void }>(() => (hb && !desk ? { text: "Homebank-ті қайта ашу", onClick: () => { haptic.medium(); openExternal(hb.link); } } : wait ? { text: "Тексеру", onClick: () => { void paymentStatus(id).then(done); } } : { text: busy ? "…" : "Растау", disabled: busy || code.length < 6, onClick: () => { void confirm(true); } }), [wait, busy, code, id, done, confirm, hb, desk]);
  const second = useMemo(() => ({ text: "Бас тарту", position: "left" as const, onClick: cancel }), [cancel]);
  useBottomButtons(main, second);
  const sum = amount !== null ? `${amount.toLocaleString("ru-RU").replace(/,/g, " ")} ₸` : "";
  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={cancel} />
      <div className={s.body} style={{ paddingTop: "calc(180px + var(--top-shift, 0px))" }}>
        {hb && desk && qrSvg
          ? <div aria-label="Төлем QR коды" style={{ width: 200, height: 200, padding: 8, borderRadius: 16, background: "#fff", boxShadow: "inset 0 0 0 1px var(--separator)" }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          : <Sticker name={wait ? "wait" : "lock"} size={120} className={s.sticker} />}
        <h1 className={s.title}>{hb ? "Homebank-те растаңыз" : wait ? "Банк растауын күтудеміз" : "Төлемді банкте растаңыз"}</h1>
        <p className={s.text}>{hb ? (desk ? "Телефоныңыздағы Homebank-пен QR кодты сканерлеп, төлемді растаңыз. Расталған сәтте пакет өзі қосылады." : "Homebank қосымшасында төлемді растаңыз. Расталған сәтте пакет өзі қосылады.")
          : wait ? "Банк бетінде төлемді растаңыз. Расталған сәтте пакет өзі қосылады." : "Банк картаңызға жіберген SMS кодын енгізіңіз (3-D Secure)."}</p>
        <div className={s.kvBox}>
          <p><span>Алушы</span><b>Medeo</b></p>
          {sum && <p><span>Сома</span><b>{sum}</b></p>}
          <p><span>{hb ? "Тәсіл" : "Карта"}</span><b>{label}</b></p>
        </div>
        {hb && <p className={`t-cap1 ${s.note}`} style={{ color: "var(--text-secondary)", marginTop: 8 }}>QR 20 минут жарамды. Уақыты өтсе, қайта төлеп көріңіз.</p>}
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
