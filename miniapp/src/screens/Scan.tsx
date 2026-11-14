// Figma: «Сканер / Light» (13905:8414) және «Төлем: бір пакет» (13906:7998).
// Telegram ішінде нативті QR сканері ашылады (showScanQrPopup, Bot API 6.4);
// браузерде Figma-дағы сканер экраны көрсетіліп, QR оқылғаны еліктеледі.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGo } from "../nav";
import { getPack, offerOf, redeem, unitLabel, usePacks } from "../store";
import { haptic, inTelegram, tg, useBackButton, useBottomButtons } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import frame from "../assets/icons/scanFrame.svg";
import flash from "../assets/icons/flash.svg";
import gallery from "../assets/icons/gallery.svg";
import s from "./Scan.module.css";

export function Scan() {
  const [params] = useSearchParams();
  const packs = usePacks();
  const go = useGo();
  const pack = getPack(params.get("pack") ?? undefined) ?? packs.find((p) => p.left > 0);
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);

  const close = useCallback(() => go(-1, "back"), [go]);
  useBackButton(close);

  const detect = useCallback(() => { if (!found) { haptic.success(); setFound(true); } }, [found]);

  useEffect(() => {
    if (found) return;
    if (inTelegram && tg?.isVersionAtLeast?.("6.4") && tg.showScanQrPopup) {
      let got = false;
      tg.showScanQrPopup({ text: "Кассадағы терминал экранындағы QR-ды рамкаға келтір" }, () => { got = true; detect(); return true; });
      // Пайдаланушы нативті сканерді өзі жапса, алдыңғы бетке қайтамыз
      const onClosed = () => { if (!got) close(); };
      const w = tg as unknown as { onEvent?: (e: string, cb: () => void) => void; offEvent?: (e: string, cb: () => void) => void };
      w.onEvent?.("scanQrPopupClosed", onClosed);
      return () => { w.offEvent?.("scanQrPopupClosed", onClosed); if (!got) tg?.closeScanQrPopup?.(); };
    }
    const t = setTimeout(detect, 2600); // браузерде: QR «оқылды» деп еліктеу
    return () => clearTimeout(t);
  }, [found, detect, close]);

  const pay = useMemo(() => ({
    text: pack ? `💳 Төлеу · ${unitLabel(pack)}` : "Төлеу",
    onClick: () => {
      if (!pack || busy) return;
      haptic.tap();
      setBusy(true);
      tg?.MainButton?.showProgress?.(false);
      setTimeout(() => { tg?.MainButton?.hideProgress?.(); redeem(pack.id); haptic.success(); go("/paid/" + pack.id, "up", { replace: true }); }, 1100);
    },
  }), [pack, busy, go]);
  useBottomButtons(pay, undefined, found && Boolean(pack));

  const o = pack ? offerOf(pack) : null;
  const native = inTelegram && Boolean(tg?.showScanQrPopup);
  return (
    <div className={`${s.page} ${found ? s.found : ""} ${native ? s.native : ""}`}>
      {/* Telegram-да камера көрінісін нативті сканердің өзі көрсетеді; мына жасанды нұсқа тек браузер үшін */}
      {!native && <>
      <TelegramChrome mode="close" onBack={close} onDark />
      <h1 className={s.title}>Төлем QR-ын сканерле</h1>
      <p className={`t-sub2 ${s.hint}`}>Кассадағы терминал экранындағы QR-ды рамкаға келтір</p>
      <button className={s.frame} onClick={detect} aria-label="QR рамкасы"><img src={frame} width={260} height={260} alt="" /></button>
      {!found && <span className={s.line} />}
      <p className={`t-cap1 ${s.tip}`}>Төлеу үшін кассирге «Jazl бойынша» деп айт</p>
      <button className={`${s.round} ${s.flash} ${torch ? s.on : ""}`} onClick={() => { haptic.tap(); setTorch(!torch); }} aria-label="Фонарь"><img src={flash} width={24} height={24} alt="" /></button>
      <button className={`${s.round} ${s.gallery}`} onClick={() => haptic.tap()} aria-label="Галерея"><img src={gallery} width={28} height={28} alt="" /></button>

      </>}
      {found && pack && o && (
        <>
          <div className={s.scrim} />
          <div className={s.sheet} role="dialog" aria-label="Төлем">
            <span className={s.grabber} />
            <h2 className="t-title3">Төлем</h2>
            <div className={s.venue}>
              <span className={s.avatar} />
              <span className={s.venueText}><span className="t-headline">{o.venue}</span><span className={`t-cap1 ${s.muted}`}>Нұркен Әбдіров, 24 • Бірыңғай QR</span></span>
              <span className={s.amount}>{unitLabel(pack)}</span>
            </div>
            <p className={`t-sub2 w-600 ${s.link}`}>Пакетті таңда</p>
            <div className={s.pack}>
              <span className={s.emoji}>{o.kind === "hair" ? "✂️" : "🍔"}</span>
              <span className={s.packText}><span className={s.packTitle}>{o.title}</span><span className={`t-cap1 ${s.muted}`}>Қалды: {pack.left} • {pack.daysLeft} күн қалды</span></span>
              <span className="t-sub2 w-600">{unitLabel(pack)}</span>
              <span className={s.radio}><span /></span>
            </div>
            <div className={s.rows}>
              <p className="t-sub2"><span className={s.muted}>Шегеріледі</span><span className="w-600">1 бірлік</span></p>
              <p className="t-sub2"><span className={s.muted}>Қалады</span><span className="w-600">{pack.left - 1} / {pack.total}</span></p>
            </div>
            {!inTelegram && (
              <div className={s.bar}><button className={s.btn} disabled={busy} onClick={pay.onClick}>{busy ? <span className={s.spinner} /> : pay.text}</button></div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
