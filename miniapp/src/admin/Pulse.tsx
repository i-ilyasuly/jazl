// Figma «02 · Пульс» (14061:10063): Пульс (кезең, 4 көрсеткіш, назар керек, апталық сатылым, тірі лента), Назар керек.
import { useEffect, useState } from "react";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { Tile } from "../ui/Tile";
import { useCached } from "../venue/api";
import { Note, Person, Sk, VPage, VSticker } from "../venue/ui";
import { A, ago, hm, money } from "./api";
import { Badge, Growth, setComplaintDot } from "./ui";
import { useDesk } from "./Desk";
import v from "../venue/V.module.css";
import s from "./A.module.css";

export interface Attention { apps: number; oldest: string | null; offers_new: number; offers_changed: number; complaints: number; due_today: number; failed: number; grace: number; sold?: number; tickAt?: string | null; refund_failed?: number; app_errors?: number }
interface Pulse { sales: number; salesGrowth: number | null; fee: number; feeGrowth: number | null; packs: number; packsDelta: number; units: number; unitsGrowth: number | null; clients: number; clientsDelta: number;
  venuesActive: number; venuesTotal: number; venuesPaused: number; week: { d: string; sales: number }[]; weekTotal: number; feed: { kind: string; at: string; who: string; title: string; venue: string; amount: number; units: number }[] }
const PERIODS = [["today", "Бүгін"], ["7", "7 күн"], ["30", "30 күн"], ["all", "Барлығы"]] as const;
const DOW = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"];
const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];

/** «Назар керек» жолдары — Пульс пен жеке бетке ортақ */
export function attentionRows(a: Attention) {
  return {
    urgent: [
      // Жоспарлы тапсырма 40 минуттан бері жұмыс істемесе: бонус, мерзім ескертуі, күндік қорытынды жіберілмейді
      ...(!a.tickAt || Date.now() - new Date(a.tickAt).getTime() > 40 * 60_000
        ? [{ e: "a:maint", t: "Жоспарлы тапсырма тоқтап тұр", sub: a.tickAt ? `Соңғы рет ${ago(a.tickAt)} бұрын жұмыс істеді: бонус пен ескертулер жіберілмейді` : "Әлі бір рет те іске қосылмаған: бонус пен ескертулер жіберілмейді", n: 1, tone: "red" as const, to: "/a/rules" }] : []),
      { e: "a:complaints", t: "Ашық шағымдар", sub: a.due_today ? `${a.due_today} шағымның мерзімі бүгін бітеді` : "Мерзімі әлі бар", n: a.complaints, tone: "red" as const, to: "/a/complaints" },
      { e: "a:payfail", t: "Сәтсіз төлемдер", sub: "Соңғы 24 сағатта", n: a.failed, tone: "orange" as const, to: "/a/money" },
      // Провайдер ақшаны қайтаруды қабылдамады — клиент ақшасын күтіп отыр
      // Мини апп қателері (track.ts): соңғы 24 сағатта қанша адамда қате шықты
      ...(a.app_errors ? [{ e: "a:maint", t: "Қолданба қателері", sub: "Соңғы 24 сағатта қате шыққан адамдар", n: a.app_errors, tone: "orange" as const, to: "/a/errors" }] : []),
      ...(a.refund_failed ? [{ e: "a:refunds", t: "Картаға қайтарылмаған ақша", sub: "Провайдер қабылдамады — «Қайта жіберу»", n: a.refund_failed, tone: "red" as const, to: "/a/money/refunds" }] : []),
    ],
    waiting: [
      { e: "a:apps", t: "Мекеме өтінімдері", sub: a.oldest ? `Ең ескісі ${ago(a.oldest)} бұрын түсті` : "Жаңа өтінім жоқ", n: a.apps, to: "/a/apps" },
      { e: "a:offers", t: "Модерациядағы ұсыныстар", sub: `${a.offers_new} жаңа, ${a.offers_changed} өзгертілген`, n: a.offers_new + a.offers_changed, to: "/a/offers" },
    ],
    soon: [
      // Патша (2026-11-18): мобильді қосымшаны 100 сатылымнан кейін бастаймыз
      ...(a.sold !== undefined ? [{ e: "a:packs", t: "Мобильді қосымшаға дейін", sub: a.sold >= 100 ? "100 сатылым болды — қосымшаны бастауға болады" : `${a.sold} / 100 сатылым`, n: 0, to: "/a/packs" }] : []),{ e: "a:grace", t: "Күту кезеңі бітетін пакеттер", sub: `Ертең ${a.grace} пакеттің қалдығы клиентке бонус болып қайтады`, n: 0, to: "/a/packs?tab=grace" }],
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

/** Клиентті ұстау (Хормози: өлшенбейтін нәрсе жақсармайды): соңғы 90 күн — бірінші қолдануға дейінгі уақыт, қайта алу, бір клиенттен табыс, автожаңартуды өшіру себебі */
interface Retention { firstUseHours: number | null; firstUseShare: number | null; repeatShare: number | null; buyers: number; ltv: number | null; renewOff: { reason: string; n: number }[] }
const REASON: Record<string, string> = { price: "Қымбат", inconvenient: "Ыңғайсыз", quality: "Сапа", other: "Басқа" };
function RetentionCard() {
  const [d] = useCached<{ retention: Retention }>("a:retention", () => A("/retention"));
  const r = d?.retention;
  const hrs = (h: number | null) => (h == null ? "–" : h < 48 ? `${h} сағ` : `${Math.round(h / 24)} күн`);
  return (
    <>
      <div className={v.sectionHead}><h2 className={v.sectionTitle}>Клиентті ұстау · 90 күн</h2></div>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Бірінші қолдануға дейін</span><span className={v.statNum}>{r ? hrs(r.firstUseHours) : "–"}</span>{r?.firstUseShare != null && <span className={v.statLabel}>{`${r.firstUseShare}% пакет қолданылды`}</span>}</div>
        <div className={v.stat}><span className={v.statLabel}>Қайта алатындар</span><span className={v.statNum}>{r?.repeatShare != null ? `${r.repeatShare}%` : "–"}</span>{r && <span className={v.statLabel}>{`${r.buyers} сатып алушыдан`}</span>}</div>
      </div>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Бір клиенттен табыс</span><span className={v.statNum}>{r?.ltv != null ? money(r.ltv) : "–"}</span></div>
        <div className={v.stat}><span className={v.statLabel}>Автожаңартуды өшіру себебі</span>{r && r.renewOff.length ? r.renewOff.map((x) => <span key={x.reason} className={v.statLabel}>{`${REASON[x.reason] ?? x.reason}: ${x.n}`}</span>) : <span className={v.statNum}>–</span>}</div>
      </div>
    </>
  );
}

/** Пилот воронкасы (Патша, 2026-11-21): әр қадамда неше адам, алдыңғы қадамнан неше пайызы өтті */
interface Funnel { opened: number; viewed: number; started: number; bought: number; used: number; repeat: number }
const STEPS: [keyof Funnel, string][] = [["opened", "Қолданбаны ашты"], ["viewed", "Ұсынысты көрді"], ["started", "Сатып алуды бастады"], ["bought", "Сатып алды"], ["used", "Қолданды"], ["repeat", "Қайта алды"]];
function FunnelCard() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [d] = useCached<{ funnel: Funnel; top: { slug: string; title: string; viewers: number; buyers: number }[] }>(`a:funnel:${days}`, () => A(`/funnel?days=${days}`));
  const f = d?.funnel; const max = Math.max(1, f?.opened ?? 1);
  return (
    <>
      <div className={v.sectionHead}><h2 className={v.sectionTitle}>Пилот воронкасы</h2></div>
      <div className={v.seg}>{([7, 30, 90] as const).map((k) => <button key={k} className={`${v.segBtn} ${days === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setDays(k); }}>{`${k} күн`}</button>)}</div>
      <div className={v.card} style={{ padding: "4px 0" }}>
        {STEPS.map(([k, label], i) => {
          const n = f?.[k] ?? 0; const prev = i ? f?.[STEPS[i - 1][0]] ?? 0 : 0;
          return (
            <div key={k} className={v.kv} style={{ position: "relative" }}>
              <i style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: `${(n / max) * 100}%`, background: "var(--hl-blue-bg)", borderRadius: 8, zIndex: 0 }} />
              <span style={{ position: "relative" }}>{label}</span>
              <b style={{ position: "relative" }}>{f ? `${n}${i && prev ? ` · ${Math.round((n * 100) / prev)}%` : ""}` : "–"}</b>
            </div>
          );
        })}
      </div>
      {d && d.top.length > 0 && <>
        <div className={v.sectionHead}><h2 className={v.sectionTitle}>Көп қаралған ұсыныстар</h2></div>
        <div className={v.card} style={{ padding: "4px 0" }}>{d.top.map((o) => <div className={v.kv} key={o.slug}><span>{o.title}</span><b>{`${o.viewers} көрді · ${o.buyers} алды`}</b></div>)}</div>
      </>}
    </>
  );
}

/** Мини апп қателері: соңғы 7 күн, бірдей қателер топталған */
interface ErrRow { msg: string; n: number; users: number; last_at: string; route: string | null; ver: string | null; platform: string | null; stack: string | null }
export function AErrors() {
  const [d] = useCached<{ day: number; dayUsers: number; items: ErrRow[] }>("a:errors", () => A("/errors"));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <VPage title="Қолданба қателері" back>
      {!d ? <Sk h={160} /> : d.items.length === 0 ? (
        <div className={v.result}><VSticker name="sleep" size={100} /><h2 className={v.stateTitle}>Қате жоқ</h2><p className={v.stateText}>Соңғы 7 күнде клиенттерде қате шықпады.</p></div>
      ) : (
        <div className={v.card}>{d.items.map((e) => (
          <button key={e.msg} className={v.row} style={{ minHeight: 64, alignItems: "flex-start" }} onClick={() => { haptic.tap(); setOpen(open === e.msg ? null : e.msg); }}>
            <span className={v.rowText}>
              <span className={v.rowTitle} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{e.msg}</span>
              <span className={v.rowSub}>{`${e.n} рет · ${e.users} адам · ${ago(e.last_at)} бұрын · ${e.route ?? "?"}${e.platform ? " · " + e.platform : ""}${e.ver ? " · v" + e.ver : ""}`}</span>
              {open === e.msg && e.stack && <pre style={{ margin: "8px 0 0", fontSize: 11, lineHeight: "15px", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--text-secondary)" }}>{e.stack}</pre>}
            </span>
            <span className={`${v.tag} ${e.users > 1 ? v.tagRed : v.tagYellow}`}>{e.n}</span>
          </button>
        ))}</div>
      )}
      <Note>Қате мәтінін басса, толық сипаттамасы (stack) ашылады. Клиенттердің жеке деректері мұнда сақталмайды.</Note>
    </VPage>
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
  const desk = useDesk();
  const seg = <div className={v.seg} style={desk ? { maxWidth: 420 } : undefined}>{PERIODS.map(([k, t]) => <button key={k} className={`${v.segBtn} ${period === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setPeriod(k); }}>{t}</button>)}</div>;
  const chart = (
    <div className={v.chart}>
      <div className={v.chartHead}><b className={v.lead}>Апталық сатылым</b><span className={v.chartSum}>{p ? money(p.weekTotal) : "–"}</span></div>
      <div className={v.bars}>{(p?.week ?? Array.from({ length: 7 }, (_, i) => ({ d: String(i), sales: 0 }))).map((w, i, arr) => (
        <div key={w.d} className={`${v.barCol} ${i === arr.length - 1 && w.sales ? v.max : ""}`}><i style={{ height: `${Math.max(12, (w.sales / max) * 100)}%` }} /><span>{p ? DOW[new Date(w.d + "T12:00:00").getDay()] : ""}</span></div>
      ))}</div>
    </div>
  );
  if (desk) return (
    // Figma «Пульс / Desktop» (14068:9931): 4 көрсеткіш, апталық сатылым, тірі лента кестесі; оң жақта «Назар керек»
    <VPage nav>
      <h1 className={v.h1}>Пульс</h1>
      <p className={s.sub}>{sub}</p>
      <div className={s.pulseGrid}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {seg}
          <div className={s.stats4}>
            <div className={`${v.stat} ${s.statBlue}`}><span className={v.statLabel}>Сатылым</span><span className={v.statNum}>{p ? money(p.sales) : "–"}</span>{p && <Growth v={p.salesGrowth} white={period === "today"} />}</div>
            <div className={v.stat}><span className={v.statLabel}>Комиссия</span><span className={v.statNum}>{p ? money(p.fee) : "–"}</span>{p && <Growth v={p.feeGrowth} />}</div>
            <div className={v.stat}><span className={v.statLabel}>Сатылған пакет</span><span className={v.statNum}>{p ? p.packs : "–"}</span>{p && <span className={p.packsDelta >= 0 ? s.pillUp : s.pillDown}>{p.packsDelta >= 0 ? "▲" : "▼"} {Math.abs(p.packsDelta)}</span>}</div>
            <div className={v.stat}><span className={v.statLabel}>Қолданылды</span><span className={v.statNum}>{p ? p.units : "–"}</span>{p && <Growth v={p.unitsGrowth} />}</div>
          </div>
          {chart}
          <button className={v.btn} style={{ background: "var(--surface-white)", color: "var(--link)" }} onClick={() => { haptic.tap(); go("/a/metrics"); }}>Барлық метрикалар: GMV, retention, LTV/CAC, runway…</button>
          <RetentionCard />
          <FunnelCard />
          <div className={v.sectionHead}><h2 className={v.sectionTitle}>Тірі лента</h2></div>
          <table className={s.table}>
            <thead><tr><th>Уақыт</th><th>Клиент</th><th>Әрекет</th><th>Мекеме</th><th className={s.num}>Сома</th></tr></thead>
            <tbody>{(p?.feed ?? []).map((f, i) => (
              <tr key={i} style={{ cursor: "default" }}><td>{hm(f.at)}</td><td>{f.who}</td><td>{kindLabel[f.kind] ?? f.kind} · {f.kind === "use" ? `${f.units} бірлік` : f.title}</td><td>{f.venue}</td>
                <td className={s.num}>{f.kind === "buy" ? <span className={s.green}>+{money(f.amount)}</span> : f.kind === "complaint" ? <span className={`${v.tag} ${v.tagRed}`}>Шағым</span> : "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className={v.deskPanel} style={{ position: "sticky", top: 88 }}>
          <h2 className={v.sectionTitle}>Назар керек</h2>
          <div className={v.card}>{att ? [att.urgent[0], att.urgent[1], att.waiting[0], att.waiting[1]].map((r) => <Row key={r.t} r={r} />) : <div className={v.row}><Sk h={40} /></div>}</div>
          {att && a && a.grace > 0 && <p className="t-sub2 infoBox" style={{ margin: 0 }}>{att.soon[0].sub}</p>}
        </div>
      </div>
    </VPage>
  );
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
        <div className={v.stat}><span className={v.statLabel}>Белсенді мекеме</span><span className={v.statNum}>{p ? `${p.venuesActive} / ${p.venuesTotal}` : "–"}</span>{p && p.venuesPaused > 0 && <span className={`${v.tag} ${v.tagYellow}`} style={{ alignSelf: "flex-start" }}>{`${p.venuesPaused} тоқтатылған`}</span>}</div>
      </div>
      <div className={v.chart}>
        <div className={v.chartHead}><b className={v.lead}>Апталық сатылым</b><span className={v.chartSum}>{p ? money(p.weekTotal) : "–"}</span></div>
        <div className={v.bars}>{(p?.week ?? Array.from({ length: 7 }, (_, i) => ({ d: String(i), sales: 0 }))).map((w, i, arr) => (
          <div key={w.d} className={`${v.barCol} ${i === arr.length - 1 && w.sales ? v.max : ""}`}><i style={{ height: `${Math.max(12, (w.sales / max) * 100)}%` }} /><span>{p ? DOW[new Date(w.d + "T12:00:00").getDay()] : ""}</span></div>
        ))}</div>
      </div>
      <button className={v.btn} style={{ background: "var(--surface-white)", color: "var(--link)" }} onClick={() => { haptic.tap(); go("/a/metrics"); }}>Барлық метрикалар: GMV, retention, LTV/CAC, runway…</button>
      <RetentionCard />
      <FunnelCard />
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
