// Figma: «Сатып алу тарихы / Чек» (13886:36837)
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { purchaseOf } from "../mocks/history";
import { useGo } from "../nav";
import { inTelegram, useBottomButtons } from "../telegram";
import { Group, SubPage } from "../ui/SubPage";
import ok from "../assets/icons/receiptOk.svg";
import s from "./Receipt.module.css";

export function Receipt() {
  const go = useGo();
  const p = purchaseOf(useParams().id);
  const download = useMemo(() => ({ text: "Чекті жүктеу", onClick: () => go("/profile/receipt-file") }), [go]);
  useBottomButtons(download, undefined, Boolean(p));
  if (!p) return <SubPage title="Чек"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Чек табылмады</p></SubPage>;
  const rows = [["Пакет", p.t], ["Мекеме", p.venue], ["Күні", p.date], ["Төлем тәсілі", p.method], ["Транзакция №", p.txn]];
  return (
    <SubPage title="Чек" top={100}>
      <div className={s.hero}>
        <img src={ok} width={56} height={56} className={s.ok} alt="" />
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
