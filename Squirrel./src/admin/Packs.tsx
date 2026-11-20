// Figma «06 · Пакеттер және қолданулар» (14065:9746): Пакет іздеу (ID, чек, қолмен код, клиент), Пакет беті (уақыт сызығы),
// Мерзімді ұзарту, Қолдануды қайтару (екеуі де PIN-мен).
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { useCached } from "../venue/api";
import { Buttons, Note, OfferPic, Sheet, Sk, VPage, VSticker } from "../venue/ui";
import type { OfferKind } from "../mocks/offers";
import { A, dayMonth, money, post, when } from "./api";
import { Field, PinSheet, RadioRow } from "./ui";
import { useDesk } from "./Desk";
import v from "../venue/V.module.css";
import s from "./A.module.css";

interface PRow { id: string; ref: string; title: string; kind: OfferKind; left: number; total: number; validUntil: string; status: string; customer: string; venue: string; daysLeft: number }
type Tab = "active" | "expiring" | "grace" | "ended";

export function APacks() {
  const go = useGo();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) || "active");
  const [q, setQ] = useState(sp.get("q") ?? ""); const [qq, setQq] = useState(sp.get("q") ?? "");
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const desk = useDesk();
  const sel = useParams().id;
  const [d] = useCached<{ counts: { active: number; expiring: number; grace: number }; packs: PRow[] }>(`a:packs:${tab}:${qq}`, () => A(`/packs?tab=${tab}&q=${encodeURIComponent(qq)}`));
  return (
    <VPage title="Пакеттер" back>
      <label className={s.search}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пакет ID, чек, қолмен код, клиент" /></label>
      {!qq && <div className={s.chipsWrap}>{([["active", "Белсенді"], ["expiring", "Мерзімі жақын"], ["grace", "Күтуде"], ["ended", "Аяқталған"]] as const).map(([k, t]) => (
        <button key={k} className={`${v.chip} ${tab === k ? v.chipOn : ""}`} onClick={() => { haptic.select(); setTab(k); }}>{t}{d && k !== "ended" ? ` ${d.counts[k]}` : ""}</button>
      ))}</div>}
      <h2 className={v.sectionTitle}>{qq ? "Іздеу нәтижесі" : "Соңғы пакеттер"}</h2>
      {!d ? <Sk h={200} /> : d.packs.length === 0 ? (
        <div className={v.result}><VSticker name="search" size={100} /><h2 className={v.stateTitle}>Ештеңе табылмады</h2><p className={v.stateText}>Чек нөмірін (MD-…), клиент атын не тапсырыс кодын тексеріңіз.</p></div>
      ) : desk ? (
        // Figma «Пакеттер / Desktop»: кесте (Пакет · Ұсыныс · Клиент · Қалдық · Мерзімі)
        <table className={s.table}>
          <thead><tr><th>Пакет</th><th>Ұсыныс</th><th>Клиент</th><th>Қалдық</th><th className={s.num}>Мерзімі</th></tr></thead>
          <tbody>{d.packs.map((p) => (
            <tr key={p.id} className={sel === p.id ? s.sel : ""} onClick={() => go(`/a/packs/${p.id}`)}>
              <td>{p.ref}</td><td><b>{`${p.title} · ${p.total} дана`}</b><small>{p.venue}</small></td><td>{p.customer}</td><td><b>{p.left} / {p.total}</b></td>
              <td className={s.num}>{p.left === 0 ? <span className={`${v.tag} ${v.tagGray}`}>Жабылды</span> : p.daysLeft < 0 ? <span className={`${v.tag} ${v.tagYellow}`}>Күтуде</span> : <span style={{ color: p.daysLeft <= 3 ? "#b07a00" : undefined }}>{`${p.daysLeft} күн`}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className={v.card}>{d.packs.map((p) => (
        <button key={p.id} className={v.row} style={{ minHeight: 64 }} onClick={() => go(`/a/packs/${p.id}`)}>
          <span className={v.ic} style={p.left === 0 || p.daysLeft < 0 ? { opacity: 0.5 } : undefined}><OfferPic kind={p.kind} size={26} /></span>
          <span className={v.rowText}><span className={v.rowTitle}>{`${p.title} · ${p.total} дана`}</span><span className={v.rowSub}>{p.ref} · {p.customer} · {p.venue}</span></span>
          <span className={s.right}><b>{p.left} / {p.total}</b><span>{p.daysLeft < 0 ? "күтуде" : `${p.daysLeft} күн`}</span></span>
        </button>
      ))}</div>}
    </VPage>
  );
}

interface TL { type: string; at: string; units: number; redemptionId: string | null; cancelled: boolean; address: string | null; cashier: string | null; venueAmount: number | null; fee: number | null; days: number | null }
interface PFull { id: string; ref: string; title: string; unitName: string; left: number; total: number; validUntil: string; status: string; customer: string; venue: string; unitPrice: number; pricePaid: number; createdAt: string; method: string | null; timeline: TL[] }
const methodName: Record<string, string> = { kaspi: "Kaspi Pay", card: "Банк картасы", test: "Сынақ төлемі" };
export function APack() {
  const { id = "" } = useParams();
  const [d, , reload] = useCached<{ pack: PFull }>(`a:pack:${id}`, () => A(`/packs/${id}`));
  const [sheet, setSheet] = useState<"extend" | "refund" | "bonus" | null>(null);
  const p = d?.pack;
  if (!p) return <VPage title="Пакет" back><Sk h={200} /><Sk h={160} /></VPage>;
  const kv = (k: string, val: React.ReactNode) => <div className={v.kv}><span>{k}</span><b>{val}</b></div>;
  const ev = (e: TL) => {
    switch (e.type) {
      case "use": return { t: `${e.units} бірлік қолданылды${e.cancelled ? " (қайтарылды)" : ""}`, sub: [when(e.at), e.address, e.cashier ? `кассир ${e.cashier}` : null, e.venueAmount !== null ? `мекеме ${money(e.venueAmount)}, комиссия ${money(e.fee ?? 0)}` : null].filter(Boolean).join(" · "), dot: e.cancelled ? "#b0b5ba" : "#229af0" };
      case "use_cancelled": return { t: `${e.units} бірлік қайтарылды`, sub: when(e.at), dot: "#ff9500" };
      case "complaint_refund": return { t: `Шағым бойынша ${e.units} бірлік оралды`, sub: when(e.at), dot: "#ff9500" };
      case "extend": return { t: `Мерзім ұзартылды${e.days ? ` +${e.days} күн` : ""}`, sub: when(e.at), dot: "#8e7cf3" };
      case "order": case "plan": return { t: e.type === "plan" ? "Жазылу / жоспар" : "Тапсырыс берілді", sub: when(e.at), dot: "#2aabee" };
      case "purchase": case "buy": return { t: "Пакет сатып алынды", sub: `${when(e.at)} · ${methodName[p.method ?? ""] ?? "төлем"} · ${money(p.pricePaid)}`, dot: "#31d158" };
      default: return { t: e.type, sub: when(e.at), dot: "#b0b5ba" };
    }
  };
  const hasBuy = p.timeline.some((e) => e.type === "purchase" || e.type === "buy");
  return (
    <VPage title={p.ref} back>
      <div className={v.card} style={{ padding: "4px 16px" }}>
        {kv("Ұсыныс", `${p.title} · ${p.total} ${p.unitName}`)}{kv("Клиент", p.customer)}{kv("Мекеме", p.venue)}
        {kv("Қалдық", <span className={p.left ? s.green : ""}>{p.left} / {p.total}</span>)}{kv("Мерзімі", `${dayMonth(p.validUntil)}-ге дейін`)}
      </div>
      <h2 className={v.blueHead}>Уақыт сызығы</h2>
      <div className={v.card} style={{ padding: 16 }}>
        {p.timeline.map((e, i) => { const x = ev(e); return <div key={i} className={s.tl} style={{ ["--dot" as string]: x.dot }}><div className={s.tlTitle}>{x.t}</div><div className={s.tlSub}>{x.sub}</div></div>; })}
        {!hasBuy && <div className={s.tl} style={{ ["--dot" as string]: "#31d158" }}><div className={s.tlTitle}>Пакет сатып алынды</div><div className={s.tlSub}>{when(p.createdAt)} · {methodName[p.method ?? ""] ?? "төлем"} · {money(p.pricePaid)}</div></div>}
      </div>
      <Buttons main={{ text: "Қолдануды қайтару", onClick: () => setSheet("refund") }} second={{ text: "Мерзімін ұзарту", onClick: () => setSheet("extend") }} />
      {sheet === "extend" && <ExtendSheet p={p} onClose={() => setSheet(null)} done={() => void reload()} />}
      <button className={v.link} style={{ alignSelf: "center", padding: 8 }} onClick={() => { haptic.tap(); setSheet("bonus"); }}>Клиентке бонус беру</button>
      {sheet === "refund" && <RefundSheet p={p} onClose={() => setSheet(null)} done={() => void reload()} />}
      {sheet === "bonus" && <BonusSheet p={p} onClose={() => setSheet(null)} />}
    </VPage>
  );
}

function ExtendSheet({ p, onClose, done }: { p: PFull; onClose: () => void; done: () => void }) {
  const [days, setDays] = useState<3 | 7 | 14 | 30>(7);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState(false);
  if (pin) return <PinSheet text={`${p.ref} мерзімін ${days} күнге ұзарту.`} onClose={onClose} run={async (x) => { await post(`/packs/${p.id}/extend`, { days, reason: reason.trim(), pin: x }); done(); }} />;
  return (
    <Sheet title="Мерзімді ұзарту" onClose={onClose}>
      <div className={v.card}>{([3, 7, 14, 30] as const).map((n) => <RadioRow key={n} on={days === n} title={`+${n} күн`} onClick={() => setDays(n)} />)}</div>
      <Field label="Себебі (журналға жазылады)" value={reason} onChange={setReason} placeholder="Мекеме жөндеуде болды" />
      <Buttons main={{ text: "Ұзарту", onClick: () => setPin(true) }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
/** Бонус беру (өтемақы не сынақ): клиенттің Medeo бонусына сома қосылады, кез келген сатып алуда жұмсалады */
function BonusSheet({ p, onClose }: { p: PFull; onClose: () => void }) {
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState(false);
  if (pin) return <PinSheet text={`${p.customer}: ${money(amount)} Medeo бонусы.`} onClose={onClose} run={async (x) => { await post(`/packs/${p.id}/bonus`, { amount, reason: reason.trim(), pin: x }); haptic.success(); onClose(); }} />;
  return (
    <Sheet title="Бонус беру" onClose={onClose}>
      <p className={s.pinText} style={{ textAlign: "left" }}>{`${p.customer} келесі сатып алуда бағадан шегереді. Мерзімі — Басқару баптауындағыдай.`}</p>
      <div className={v.card}>{[500, 1000, 2000, 5000].map((n) => <RadioRow key={n} on={amount === n} title={money(n)} onClick={() => setAmount(n)} />)}</div>
      <Field label="Себебі (журналға жазылады)" value={reason} onChange={setReason} placeholder="Мекеме тапсырысты кешіктірді" />
      <Buttons main={{ text: "Беру", onClick: () => { if (reason.trim().length < 3) { haptic.error(); return; } setPin(true); } }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
function RefundSheet({ p, onClose, done }: { p: PFull; onClose: () => void; done: () => void }) {
  const uses = p.timeline.filter((e) => e.type === "use" && !e.cancelled && e.redemptionId);
  const [rid, setRid] = useState(uses[0]?.redemptionId ?? "");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState(false);
  if (!uses.length) return <Sheet title="Қолдануды қайтару" onClose={onClose}><Note>Бұл пакетте қайтаратын қолдану жоқ.</Note><Buttons main={{ text: "Жабу", onClick: onClose }} /></Sheet>;
  if (pin) return <PinSheet text={`${p.ref}: қолдануды қайтару, бірлік пакетке оралады.`} onClose={onClose} run={async (x) => { await post(`/packs/${p.id}/refund-use`, { redemptionId: rid, reason: reason.trim(), pin: x }); done(); }} />;
  return (
    <Sheet title="Қолдануды қайтару" onClose={onClose}>
      <p className={s.pinText} style={{ textAlign: "left" }}>Бірлік клиенттің пакетіне оралады. Ақшалай қайтару өшірулі.</p>
      <div className={v.card}>{uses.slice(0, 5).map((e) => <RadioRow key={e.redemptionId} on={rid === e.redemptionId} title={`${e.units} бірлік · ${when(e.at)}`} sub={[e.address, e.cashier].filter(Boolean).join(" · ")} onClick={() => setRid(e.redemptionId!)} />)}</div>
      <Field label="Себебі (журналға жазылады)" value={reason} onChange={setReason} placeholder="Кассир қате сканерледі" />
      <Buttons main={{ text: "Қайтару", onClick: () => { if (reason.trim().length < 3) { haptic.error(); return; } setPin(true); } }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
