// Figma «10 · Сканер және QR-төлем»: «Сканер» 13905:8414, «Төлем: бір пакет» 13906:7998, «Төлем: бірнеше пакет» 13906:8045,
// «Төлем өңделуде» 13906:8104, «PIN: төлемді растау» 13907:7998. Қате күйлері — ScanState.tsx.
// Демо: ?scan=multi (бірнеше пакет) немесе ?scan=<ScanState күйі> (fail, pending, limit, amount, notqr, ...).
// Telegram ішінде нативті QR сканері ашылады (showScanQrPopup, Bot API 6.4);
// браузерде Figma-дағы сканер экраны көрсетіліп, QR оқылғаны еліктеледі.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGo } from "../nav";
import { fmt, unitPrice } from "../mocks/offers";
import { getPack, hasPin, offerOf, redeem, unitLabel, usePacks, useSettings } from "../store";
import { scanEarly, scanStates, type ScanKind } from "./ScanState";
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
  const pack = getPack(params.get("pack") ?? undefined) ?? packs.find((p) => p.left > 0 && !p.expired);
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const lock = useSettings().lock;
  const demo = params.get("scan") ?? "";
  const demoKind = (scanStates as readonly string[]).includes(demo) ? (demo as ScanKind) : null;
  const toState = useCallback((k: ScanKind) => go(`/scan/state/${k}${pack ? "?pack=" + pack.id : ""}`, "up", { replace: true }), [go, pack]);

  // Сол мекемедегі белсенді пакеттер: QR сомасына бағасы сәйкес келетіндерін ғана таңдауға болады
  const amount = pack ? unitPrice(offerOf(pack)) : 0;
  const opts = useMemo(() => {
    if (!pack) return [];
    const venue = offerOf(pack).venue;
    const emoji = { food: "🍔", coffee: "☕", hair: "✂️" };
    const list = packs.filter((p) => p.left > 0 && !p.expired && offerOf(p).venue === venue)
      .sort((a, b) => (a.id === pack.id ? -1 : b.id === pack.id ? 1 : 0))
      .map((p) => { const po = offerOf(p); const price = unitPrice(po); const ok = price === amount;
        return { id: p.id, emoji: emoji[po.kind], title: po.title, sub: `Қалды: ${p.left} • ${ok ? p.daysLeft + " күн қалды" : "сома сәйкес емес"}`, price, ok, left: p.left, total: p.total }; });
    if (demo === "multi" && list.length < 2) list.push(
      { id: "demo-1", emoji: "🌯", title: "Донер комбо · 8 дана", sub: "Қалды: 5 • 24 күн қалды", price: amount, ok: true, left: 5, total: 8 },
      { id: "demo-2", emoji: "🥙", title: "Қой етінен донер · 4 дана", sub: "Қалды: 4 • сома сәйкес емес", price: amount + 300, ok: false, left: 4, total: 4 });
    return list;
  }, [pack, packs, amount, demo]);
  const [sel, setSel] = useState("");
  const chosen = opts.find((x) => x.id === sel && x.ok) ?? opts[0];
  const multi = opts.length > 1;

  const close = useCallback(() => go(-1, "back"), [go]);
  useBackButton(close);

  const detect = useCallback(() => {
    if (found) return;
    haptic.heavy();
    // QR оқылған бойда белгілі болатын күйлер: желі жоқ, белсенді пакет жоқ, демо күйлері
    if (demoKind && scanEarly.includes(demoKind)) return toState(demoKind);
    if (!navigator.onLine) return toState("offline");
    if (!pack) return toState("nopack");
    setFound(true);
  }, [found, demoKind, pack, toState]);

  useEffect(() => {
    if (found) return;
    // Компьютердегі Telegram-да нативті сканер жоқ: «Сканерді телефонда аш»
    if (inTelegram && !(tg?.isVersionAtLeast?.("6.4") && tg.showScanQrPopup)) { toState("desktop"); return; }
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
  }, [found, detect, close, toState]);

  const pay = useMemo(() => ({
    text: pack ? `💳 Төлеу · ${unitLabel(pack)}` : "Төлеу",
    onClick: () => {
      if (!pack || busy) return;
      haptic.medium();
      const packId = chosen && getPack(chosen.id) ? chosen.id : pack.id;
      // PIN қосулы болса, төлем PIN-мен расталады (Figma «PIN: төлемді растау»)
      if (lock && hasPin()) { go("/profile/pin/pay", "up", { state: { packId, sum: `${unitLabel(pack)} • ${offerOf(pack).venue}` } }); return; }
      setBusy(true);
      tg?.MainButton?.showProgress?.(false);
      setTimeout(() => {
        tg?.MainButton?.hideProgress?.();
        if (demoKind) { haptic.error(); toState(demoKind); return; }
        redeem(packId); haptic.success(); go("/paid/" + packId, "up", { replace: true });
      }, 1600);
    },
  }), [pack, busy, go, chosen, lock, demoKind, toState]);
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
            {busy ? (
              <div className={s.wait}>
                <h2>Төлем өңделуде</h2>
                <p>Банк растауын күтеміз. Қолданбаны жаппа және қайта төлеме.</p>
                <b>{fmt(amount)} • {o.venue}</b>
              </div>
            ) : <>
            <h2 className={s.sheetTitle}>Төлем</h2>
            <div className={s.venue}>
              <span className={s.avatar} />
              <span className={s.venueText}><span className="t-headline">{o.venue}</span><span className={s.packSub}>Нұркен Әбдіров, 24 • Бірыңғай QR</span></span>
              <span className={s.amount}>{unitLabel(pack)}</span>
            </div>
            <p className={`t-sub2 w-600 ${s.link}`}>{multi ? "Қай пакеттен шегереміз?" : "Пакетті таңда"}</p>
            <div className={s.opts}>
              {opts.map((x) => (
                <button key={x.id} className={`${s.pack} ${chosen?.id === x.id ? s.packOn : ""}`} disabled={!x.ok} onClick={() => { if (chosen?.id !== x.id) { haptic.select(); setSel(x.id); } }}>
                  <span className={s.emoji}>{x.emoji}</span>
                  <span className={s.packText}><span className={s.packTitle}>{x.title}</span><span className={s.packSub}>{x.sub}</span></span>
                  <span className={s.packPrice}>{fmt(x.price)}</span>
                  {chosen?.id === x.id && <span className={s.radio}><span /></span>}
                </button>
              ))}
            </div>
            {multi
              ? <p className={s.quote}>Таңдаған пакетіңнен 1 бірлік шегеріледі. Бағасы бірдей пакеттердің кез келгенін таңдауға болады.<i>”</i></p>
              : <div className={s.rows}>
                  <p><span className={s.muted}>Шегеріледі</span><b>1 бірлік</b></p>
                  <p><span className={s.muted}>Қалады</span><b>{pack.left - 1} / {pack.total}</b></p>
                </div>}
            </>}
            {!inTelegram && (
              <div className={s.bar}><button className={`${s.btn} ${busy ? s.btnWait : ""}`} disabled={busy} onClick={pay.onClick}>{busy ? "Өңделуде…" : pay.text}</button></div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
