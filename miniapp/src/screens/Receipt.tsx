// Figma: «Сатып алу тарихы / Чек» (13886:36837), «Чек: жүктеу диалогы» 13886:36991, «Чек: жүктелді» 13886:37123.
// Жүктеу: Telegram 8.0+ — нативті WebApp.downloadFile терезесі; браузерде — Figma-дағы диалог.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { purchaseOf } from "../mocks/history";
import { fmt, unitPrice } from "../mocks/offers";
import { useGo } from "../nav";
import { getOrder, getPack, offerOf, useOrders, usePacks } from "../store";
import { downloadFile, haptic, inTelegram, openExternal, saveFile, useBottomButtons } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { Group, SubPage } from "../ui/SubPage";
import { Sticker } from "../ui/Sticker";
import { CopyCode } from "../ui/CopyCode";
import s from "./Receipt.module.css";

/** Чекті жүктеу ағыны: диалог → жүктеу → «Чек жүктелді · Ашу» жолағы. Бэкенд жоқ кезде — үлгі PDF. */
function useReceiptDownload(txn: string): { start: () => void; node: ReactNode } {
  const [ask, setAsk] = useState(false);
  const [done, setDone] = useState(false);
  const name = `chek_${txn}.pdf`;
  const url = new URL(`receipts/${name}`, window.location.href.split("#")[0]).href;
  useEffect(() => { if (!done) return; const t = window.setTimeout(() => setDone(false), 3600); return () => clearTimeout(t); }, [done]);
  const start = useCallback(() => {
    haptic.tap();
    void downloadFile(url, name).then((r) => { if (r === null) setAsk(true); else if (r) { haptic.success(); setDone(true); } });
  }, [url, name]);
  const node = <>
    {ask && <Confirm title="Файлды жүктеу?" text={`${name} · PDF`} cancel="Бас тарту" ok="Жүктеу" onClose={() => setAsk(false)}
      onOk={() => { saveFile(url, name); haptic.success(); setDone(true); }} />}
    {done && <div className={`t-sub2 ${s.snack}`} role="status"><span>Чек жүктелді</span><button className="w-600" onClick={() => openExternal(url)}>Ашу</button></div>}
  </>;
  return { start, node };
}

export function Receipt() {
  const go = useGo();
  const p = purchaseOf(useParams().id);
  const dl = useReceiptDownload(p?.txn ?? "MD-8F3K29");
  const download = useMemo(() => ({ text: "Чекті жүктеу", onClick: dl.start }), [dl.start]);
  useBottomButtons(download, undefined, Boolean(p));
  if (!p) return <SubPage title="Чек"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Чек табылмады</p></SubPage>;
  const rows = [["Пакет", p.t], ["Мекеме", p.venue], ["Күні", p.date], ["Төлем тәсілі", p.method], ["Транзакция №", p.txn]];
  return (
    <SubPage title="Чек" top={92}>
      <div className={s.hero}>
        <Sticker name={p.plus ? "wait" : "party"} size={96} />
        <p className={s.amount}>{p.v}</p>
        <span className={`t-cap1 ${s.chip}`}>{p.plus ? "Қайтарылды" : "Төленді"}</span>
      </div>
      <Group i={1}>
        {rows.map(([k, v]) => <div key={k} className={`t-sub2 ${s.kv}`}><span>{k}</span><b>{v}</b></div>)}
      </Group>
      <Group i={2}>
        <button className={s.action} onClick={download.onClick}>Чекті жүктеу</button>
        <button className={s.action} onClick={() => go("/profile/report", "forward", { state: { purchase: p.id } })}>Мәселе туралы жазу</button>
      </Group>
      {!inTelegram && <div className={s.bar}><button className={s.btn} onClick={download.onClick}>Чекті жүктеу</button></div>}
      {dl.node}
    </SubPage>
  );
}

// Figma «10 · Сканер және QR-төлем»: «Қолдану чегі» 13907:8120 — кассада QR арқылы төленген бір бірліктің чегі.
export function UseReceipt() {
  const go = useGo();
  usePacks();
  const pack = getPack(useParams().id);
  const dl = useReceiptDownload("MD-8F3K29");
  const download = useMemo(() => ({ text: "Чекті жүктеу", onClick: dl.start }), [dl.start]);
  useBottomButtons(download, undefined, Boolean(pack));
  if (!pack) return <SubPage title="Төлем чегі"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Чек табылмады</p></SubPage>;
  const o = offerOf(pack);
  const last = pack.history.find((h) => h.title.includes("пайдаланылды"));
  const rows = [["Пакет", o.title], ["Мекеме", o.venue], ["Күні", last ? last.sub.split(" • ")[0] : "—"], ["Төлем тәсілі", "Medeo пакеті • Бірыңғай QR"], ["Банк референсі", "MD-8F3K29"]];
  return (
    <SubPage title="Төлем чегі" top={92}>
      <div className={s.hero}>
        <Sticker name="party" size={96} />
        <p className={s.amount}>−{fmt(unitPrice(o))}</p>
        <span className={`t-cap1 ${s.chip}`}>Төленді</span>
      </div>
      <Group i={1}>
        {rows.map(([k, v]) => <div key={k} className={`t-sub2 ${s.kv}`}><span>{k}</span><b>{v}</b></div>)}
      </Group>
      <Group i={2}>
        <button className={s.action} onClick={download.onClick}>Чекті жүктеу</button>
        <button className={s.action} onClick={() => go("/complaint/" + pack.id)}>Мәселе туралы жазу</button>
      </Group>
      {!inTelegram && <div className={s.bar}><button className={s.btn} onClick={download.onClick}>Чекті жүктеу</button></div>}
      {dl.node}
    </SubPage>
  );
}

// Figma «20 · Тапсырыс»: «Тапсырыс чегі» 13918:9311 — алдын ала тапсырыспен пайдаланылған бір бірліктің чегі.
export function OrderReceipt() {
  const go = useGo();
  useOrders();
  const o = getOrder(useParams().id);
  const dl = useReceiptDownload(o ? "MD-ORD" + o.no : "MD-ORD");
  const download = useMemo(() => ({ text: "Чекті жүктеу", onClick: dl.start }), [dl.start]);
  useBottomButtons(download, undefined, Boolean(o));
  if (!o) return <SubPage title="Тапсырыс чегі"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Чек табылмады</p></SubPage>;
  const rows = [["Пакет", o.title], ["Мекеме", o.venue], ["Күні", o.created], ["Код", o.code], ["Тапсырыс №", String(o.no)]];
  return (
    <SubPage title="Тапсырыс чегі" top={92}>
      <div className={s.hero}>
        <Sticker name="party" size={96} />
        <p className={s.amount}>1 бірлік</p>
        <span className={`t-cap1 ${s.chip} ${s.sent}`}>Жіберілді</span>
      </div>
      <Group i={1}>
        {rows.map(([k, v]) => <div key={k} className={`t-sub2 ${s.kv}`}><span>{k}</span>{k === "Код" ? <CopyCode code={v} className={`${s.copy} mono`}>{v} ⧉</CopyCode> : <b className={/№|референс/i.test(k) ? "mono" : undefined}>{v}</b>}</div>)}
      </Group>
      <Group i={2}>
        <button className={s.action} onClick={download.onClick}>Чекті жүктеу</button>
        <button className={s.action} onClick={() => go("/profile/report")}>Мәселе туралы жазу</button>
      </Group>
      {!inTelegram && <div className={s.bar}><button className={s.btn} onClick={download.onClick}>Чекті жүктеу</button></div>}
      {dl.node}
    </SubPage>
  );
}
