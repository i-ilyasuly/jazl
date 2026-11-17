// Figma «10 · Сканер және QR-төлем»: «Сканер» 13905:8414, «Төлем: бір пакет» 13906:7998, «Төлем: бірнеше пакет» 13906:8045,
// «Төлем өңделуде» 13906:8104, «PIN: төлемді растау» 13907:7998. Қате күйлері — ScanState.tsx.
// Демо: ?scan=multi (бірнеше пакет) немесе ?scan=<ScanState күйі> (fail, pending, limit, amount, notqr, ...).
// Telegram ішінде нативті QR сканері ашылады (showScanQrPopup, Bot API 6.4);
// браузерде Figma-дағы сканер экраны көрсетіліп, QR оқылғаны еліктеледі.
import { Emo } from "../ui/Emo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGo } from "../nav";
import { catalogState } from "../catalog";
import { fmt, unitPrice } from "../mocks/offers";
import { applyServerUse, getPack, hasPin, offerOf, pinFresh, redeem, redeemOnServer, resolveQr, unitLabel, usePacks, useSettings, type QrInfo } from "../store";
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
  // B3.1 (Патша, 2026-11-17): QR мекемені анықтайды. Таңдалған пакет басқа мекемеден болса — сол QR мекемесіндегі пакетке
  // ауысамыз (ескертумен), ол мекемеде пакет жоқ болса — «Бұл QR басқа мекеменікі» беті. Ешқашан бөтен пакеттен шегерілмейді.
  const qr = params.get("qr") ?? "";
  const qrLocal = useMemo(() => {
    const dyn = qr.match(/^JZQ2\.([0-9a-f-]{36})\.(\d{1,2})\./i);
    const branchId = dyn?.[1] ?? qr.match(/(?:JZB1:|br_)([0-9a-f-]{36})/i)?.[1];
    return { branchId, units: dyn ? Number(dyn[2]) : null, amount: Number(qr.match(/[?&]amount=(\d+)/)?.[1] ?? 0) || null };
  }, [qr]);
  const [qrInfo, setQrInfo] = useState<QrInfo | { error: string } | null>(null);
  useEffect(() => { if (qr) void resolveQr(qr).then(setQrInfo); }, [qr]);
  const info = qrInfo && "venue" in qrInfo ? qrInfo : null;
  const qrVenue = info?.venue.name ?? (qrLocal.branchId ? catalogState.branches.find((b) => b.branchId === qrLocal.branchId)?.venue : undefined);
  const wanted = getPack(params.get("pack") ?? undefined);
  const venuePacks = qrVenue ? packs.filter((p) => p.left > 0 && !p.expired && offerOf(p).venue === qrVenue) : [];
  const pack = qrVenue ? (wanted && offerOf(wanted).venue === qrVenue && wanted.left > 0 ? wanted : venuePacks[0]) : (wanted ?? packs.find((p) => p.left > 0 && !p.expired));
  const switched = Boolean(qrVenue && wanted && pack && wanted.id !== pack.id);
  const qrUnits = info?.units ?? qrLocal.units;
  const qrAmount = info?.amount ?? qrLocal.amount;
  // «Код енгізу» (Figma 23) дұрыс код берсе, камерасыз бірден төлем парағы ашылады
  // via=qr — QR нативті сканермен бұрын (Навигация не «Қолдану» парағынан) оқылды: бет бірден төлем парағымен ашылады
  const via = params.get("via");
  const [found, setFound] = useState(() => (via === "code" || via === "qr") && navigator.onLine && Boolean(pack));
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  // Нативті сканер QR оқымай жабылса — «Қайта сканерлеу / Код енгізу» таңдауы (Figma 23 «Код енгізу»)
  const [nativeClosed, setNativeClosed] = useState(false);
  const lock = useSettings().lock;
  const demo = params.get("scan") ?? "";
  const demoKind = (scanStates as readonly string[]).includes(demo) ? (demo as ScanKind) : null;
  const toState = useCallback((k: ScanKind, extra = "") => go(`/scan/state/${k}?${pack ? "pack=" + pack.id : ""}${extra}`, "up", { replace: true }), [go, pack]);
  // QR басқа мекеменікі және онда пакет жоқ; QR мерзімі өткен; Jazl QR емес — бірден тиісті бет
  useEffect(() => {
    if (via !== "qr" || !qr) return;
    if (qrInfo && "error" in qrInfo) { toState(qrInfo.error === "not_jazl_qr" ? "notqr" : qrInfo.error === "branch_not_found" ? "notpartner" : "fail"); return; }
    if (info?.expired) { toState("expired"); return; }
    if (qrVenue && venuePacks.length === 0) toState("othervenue", "&v=" + encodeURIComponent(qrVenue));
  }, [qrInfo, qrVenue, venuePacks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Дана саны: кассир енгізгені (динамикалық QR) — өзгермейді; банк сомасынан — клиент «+» басып теңестіреді
  const [units, setUnits] = useState(1);
  useEffect(() => { setUnits(qrUnits ?? 1); }, [qr, qrUnits]);

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
  // Банк терминалы: кассадағы сома → неше дана (1 бірлік бағасына бөлінсе)
  const chosenPrice = chosen?.price ?? amount;
  const needUnits = qrAmount && chosenPrice ? (qrAmount % chosenPrice === 0 ? qrAmount / chosenPrice : -1) : null;
  const unitsOk = needUnits === null ? true : needUnits === units;
  const maxUnits = Math.min(10, chosen?.left ?? pack?.left ?? 1);

  const close = useCallback(() => go(-1, "back"), [go]);
  useBackButton(close);

  const detect = useCallback(() => {
    if (found) return;
    haptic.heavy();
    // QR оқылған бойда белгілі болатын күйлер: желі жоқ, белсенді пакет жоқ, демо күйлері
    if (demoKind && scanEarly.includes(demoKind)) return toState(demoKind);
    if (!navigator.onLine) return toState("offline");
    if (!pack) return qrVenue ? toState("othervenue", "&v=" + encodeURIComponent(qrVenue)) : toState("nopack");
    setFound(true);
  }, [found, demoKind, pack, toState]);

  useEffect(() => {
    if (found || nativeClosed) return;
    if (via === "code" || via === "qr") { if (!navigator.onLine) { toState("offline"); return; } if (!pack) { if (qrVenue) toState("othervenue", "&v=" + encodeURIComponent(qrVenue)); else if (!qr) toState("nopack"); return; } }
    // Компьютердегі Telegram-да нативті сканер жоқ: «Сканерді телефонда аш»
    if (inTelegram && !(tg?.isVersionAtLeast?.("6.4") && tg.showScanQrPopup)) { toState("desktop"); return; }
    if (inTelegram && tg?.isVersionAtLeast?.("6.4") && tg.showScanQrPopup) {
      let got = false;
      tg.showScanQrPopup({ text: "Кассадағы терминал экранындағы QR-ды рамкаға келтір" }, () => { got = true; detect(); return true; });
      // Пайдаланушы нативті сканерді өзі жапса, алдыңғы бетке қайтамыз
      const onClosed = () => { if (!got) { haptic.soft(); setNativeClosed(true); } };
      const w = tg as unknown as { onEvent?: (e: string, cb: () => void) => void; offEvent?: (e: string, cb: () => void) => void };
      w.onEvent?.("scanQrPopupClosed", onClosed);
      return () => { w.offEvent?.("scanQrPopupClosed", onClosed); if (!got) tg?.closeScanQrPopup?.(); };
    }
    const t = setTimeout(detect, 2600); // браузерде: QR «оқылды» деп еліктеу
    return () => clearTimeout(t);
  }, [found, detect, close, toState, nativeClosed]);

  const pay = useMemo(() => ({
    text: !pack ? "Төлеу" : !unitsOk ? `Алдымен ${needUnits} дана таңдаңыз` : units > 1 ? `Төлеу · ${units} дана` : `Төлеу · ${unitLabel(pack)}`,
    disabled: !unitsOk,
    onClick: () => {
      if (!pack || busy) return;
      if (needUnits === -1) { haptic.error(); toState("amount"); return; }
      if (!unitsOk) { haptic.warning(); return; }
      haptic.medium();
      const packId = chosen && getPack(chosen.id) ? chosen.id : pack.id;
      // PIN қосулы болса, төлем PIN-мен расталады (Figma «PIN: төлемді растау»)
      // PIN енді сканерлеуден бұрын сұралады (scanFlow.startScan); мұнда — тек сол растау ескірсе (3 мин)
      if (lock && hasPin() && !pinFresh()) { go("/profile/pin/scan", "up", { state: { packId }, replace: true }); return; }
      setBusy(true);
      tg?.MainButton?.showProgress?.(false);
      const qr = params.get("qr") ?? "";
      let srvLeft: number | undefined;
      const finish = (err?: ScanKind) => {
        tg?.MainButton?.hideProgress?.();
        if (err) { setBusy(false); haptic.error(); toState(err); return; }
        if (srvLeft !== undefined) applyServerUse(packId, srvLeft, units); else redeem(packId, units);
        haptic.success(); go(`/paid/${packId}?u=${units}`, "up", { replace: true });
      };
      if (demoKind) { setTimeout(() => finish(demoKind), 1600); return; }
      // B3: пакет серверде болса — бірлік серверде шегеріледі (QR мекемені анықтайды); қате болса — тиісті күй беті
      void redeemOnServer(packId, qr, units).then((r) => {
        if (!r) { setTimeout(() => finish(), 1200); return; }
        if (r.ok) { srvLeft = r.left; finish(); return; }
        if (r.error === "units_mismatch" && r.expectedUnits) { tg?.MainButton?.hideProgress?.(); setBusy(false); haptic.warning(); setUnits(r.expectedUnits); return; }
        if (r.error === "other_venue") { tg?.MainButton?.hideProgress?.(); go(`/scan/state/othervenue?v=${encodeURIComponent(r.venue ?? "")}`, "up", { replace: true }); return; }
        const map: Record<string, ScanKind> = { not_jazl_qr: "notqr", bad_qr: "notqr", qr_expired: "expired", amount_mismatch: "amount", branch_not_found: "notpartner", no_units: "nopack", pack_expired: "nopack", pack_used: "nopack", network: "fail" };
        finish(map[r.error] ?? "fail");
      });
    },
  }), [pack, busy, go, chosen, lock, demoKind, toState, params, units, unitsOk, needUnits, qr]);
  // Figma 23 «Төлем парағы: кассада қосымша»: таңдалған ас пакет бағасынан қымбат — айырмасы кассада төленеді. Демо: ?scan=extra
  const extra = demo === "extra" ? 500 : 0;
  const cancel = useMemo(() => ({ text: "Бас тарту", position: "left" as const, onClick: () => { haptic.soft(); close(); } }), [close]);
  const payMain = useMemo(() => (extra ? { ...pay, text: "Растау" } : pay), [extra, pay]);
  useBottomButtons(payMain, extra ? cancel : undefined, found && Boolean(pack));
  const again = useMemo(() => ({ text: "Қайта сканерлеу", onClick: () => { haptic.medium(); setNativeClosed(false); } }), []);
  const byCode = useMemo(() => ({ text: "Код енгізу", position: "left" as const, onClick: () => { haptic.tap(); go("/scan/code", "forward", { replace: true }); } }), [go]);
  useBottomButtons(again, byCode, nativeClosed && !found);

  const o = pack ? offerOf(pack) : null;
  const native = inTelegram && Boolean(tg?.showScanQrPopup);
  return (
    <div className={`${s.page} ${found ? s.found : ""} ${native ? s.native : ""}`}>
      {/* Telegram-да камера көрінісін нативті сканердің өзі көрсетеді; мына жасанды нұсқа тек браузер үшін */}
      {native && nativeClosed && !found && (
        <div className={s.closedBox}>
          <h1 className={s.closedTitle}>QR оқылмады ма?</h1>
          <p className={`t-text ${s.closedText}`}>Қайта сканерле немесе кассир экранындағы 6 таңбалы кодты енгіз.</p>
        </div>
      )}
      {!native && <>
      <TelegramChrome mode="close" onBack={close} onDark />
      <h1 className={s.title}>Төлем QR-ын сканерле</h1>
      <p className={`t-sub2 ${s.hint}`}>Кассадағы терминал экранындағы QR-ды рамкаға келтір</p>
      <button className={s.frame} onClick={detect} aria-label="QR рамкасы"><img src={frame} width={260} height={260} alt="" /></button>
      {!found && <span className={s.line} />}
      <p className={`t-cap1 ${s.tip}`}>Төлеу үшін кассирге «Jazl бойынша» деп айт</p>
      <button className={`t-sub2 w-600 ${s.codeBtn}`} onClick={() => { haptic.tap(); go("/scan/code"); }}>Код енгізу</button>
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
            ) : extra ? <>
            <h2 className={s.sheetTitle}>Төлемді растаңыз</h2>
            <div className={s.kvList}>
              {([["Мекеме", o.venue], ["Пакеттен", `1 дана · ${unitLabel(pack)}`], ["Таңдалған ас", "Донер + Айран"], ["Қосымша", fmt(extra)]] as const).map(([k, v]) => <p key={k}><span className={s.muted}>{k}</span><b>{v}</b></p>)}
            </div>
            <p className={`t-sub2 w-600 ${s.extraChip}`}>Қосымша {fmt(extra)} кассада төленеді</p>
            <p className={`${s.quote} infoBox`}>Пакет баламасынан бір дана ғана шегеріледі. Қосымша сома пакеттен тыс, мекеменің кассасында төленеді.<i>”</i></p>
            </> : <>
            <h2 className={s.sheetTitle}>Төлем</h2>
            <div className={s.venue}>
              <span className={s.avatar} />
              <span className={s.venueText}><span className="t-headline">{o.venue}</span><span className={s.packSub}>{info?.branch.address ?? o.address ?? ""} • {qrUnits ? "Jazl QR" : qrAmount ? "Банк QR" : "QR"}</span></span>
              <span className={s.amount}>{unitLabel(pack)}</span>
            </div>
            {switched && <p className={`t-sub2 ${s.quote} infoBox infoWarn`}>Бұл QR — {qrVenue} мекемесінікі. Сол мекемедегі пакетің таңдалды.<i>”</i></p>}
            <p className={`t-sub2 w-600 ${s.link}`}>{multi ? "Қай пакеттен шегереміз?" : "Пакетті таңда"}</p>
            <div className={s.opts}>
              {opts.map((x) => (
                <button key={x.id} className={`${s.pack} ${chosen?.id === x.id ? s.packOn : ""}`} disabled={!x.ok} onClick={() => { if (chosen?.id !== x.id) { haptic.select(); setSel(x.id); } }}>
                  <span className={s.emoji}><Emo e={x.emoji} size={28} /></span>
                  <span className={s.packText}><span className={s.packTitle}>{x.title}</span><span className={s.packSub}>{x.sub}</span></span>
                  <span className={s.packPrice}>{fmt(x.price)}</span>
                  {chosen?.id === x.id && <span className={s.radio}><span /></span>}
                </button>
              ))}
            </div>
            {/* Дана саны: кассир енгізген (өзгермейді) не банк сомасы бойынша клиент таңдайды */}
            <div className={s.units}>
              <span className={s.unitsText}><b>Дана</b><small>{qrUnits ? "Кассир енгізді" : needUnits ? `Кассадағы сома: ${fmt(qrAmount ?? 0)}` : "Бір сканерлеуде"}</small></span>
              {qrUnits ? <b className={s.unitsFixed}>{units}</b> : (
                <span className={s.stepper}>
                  <button aria-label="Азайту" disabled={units <= 1} onClick={() => { haptic.select(); setUnits(units - 1); }}>−</button>
                  <b>{units}</b>
                  <button aria-label="Көбейту" disabled={units >= maxUnits} onClick={() => { haptic.select(); setUnits(units + 1); }}>+</button>
                </span>
              )}
            </div>
            {needUnits !== null && needUnits > 0 && !unitsOk && <p className={`t-sub2 ${s.quote} infoBox infoWarn`}>Кассадағы сома {fmt(qrAmount ?? 0)} = {needUnits} × {fmt(chosenPrice)}. «+» батырмасымен {needUnits} дана таңдап, сосын төле — әйтпесе төлем өтпейді.<i>”</i></p>}
            {needUnits === -1 && <p className={`t-sub2 ${s.quote} infoBox infoWarn`}>Кассадағы сома {fmt(qrAmount ?? 0)} пакеттің 1 бірлік бағасына ({fmt(chosenPrice)}) еселі емес. Кассирден соманы түзетуін сұра.<i>”</i></p>}
            <div className={s.rows}>
              <p><span className={s.muted}>Шегеріледі</span><b>{units} бірлік</b></p>
              <p><span className={s.muted}>Қалады</span><b>{Math.max(0, (chosen?.left ?? pack.left) - units)} / {chosen?.total ?? pack.total}</b></p>
            </div>
            </>}
            {!inTelegram && (
              <div className={`${s.bar} ${extra ? s.bar2 : ""}`}>
                {extra > 0 && !busy && <button className={`${s.btn} ${s.btn2}`} onClick={cancel.onClick}>Бас тарту</button>}
                <button className={`${s.btn} ${busy ? s.btnWait : ""}`} disabled={busy} onClick={pay.onClick}>{busy ? "Өңделуде…" : payMain.text}</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
