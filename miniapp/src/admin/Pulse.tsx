// Figma «02 · Пульс» (14061:10063): Пульс (кезең, 4 көрсеткіш, назар керек, апталық сатылым, тірі лента), Назар керек.
import { useEffect, useState } from "react";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { Tile } from "../ui/Tile";
import { useCached } from "../venue/api";
import { Person, Sk, VPage, VSticker } from "../venue/ui";
import { A, ago, hm, money } from "./api";
import { Badge, Growth, setComplaintDot } from "./ui";
import v from "../venue/V.module.css";
import s from "./A.module.css";

export interface Attention { apps: number; oldest: string | null; offers_new: number; offers_changed: number; complaints: number; due_today: number; failed: number; grace: number }
interface Pulse { sales: number; salesGrowth: number | null; fee: number; feeGrowth: number | null; packs: number; packsDelta: number; units: number; unitsGrowth: number | null; clients: number; clientsDelta: number;
  venuesActive: number; venuesTotal: number; venuesPaused: number; week: { d: string; sales: number }[]; weekTotal: number; feed: { kind: string; at: string; who: string; title: string; venue: string; amount: number; units: number }[] }
const PERIODS = [["today", "Бүгін"], ["7", "7 күн"], ["30", "30 күн"], ["all", "Барлығы"]] as const;
const DOW = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"];
const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];

/** «Назар керек» жолдары — Пульс пен жеке бетке ортақ */
export function attentionRows(a: Attention) {
  return {
    urgent: [
      { e: "a:complaints", t: "Ашық шағымдар", sub: a.due_today ? `${a.due_today} шағымның мерзімі бүгін бітеді` : "Мерзімі әлі бар", n: a.complaints, tone: "red" as const, to: "/a/complaints" },
      { e: "a:payfail", t: "Сәтсіз төлемдер", sub: "Соңғы 24 сағатта", n: a.failed, tone: "orange" as const, to: "/a/money" },
    ],
    waiting: [
      { e: "a:apps", t: "Мекеме өтінімдері", sub: a.oldest ? `Ең ескісі ${ago(a.oldest)} бұрын түсті` : "Жаңа өтінім жоқ", n: a.apps, to: "/a/apps" },
      { e: "a:offers", t: "Модерациядағы ұсыныстар", sub: `${a.offers_new} жаңа, ${a.offers_changed} өзгертілген`, n: a.offers_new + a.offers_changed, to: "/a/offers" },
    ],
    soon: [{ e: "a:grace", t: "Күту кезеңі бітетін пакеттер", sub: `Ертең ${a.grace} пакеттің ақшасы мекемеге өтеді`, n: 0, to: "/a/packs?tab=grace" }],
  };
}
function Row({ r }: { r: { e: string; t: string; sub: string; n: number; tone?: "red" | "orange"; to: string } }) {
  const go = useGo();
  return (
    <button className={v.row} style={{ minHeight: 62 }} onClick={() => { haptic.tap(); go(r.to); }}>
      <Tile e={r.e} size={36} />
      <span className={v.rowText}><span className={v.rowTitle}>{r.t}</span><span className={v.rowSub}>{r.sub}</span></span>
      <Badge n={r.n} tone={r.tone} /><i className={v.arrow} />
    </button>
  );
}

export function APulse() {
  const go = useGo();
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("today");
  const [d] = useCached<{ pulse: Pulse; attention: Attention }>(`a:pulse:${period}`, () => A(`/pulse?period=${period}`));
  useEffect(() => { if (d) setComplaintDot(d.attention.complaints > 0); }, [d]);
  const p = d?.pulse; const a = d?.attention;
  const now = new Date(); const sub = `Бүгін, ${now.getDate()} ${MON[now.getMonth()]} · Қарағанды`;
  const att = a ? attentionRows(a) : null;
  const rows = att ? [att.waiting[0], att.waiting[1], att.urgent[0], att.urgent[1]] : []; // Figma: өтінім, модерация, шағым, сәтсіз төлем
  const max = Math.max(1, ...(p?.week.map((w) => w.sales) ?? [1]));
  const kindLabel: Record<string, string> = { buy: "Сатып алды", use: "Қолданды", order: "Тапсырыс берді", plan: "Жазылды", gift: "Сыйлады", complaint: "Шағым жазды" };
  return (
    <VPage nav>
      <h1 className={v.h1}>Пульс</h1>
      <p className={s.sub}>{sub}</p>
      <div className={v.seg}>{PERIODS.map(([k, t]) => <button key={k} className={`${v.segBtn} ${period === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setPeriod(k); }}>{t}</button>)}</div>
      <div className={v.stats}>
        <div className={`${v.stat} ${s.statBlue}`}><span className={v.statLabel}>Сатылым</span><span className={v.statNum}>{p ? money(p.sales) : "–"}</span>{p && <Growth v={p.salesGrowth} white={period === "today"} />}</div>
        <div className={v.stat}><span className={v.statLabel}>Платформа комиссиясы</span><span className={v.statNum}>{p ? money(p.fee) : "–"}</span>{p && <Growth v={p.feeGrowth} />}</div>
      </div>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Сатылған пакет</span><span className={v.statNum}>{p ? p.packs : "–"}</span>{p && <span className={p.packsDelta >= 0 ? s.pillUp : s.pillDown}>{p.packsDelta >= 0 ? "▲" : "▼"} {Math.abs(p.packsDelta)}</span>}</div>
        <div className={v.stat}><span className={v.statLabel}>Қолданылған бірлік</span><span className={v.statNum}>{p ? p.units : "–"}</span>{p && <Growth v={p.unitsGrowth} />}</div>
      </div>
      <div className={v.sectionHead}><h2 className={v.sectionTitle}>Назар керек</h2><button className={v.link} onClick={() => go("/a/attention")}>Барлығы</button></div>
      <div className={v.card}>{att ? rows.map((r) => <Row key={r.t} r={r} />) : <div className={v.row}><Sk h={40} /></div>}</div>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Жаңа клиент</span><span className={v.statNum}>{p ? p.clients : "–"}</span>{p && <span className={p.clientsDelta >= 0 ? s.pillUp : s.pillDown}>{p.clientsDelta >= 0 ? "▲" : "▼"} {Math.abs(p.clientsDelta)}</span>}</div>
        <div className={v.stat}><span className={v.statLabel}>Белсенді мекеме</span><span className={v.statNum}>{p ? `${p.venuesActive} / ${p.venuesTotal}` : "–"}</span>{p && p.venuesPaused > 0 && <span className={`${v.tag} ${v.tagYellow}`} style={{ alignSelf: "flex-start" }}>{p.venuesPaused} тоқтатылған</span>}</div>
      </div>
      <div className={v.chart}>
        <div className={v.chartHead}><b className={v.lead}>Апталық сатылым</b><span className={v.chartSum}>{p ? money(p.weekTotal) : "–"}</span></div>
        <div className={v.bars}>{(p?.week ?? Array.from({ length: 7 }, (_, i) => ({ d: String(i), sales: 0 }))).map((w, i, arr) => (
          <div key={w.d} className={`${v.barCol} ${i === arr.length - 1 && w.sales ? v.max : ""}`}><i style={{ height: `${Math.max(12, (w.sales / max) * 100)}%` }} /><span>{p ? DOW[new Date(w.d + "T12:00:00").getDay()] : ""}</span></div>
        ))}</div>
      </div>
      <div className={v.sectionHead}><h2 className={v.sectionTitle}>Тірі лента</h2></div>
      {p && p.feed.length === 0 ? (
        <div className={v.result} style={{ marginTop: 0 }}><VSticker name="sleep" size={96} /><p className={v.stateText}>Әзірге оқиға жоқ. Алғашқы сатылым осында көрінеді.</p></div>
      ) : (
        <div className={v.card}>{p ? p.feed.map((f, i) => (
          <div key={i} className={v.row} style={{ minHeight: 62 }}>
            <Person name={f.who} size={40} />
            <span className={v.rowText}><span className={v.rowTitle}>{f.who}</span><span className={v.rowSub}>{kindLabel[f.kind] ?? f.kind} · {f.kind === "buy" ? f.title : f.venue} · {hm(f.at)}</span></span>
            <span className={s.right}><b className={f.kind === "buy" ? s.green : f.kind === "complaint" ? s.red : ""}>{f.kind === "buy" ? `+${money(f.amount)}` : f.kind === "complaint" ? "Шағым" : f.kind === "plan" ? hm(f.at) : f.kind === "gift" ? "1 пакет" : `${f.units} бірлік`}</b></span>
          </div>
        )) : <div className={v.row}><Sk h={120} /></div>}</div>
      )}
    </VPage>
  );
}

export function AAttention() {
  const [a] = useCached<{ attention: Attention }>("a:attention", () => A("/attention"));
  const g = a ? attentionRows(a.attention) : null;
  return (
    <VPage title="Назар керек" back>
      {!g ? <Sk h={200} /> : <>
        <h2 className={v.blueHead}>Шұғыл</h2><div className={v.card}>{g.urgent.map((r) => <Row key={r.t} r={r} />)}</div>
        <h2 className={v.blueHead}>Күтіп тұр</h2><div className={v.card}>{g.waiting.map((r) => <Row key={r.t} r={r} />)}</div>
        <h2 className={v.blueHead}>Жақын арада</h2><div className={v.card}>{g.soon.map((r) => <Row key={r.t} r={r} />)}</div>
      </>}
    </VPage>
  );
}
