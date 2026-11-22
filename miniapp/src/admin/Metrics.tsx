// Метрикалар (Патша, 2026-11-22): барлық стартап көрсеткіштері бір бетте, әр терминнің қысқа түсіндірмесімен.
// Дерек: GET /v1/admin/metrics?days=…  ·  Қаржы жазбалары (жарнама, шығын, касса): /a/finance
import { useState } from "react";
import { useGo } from "../nav";
import { haptic, nativeAlert } from "../telegram";
import { useCached } from "../venue/api";
import { Note, Sk, VPage } from "../venue/ui";
import { A, money, post } from "./api";
import { Growth } from "./ui";
import { useDesk } from "./Desk";
import v from "../venue/V.module.css";
import s from "./A.module.css";

type N = number | null;
interface M {
  days: number;
  northStar: { units: number; growth: N; prev: number };
  growth: { gmv: number; gmvGrowth: N; revenue: number; revenueGrowth: N; booked: number; takeRate: N; packs: number; packsGrowth: N; aov: N; newUsers: number; newUsersGrowth: N; newBuyers: number; newBuyersGrowth: N; buyers: number; conversion: N };
  activity: { dau: number; wau: number; mau: number; stickiness: N; daily: { d: string; dau: number; gmv: number; units: number; users: number }[] };
  retention: { d1: N; d7: N; d30: N; base: { d1: number; d7: number; d30: number }; repeat: N; buyers: number; activeBuyers: number; churn: N; cohorts: { week: string; size: number; w1: number; w2: number; w3: number; w4: number }[] };
  unit: { ltvGmv: N; ltvRevenue: N; cac: N; ltvCac: N; payback: N; marketing: number; marketingGrowth: N; arpu30: number };
  usage: { soldUnits: number; usedUnits: number; utilization: N; unitsUsed: number; valueUsed: number; liability: number; outstanding: number; bonusLiability: number; breakage: number; firstUseHours: N };
  market: { venues: number; venuesWithSale: number; venueLiquidity: N; offers: number; offersWithSale: number; offerLiquidity: N; gmvPerVenue: N; topShare: N; topVenues: { name: string; gmv: number; packs: number; buyers: number }[]; byKind: { kind: string; gmv: number; packs: number }[] };
  acquisition: { sources: { source: string; users: number; buyers: number }[]; campaigns: { ref: string; users: number; buyers: number }[]; platforms: { platform: string; users: number }[] };
  gifts: { sent: number; accepted: number; converted: number; senders: number; acceptRate: N; convRate: N };
  payments: { total: number; paid: number; failed: number; refunds: number; refunded: number; successRate: N; refundRate: N; methods: { method: string; total: number; paid: number }[]; failures: { reason: string; n: number }[] };
  quality: { complaints: number; complaintRate: N; complaintsRefunded: number; stars: N; ratings: number; errorShare: N; renewOff: { reason: string; n: number }[] };
  finance: { marketing: number; costs: number; revenue: number; burn30: number; cash: N; cashDay: string | null; runway: N; profitable: boolean };
  time: { hours: { h: number; n: number }[]; weekdays: { d: number; n: number }[] };
  demand: { searches: { q: string; n: number; users: number; zero: number }[]; shares: { n: number; users: number }; priceChanges: { changes: number; offers: number } };
  snapshots: { day: string; data: Record<string, number> }[];
}

const P = (x: N) => (x == null ? "–" : `${x}%`);
const M_ = (x: N) => (x == null ? "–" : money(x));
const SRC: Record<string, string> = { direct: "Тікелей (сілтемесіз)", ad: "Жарнама сілтемесі", ref: "Шақыру", venue: "Мекеме сілтемесі", offer: "Ұсыныспен бөлісу", gift: "Сыйлық", b: "Мекеме жапсырмасы", pk: "Бот хабарламасы", p: "Бот хабарламасы", other: "Басқа", "белгісіз": "Белгісіз (бұрынғы)" };
const KIND: Record<string, string> = { coffee: "Кофе", food: "Тамақ", hair: "Шаштараз" };
const DOWS = ["", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб", "Жс"];
const REASON: Record<string, string> = { price: "Қымбат", inconvenient: "Ыңғайсыз", quality: "Сапа", other: "Басқа" };

/** Бір көрсеткіш: атауы, түсіндірмесі (термин), мәні, өсуі */
function St({ t, hint, val, g, blue }: { t: string; hint: string; val: string | number; g?: N; blue?: boolean }) {
  return (
    <div className={`${v.stat} ${blue ? s.statBlue : ""}`}>
      <span className={v.statLabel}>{t}</span>
      <span className={v.statNum} style={{ fontSize: 22, lineHeight: "28px" }}>{val}</span>
      {g !== undefined && <Growth v={g} white={blue} />}
      <span className={v.statLabel} style={{ fontSize: 12, lineHeight: "16px", opacity: blue ? 0.85 : 1 }}>{hint}</span>
    </div>
  );
}
const H = ({ t, hint }: { t: string; hint?: string }) => (
  <div className={v.sectionHead} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
    <h2 className={v.sectionTitle}>{t}</h2>{hint && <span className="t-sub2" style={{ color: "var(--text-secondary)" }}>{hint}</span>}
  </div>
);
const Kv = ({ rows }: { rows: [string, string | number][] }) => <div className={v.card} style={{ padding: "4px 0" }}>{rows.map(([a, b], i) => <div key={i} className={v.kv}><span>{a}</span><b>{b}</b></div>)}</div>;
const Bars = ({ items, label }: { items: { k: string; n: number }[]; label?: (n: number) => string }) => {
  const max = Math.max(1, ...items.map((x) => x.n));
  return (
    <div className={v.chart}>
      <div className={v.bars} style={{ height: 110 }}>{items.map((x) => <div key={x.k} className={v.barCol} title={label ? label(x.n) : String(x.n)}><i style={{ height: `${Math.max(4, (x.n / max) * 100)}%` }} /><span>{x.k}</span></div>)}</div>
    </div>
  );
};
const grid = (desk: boolean) => (desk ? { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } : undefined);

export function AMetrics() {
  const go = useGo();
  const desk = useDesk();
  const [days, setDays] = useState<7 | 30 | 90 | 365>(30);
  const [d] = useCached<{ metrics: M }>(`a:metrics:${days}`, () => A(`/metrics?days=${days}`));
  const m = d?.metrics;
  const G = desk ? s.stats4 : v.stats;
  const csv = () => {
    if (!m) return;
    const lines = ["күн,DAU,GMV,қолданылған бірлік,жаңа клиент", ...m.activity.daily.map((x) => `${x.d},${x.dau},${x.gmv},${x.units},${x.users}`)];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = `metrics-${days}d.csv`; a.click();
  };
  return (
    <VPage title="Метрикалар" back>
      <div className={v.seg} style={desk ? { maxWidth: 420 } : undefined}>{([7, 30, 90, 365] as const).map((k) => <button key={k} className={`${v.segBtn} ${days === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setDays(k); }}>{k === 365 ? "Жыл" : `${k} күн`}</button>)}</div>
      {!m ? <Sk h={420} /> : <>
        <H t="North Star" hint="Басты бір көрсеткіш: клиент нақты алған құндылық" />
        <div className={G} style={grid(desk)}>
          <St blue t="Аптасына қолданылған бірлік" hint="North Star — соңғы 7 күн, алдыңғы аптамен салыстыру" val={m.northStar.units} g={m.northStar.growth} />
          <St t="Бұрынғы апта" hint="Салыстыру үшін" val={m.northStar.prev} />
        </div>

        <H t="Өсу" hint={`Соңғы ${days} күн, алдыңғы ${days} күнмен салыстыру`} />
        <div className={G} style={grid(desk)}>
          <St t="GMV" hint="Жалпы сауда көлемі — сатылған пакеттердің сомасы" val={money(m.growth.gmv)} g={m.growth.gmvGrowth} />
          <St t="Revenue (танылған)" hint="Біздің табыс — бірлік қолданылғанда танылатын комиссия" val={money(m.growth.revenue)} g={m.growth.revenueGrowth} />
          <St t="Take rate" hint="GMV-ден алатын үлесіміз (комиссия %)" val={P(m.growth.takeRate)} />
          <St t="AOV" hint="Орташа чек — бір пакеттің орташа бағасы" val={M_(m.growth.aov)} />
          <St t="Сатылған пакет" hint="Төленген пакеттер саны" val={m.growth.packs} g={m.growth.packsGrowth} />
          <St t="Жаңа клиент" hint="Мини аппты алғаш ашқандар" val={m.growth.newUsers} g={m.growth.newUsersGrowth} />
          <St t="Жаңа сатып алушы" hint="Алғашқы пакетін сатып алғандар" val={m.growth.newBuyers} g={m.growth.newBuyersGrowth} />
          <St t="Conversion" hint="Жаңа клиенттің сатып алушыға айналуы" val={P(m.growth.conversion)} />
        </div>

        <H t="Белсенділік" hint="Мини аппты ашқан бірегей адамдар" />
        <div className={G} style={grid(desk)}>
          <St t="DAU" hint="Күндік белсенді қолданушы (соңғы 24 сағат)" val={m.activity.dau} />
          <St t="WAU" hint="Апталық белсенді қолданушы" val={m.activity.wau} />
          <St t="MAU" hint="Айлық белсенді қолданушы" val={m.activity.mau} />
          <St t="Stickiness" hint="DAU / MAU — адамдар қаншалықты жиі оралады" val={P(m.activity.stickiness)} />
        </div>
        <Bars items={m.activity.daily.slice(-14).map((x) => ({ k: x.d.slice(8), n: x.gmv }))} label={(n) => money(n)} />
        <p className="t-sub2" style={{ margin: "-4px 4px 0", color: "var(--text-secondary)" }}>GMV күн сайын (соңғы 14 күн)</p>

        <H t="Ұстау (retention)" hint="Клиенттер қайта орала ма — PMF-тің басты белгісі" />
        <div className={G} style={grid(desk)}>
          <St t="D1 retention" hint={`Тіркелген соң 1 күннен кейін қайта ашқандар (${m.retention.base.d1} адамнан)`} val={P(m.retention.d1)} />
          <St t="D7 retention" hint={`7 күннен кейін қайта ашқандар (${m.retention.base.d7} адамнан)`} val={P(m.retention.d7)} />
          <St t="D30 retention" hint={`30 күннен кейін қайта ашқандар (${m.retention.base.d30} адамнан)`} val={P(m.retention.d30)} />
          <St t="Repeat purchase" hint={`Екінші рет сатып алғандар (${m.retention.buyers} сатып алушыдан)`} val={P(m.retention.repeat)} />
          <St t="Белсенді сатып алушы" hint="Қазір қолданылмаған пакеті бар адамдар" val={m.retention.activeBuyers} />
          <St t="Churn" hint="Кеткендер: 45 күн сатып алмаған, белсенді пакеті жоқ" val={P(m.retention.churn)} />
        </div>
        {m.retention.cohorts.length > 0 && <>
          <H t="Сатып алушы когорттары" hint="Когорт — бір аптада алғаш сатып алғандар тобы. Сандар — сол топтан N аптадан кейін қайта сатып алғандар %" />
          <div className={v.card} style={{ overflowX: "auto" }}>
            <table className={s.table} style={{ minWidth: 420 }}>
              <thead><tr><th>Апта</th><th className={s.num}>Адам</th><th className={s.num}>+1</th><th className={s.num}>+2</th><th className={s.num}>+3</th><th className={s.num}>+4</th></tr></thead>
              <tbody>{m.retention.cohorts.map((c) => <tr key={c.week} style={{ cursor: "default" }}><td>{c.week.slice(5)}</td><td className={s.num}>{c.size}</td>{[c.w1, c.w2, c.w3, c.w4].map((x, i) => <td key={i} className={s.num}>{c.size ? `${Math.round((x * 100) / c.size)}%` : "–"}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>}

        <H t="Unit economics" hint="Бір клиенттен пайда бар ма" />
        <div className={G} style={grid(desk)}>
          <St t="LTV (табыс)" hint="Бір сатып алушыдан бүкіл уақытта алған комиссиямыз" val={M_(m.unit.ltvRevenue)} />
          <St t="LTV (GMV)" hint="Бір сатып алушының жалпы сатып алуы" val={M_(m.unit.ltvGmv)} />
          <St t="CAC" hint="Бір жаңа сатып алушыны тарту құны = жарнама шығыны / жаңа сатып алушы" val={M_(m.unit.cac)} />
          <St t="LTV / CAC" hint="Жақсы көрсеткіш — 3-тен жоғары" val={m.unit.ltvCac ?? "–"} />
          <St t="Payback" hint="CAC неше айда ақталады (ай)" val={m.unit.payback ?? "–"} />
          <St t="ARPU (30 күн)" hint="Бір белсенді клиенттен айлық табыс" val={money(m.unit.arpu30)} />
        </div>

        <H t="Қолдану" hint="Сатылған бірліктер қаншалықты қолданылады" />
        <div className={G} style={grid(desk)}>
          <St t="Утилизация" hint={`Кезеңде сатылған ${m.usage.soldUnits} бірліктің қолданылғаны`} val={P(m.usage.utilization)} />
          <St t="Қолданылған бірлік" hint={`Кезеңде, құны ${money(m.usage.valueUsed)}`} val={m.usage.unitsUsed} />
          <St t="Міндеттеме (liability)" hint={`Клиенттердің әлі қолданбаған құны — ${m.usage.outstanding} бірлік`} val={money(m.usage.liability)} />
          <St t="Бонус міндеттемесі" hint="Клиенттердің жұмсамаған бонустары" val={money(m.usage.bonusLiability)} />
          <St t="Breakage" hint="Мерзімі өтіп, бонусқа айналған құн (кезеңде)" val={money(m.usage.breakage)} />
          <St t="Бірінші қолдануға дейін" hint="Сатып алғаннан бірінші бірлікке дейін (медиана)" val={m.usage.firstUseHours == null ? "–" : m.usage.firstUseHours < 48 ? `${m.usage.firstUseHours} сағ` : `${Math.round(m.usage.firstUseHours / 24)} күн`} />
        </div>

        <H t="Нарық (marketplace)" hint="Екі жақты нарықтың денсаулығы" />
        <div className={G} style={grid(desk)}>
          <St t="Белсенді мекеме" hint={`Кезеңде сатылымы болған: ${m.market.venuesWithSale}`} val={m.market.venues} />
          <St t="Мекеме өтімділігі" hint="Liquidity — сатылымы бар мекемелер үлесі" val={P(m.market.venueLiquidity)} />
          <St t="Ұсыныс өтімділігі" hint={`${m.market.offers} белсенді ұсыныстың ${m.market.offersWithSale}-і сатылды`} val={P(m.market.offerLiquidity)} />
          <St t="Шоғырлану" hint="Ең ірі мекеменің GMV үлесі — тым жоғары болса, тәуекел" val={P(m.market.topShare)} />
        </div>
        {m.market.topVenues.length > 0 && <Kv rows={m.market.topVenues.map((x) => [x.name, `${money(x.gmv)} · ${x.packs} пакет · ${x.buyers} адам`])} />}
        {m.market.byKind.length > 0 && <Kv rows={m.market.byKind.map((x) => [KIND[x.kind] ?? x.kind, `${money(x.gmv)} · ${x.packs} пакет`])} />}

        <H t="Көздер (acquisition)" hint="Клиент қайдан келді → қаншасы сатып алды. Жарнама сілтемесі: t.me/<бот>?startapp=ad_<код>" />
        <Kv rows={m.acquisition.sources.length ? m.acquisition.sources.map((x) => [SRC[x.source] ?? x.source, `${x.users} адам · ${x.buyers} сатып алды${x.users ? ` · ${Math.round((x.buyers * 100) / x.users)}%` : ""}`]) : [["Әзірге дерек жоқ", "–"]]} />
        {m.acquisition.campaigns.length > 0 && <><H t="Жарнама сілтемелері" /><Kv rows={m.acquisition.campaigns.map((x) => [`ad_${x.ref}`, `${x.users} адам · ${x.buyers} сатып алды`])} /></>}
        {m.acquisition.platforms.length > 0 && <Kv rows={m.acquisition.platforms.map((x) => [x.platform, `${x.users} адам`])} />}

        <H t="Сыйлық (вирустық өсу)" hint="Viral loop — сыйлық алған адам өзі клиентке айнала ма" />
        <div className={G} style={grid(desk)}>
          <St t="Жіберілді" hint={`${m.gifts.senders} адам сыйлады`} val={m.gifts.sent} />
          <St t="Қабылданды" hint="Сыйлықты ашып алғандар" val={`${m.gifts.accepted} · ${P(m.gifts.acceptRate)}`} />
          <St t="Сатып алушыға айналды" hint="Сыйлық алған соң өзі сатып алғандар" val={`${m.gifts.converted} · ${P(m.gifts.convRate)}`} />
          <St t="Бөлісу" hint={`Ұсыныспен бөлісті: ${m.demand.shares.users} адам`} val={m.demand.shares.n} />
        </div>

        <H t="Төлем" />
        <div className={G} style={grid(desk)}>
          <St t="Сәттілік" hint={`${m.payments.total} әрекеттің ${m.payments.paid}-і төленді`} val={P(m.payments.successRate)} />
          <St t="Сәтсіз" hint="Карта қабылданбады, 3-D Secure т.б." val={m.payments.failed} />
          <St t="Refund rate" hint={`Қайтарылды: ${money(m.payments.refunded)}`} val={P(m.payments.refundRate)} />
        </div>
        {(m.payments.methods.length > 0 || m.payments.failures.length > 0) && <Kv rows={[...m.payments.methods.map((x) => [`Тәсіл: ${x.method}`, `${x.paid} / ${x.total}`] as [string, string]), ...m.payments.failures.map((x) => [`Себеп: ${x.reason}`, x.n] as [string, number])]} />}

        <H t="Сапа" />
        <div className={G} style={grid(desk)}>
          <St t="Шағым" hint="100 қолданудағы шағым саны" val={m.quality.complaintRate == null ? m.quality.complaints : `${m.quality.complaintRate} / 100`} />
          <St t="Орташа баға" hint={`${m.quality.ratings} баға`} val={m.quality.stars ?? "–"} />
          <St t="Қате көргендер" hint="Мини аппта қате шыққан адамдар үлесі" val={P(m.quality.errorShare)} />
        </div>
        {m.quality.renewOff.length > 0 && <Kv rows={m.quality.renewOff.map((x) => [`Автожаңартуды өшірді: ${REASON[x.reason] ?? x.reason}`, x.n])} />}

        <H t="Қаржы" hint="Burn rate — айлық таза шығын, runway — ақша неше айға жетеді" />
        <div className={G} style={grid(desk)}>
          <St t="Burn rate (30 күн)" hint="Шығын + жарнама − табыс" val={m.finance.burn30 <= 0 && m.finance.profitable ? "Пайдада" : money(m.finance.burn30)} />
          <St t="Runway" hint={m.finance.cashDay ? `Касса ${money(m.finance.cash ?? 0)} (${m.finance.cashDay})` : "Касса енгізілмеген"} val={m.finance.runway == null ? "–" : `${m.finance.runway} ай`} />
          <St t="Жарнама шығыны" hint="Кезеңде (CAC осыдан)" val={money(m.finance.marketing)} />
          <St t="Басқа шығын" hint="Кезеңде (сервер, жалақы…)" val={money(m.finance.costs)} />
        </div>
        <button className={v.btn} onClick={() => { haptic.tap(); go("/a/finance"); }}>Шығын, жарнама, касса енгізу</button>

        <H t="Уақыт" hint="Бірлік қай сағатта, қай күні қолданылады (Алматы уақыты)" />
        <Bars items={Array.from({ length: 24 }, (_, h) => ({ k: h % 3 ? "" : String(h), n: m.time.hours.find((x) => x.h === h)?.n ?? 0 }))} />
        <Bars items={Array.from({ length: 7 }, (_, i) => ({ k: DOWS[i + 1], n: m.time.weekdays.find((x) => x.d === i + 1)?.n ?? 0 }))} />

        <H t="Сұраныс" hint="Не іздейді, нені таппайды (нөл нәтиже — жаңа мекеме тартуға белгі)" />
        <Kv rows={m.demand.searches.length ? m.demand.searches.map((x) => [x.q, `${x.users} адам${x.zero ? ` · ${x.zero} рет табылмады` : ""}`]) : [["Әзірге іздеу жоқ", "–"]]} />
        <Kv rows={[["Баға өзгерісі", `${m.demand.priceChanges.changes} рет · ${m.demand.priceChanges.offers} ұсыныс`]]} />

        <button className={v.btn} style={{ background: "var(--surface-white)", color: "var(--link)" }} onClick={() => { haptic.tap(); csv(); }}>Күндік деректі CSV жүктеу</button>
        <Note>Дерек жинау 2026-11-22-ден басталды: клиенттің көзі, платформасы, іздеу, бөлісу, баға тарихы, күндік сурет (міндеттеме, белсенді пакеттер). Бұрынғы клиенттердің көзі — «белгісіз».</Note>
      </>}
    </VPage>
  );
}

// ── Қаржы жазбалары: жарнама шығыны (CAC), басқа шығын (burn), касса (runway) ──
interface Fin { id: string; kind: "marketing" | "cost" | "cash"; category: string; amount: number; day: string; note: string | null }
const FK: [Fin["kind"], string, string][] = [["marketing", "Жарнама", "Instagram, TikTok, баннер…"], ["cost", "Шығын", "Сервер, жалақы, басып шығару…"], ["cash", "Касса", "Қолдағы ақша (соңғысы саналады)"]];
export function AFinance() {
  const [d, , reload] = useCached<{ entries: Fin[] }>("a:finance", () => A("/finance"));
  const [kind, setKind] = useState<Fin["kind"]>("marketing");
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = Number(amount.replace(/\s/g, ""));
    if (!cat.trim() || !Number.isFinite(n) || n < 0) { haptic.error(); return; }
    setBusy(true);
    try { await post("/finance", { kind, category: cat.trim(), amount: Math.round(n), day }); haptic.success(); setCat(""); setAmount(""); reload(); }
    catch { haptic.error(); nativeAlert("Сақталмады, қайталап көріңіз"); } finally { setBusy(false); }
  };
  const del = async (id: string) => { haptic.medium(); try { await post(`/finance/${id}/delete`); reload(); } catch { haptic.error(); } };
  const label = (k: Fin["kind"]) => FK.find((x) => x[0] === k)?.[1] ?? k;
  return (
    <VPage title="Қаржы жазбалары" back>
      <div className={v.seg}>{FK.map(([k, t]) => <button key={k} className={`${v.segBtn} ${kind === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setKind(k); }}>{t}</button>)}</div>
      <label className={s.field}><span>{kind === "cash" ? "Қай шот" : "Санат"}</span><input value={cat} maxLength={40} placeholder={FK.find((x) => x[0] === kind)?.[2]} onChange={(e) => setCat(e.target.value)} /></label>
      <label className={s.field}><span>Сома, ₸</span><input inputMode="numeric" value={amount} maxLength={12} placeholder="50000" onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))} /></label>
      <label className={s.field}><span>Күні</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
      <button className={v.btn} disabled={busy} onClick={() => void save()}>Қосу</button>
      {!d ? <Sk h={120} /> : d.entries.length > 0 && <div className={v.card}>{d.entries.map((e) => (
        <div key={e.id} className={v.row}>
          <span className={v.rowText}><span className={v.rowTitle}>{`${label(e.kind)} · ${e.category}`}</span><span className={v.rowSub}>{e.day}</span></span>
          <b style={{ marginRight: 8 }}>{money(e.amount)}</b>
          <button className={v.link} onClick={() => void del(e.id)}>Өшіру</button>
        </div>
      ))}</div>}
      <Note>Жарнама шығыны CAC-ты (бір клиентті тарту құны), шығын мен жарнама burn rate-ті (айлық таза шығын), касса runway-ді (ақша неше айға жетеді) есептейді.</Note>
    </VPage>
  );
}
