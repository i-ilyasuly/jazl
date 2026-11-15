// Figma: «Сатып алу тарихы / Чек» (13886:36837)
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { purchaseOf } from "../mocks/history";
import { fmt, unitPrice } from "../mocks/offers";
import { useGo } from "../nav";
import { getPack, offerOf, usePacks } from "../store";
import { inTelegram, useBottomButtons } from "../telegram";
import { Group, SubPage } from "../ui/SubPage";
import { Sticker } from "../ui/Sticker";
import s from "./Receipt.module.css";

export function Receipt() {
  const go = useGo();
  const p = purchaseOf(useParams().id);
  const download = useMemo(() => ({ text: "Чекті жүктеу", onClick: () => go("/profile/receipt-file") }), [go]);
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
    </SubPage>
  );
}

// Figma «10 · Сканер және QR-төлем»: «Қолдану чегі» 13907:8120 — кассада QR арқылы төленген бір бірліктің чегі.
export function UseReceipt() {
  const go = useGo();
  usePacks();
  const pack = getPack(useParams().id);
  const download = useMemo(() => ({ text: "Чекті жүктеу", onClick: () => go("/profile/receipt-file") }), [go]);
  useBottomButtons(download, undefined, Boolean(pack));
  if (!pack) return <SubPage title="Төлем чегі"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Чек табылмады</p></SubPage>;
  const o = offerOf(pack);
  const last = pack.history.find((h) => h.title.includes("пайдаланылды"));
  const rows = [["Пакет", o.title], ["Мекеме", o.venue], ["Күні", last ? last.sub.split(" • ")[0] : "—"], ["Төлем тәсілі", "Jazl пакеті • Бірыңғай QR"], ["Банк референсі", "JZ-8F3K29"]];
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
        <button className={s.action} onClick={() => go("/profile/report")}>Мәселе туралы жазу</button>
      </Group>
      {!inTelegram && <div className={s.bar}><button className={s.btn} onClick={download.onClick}>Чекті жүктеу</button></div>}
    </SubPage>
  );
}
