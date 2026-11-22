// Figma «06 · Ұсыныстар: тізім» (14007:7999), «09 · Есеп» (14011:7999), «12 · Мәзір» (14012:9086).
import { useCallback, useEffect, useState } from "react";
import { useGo } from "../nav";
import { haptic, nativeAlert, nativePick, openChat } from "../telegram";
import { Switch } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { SUPPORT_BOT } from "../config";
import { dayMonth, money, roleName, useCached, useCurrent, V, type VOffer } from "./api";
import { Buttons, OfferPic, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

const soon = () => nativeAlert("Бұл бөлім келесі кезеңде қосылады.");

export function VOffers() {
  const go = useGo();
  const me = useCurrent();
  const [list, setList, reloadList] = useCached<VOffer[]>(me ? `offers:${me.venue.id}` : null, () => V.offers(me!.venue.id), []);
  const [tab, setTab] = useState<"active" | "draft" | "archive">("active");
  const load = () => void reloadList();
  const of = (t: typeof tab) => (list ?? []).filter((o) => (t === "active" ? o.status === "active" || o.status === "paused" : t === "draft" ? o.status === "draft" || o.status === "review" : o.status === "ended"));
  async function toggle(o: VOffer, on: boolean) {
    if (!me) return;
    if (!on) {
      const r = await nativePick("Ұсынысты тоқтату?", "Жаңа клиенттер сатып ала алмайды. Сатылған пакеттер жарамды болып қалады.", [{ id: "no", text: "Жоқ" }, { id: "yes", text: "Тоқтату" }], "yes");
      if (r !== "yes") return;
    }
    setList((l) => (l ?? []).map((x) => (x.id === o.id ? { ...x, status: on ? "active" : "paused" } : x)));
    try { await V.offerStatus(me.venue.id, o.id, on ? "active" : "paused"); haptic.success(); } catch { haptic.error(); load(); }
  }
  const shown = of(tab);
  return (
    <VPage tab="offers">
      <h1 className={s.h1}>Ұсыныстар <span className={s.count}>{list ? list.length : "–"}</span></h1>
      <div className={s.seg}>
        {([["active", "Белсенді"], ["draft", "Жоба"], ["archive", "Мұрағат"]] as const).map(([k, t]) => (
          <button key={k} className={`${s.segBtn} ${tab === k ? s.segOn : ""}`} onClick={() => { haptic.select(); setTab(k); }}>{t}{list && k !== "archive" ? ` · ${of(k).length}` : ""}</button>
        ))}
      </div>
      {list === null ? <><Sk h={120} /><Sk h={120} /></> : shown.length === 0 ? <div className={s.card}><div className={s.row}><span className={s.rowSub}>Бұл бөлімде ұсыныс жоқ</span></div></div>
        : shown.map((o) => {
          const on = o.status === "active";
          return (
            <div key={o.id} className={s.oc} role="button" onClick={(e) => { if (!(e.target as HTMLElement).closest("[role=switch]")) go(`/v/offers/${o.id}`); }}>
              <div className={`${s.ocTop} ${on ? "" : s.dim}`}>
                <span className={s.ocPic} style={{ overflow: "hidden" }}>{o.photo ? <img src={o.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <OfferPic kind={o.kind} size={30} />}</span>
                <span className={s.rowText}>
                  <span className={s.rowTitle}><b style={{ fontWeight: 600 }}>{o.title}</b>{o.status === "paused" && <span className={`${s.tag} ${s.tagYellow}`}>Тоқтатылған</span>}{o.status === "review" && <span className={s.tag}>Тексеруде</span>}</span>
                  <span className={s.ocTags}>{[...new Set(o.sizes)].map((n, i, a) => <span key={n}>{n}{i === a.length - 1 ? " бірлік" : ""}</span>)}</span>
                </span>
                {(o.status === "active" || o.status === "paused") && me?.role !== "cashier" && <Switch on={on} onChange={(v) => void toggle(o, v)} />}
              </div>
              <div className={s.ocBottom}><span className={s.ocPrice}>{`${money(o.fromPrice)}-дан`}</span><span className={s.rowSub}>{o.limit ? (o.soldMonth >= o.limit ? `Осы айға таусылды · ${o.limit}` : `Осы ай: ${o.soldMonth} / ${o.limit}`) : `${o.sold} пакет сатылды`}</span></div>
            </div>
          );
        })}
      {me?.role !== "cashier" && <button className={s.fab} onClick={() => go("/v/offers/new")}><span style={{ fontSize: 24, lineHeight: 1 }}>+</span>Құру</button>}
    </VPage>
  );
}

const DOW = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"];
const DOW_ISO = ["Дс", "Сс", "Ср", "Бс", "Жм", "Сб", "Жс"];
type Period = "week" | "month" | "all";

/** Өткен кезеңмен салыстыру: +12% / −5% / жаңа */
function Delta({ now, prev }: { now: number; prev: number | null | undefined }) {
  if (prev == null) return null;
  if (prev === 0) return now > 0 ? <span className={s.up}>жаңа</span> : null;
  const d = Math.round(((now - prev) / prev) * 100);
  return <span className={`${s.up} ${d < 0 ? s.down : ""}`}>{`${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}%`}</span>;
}
const pctText = (v: number | null) => (v == null ? "—" : `${v}%`);
const stars = (v: number | null) => (v == null ? "—" : `★ ${v.toFixed(1).replace(".", ",")}`);

function Stat({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statNum}>{value}</span>
      {delta}
      {sub && <span className={s.statSub}>{sub}</span>}
    </div>
  );
}

/** Жүктеме графигі: ең жоғарғы баған жасыл, қалғаны ашық */
function LoadBars({ values, labels, every = 1 }: { values: number[]; labels: string[]; every?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className={s.bars} style={{ gap: values.length > 12 ? 3 : 8, height: 90 }}>
      {values.map((v, i) => (
        <div key={i} className={`${s.barCol} ${v === max && v > 0 ? s.max : ""}`}>
          <i style={{ height: `${Math.max(8, (v / max) * 100)}%`, minHeight: 6, borderRadius: values.length > 12 ? 4 : 8 }} />
          <span>{i % every === 0 ? labels[i] : "\u00a0"}</span>
        </div>
      ))}
    </div>
  );
}

export function VReport() {
  const go = useGo();
  const me = useCurrent();
  const [period, setPeriod] = useState<Period>("week");
  const [r] = useCached<Awaited<ReturnType<typeof V.report>>>(me ? `report:${me.venue.id}:${period}` : null, () => V.report(me!.venue.id, period));
  const [x] = useCached<Awaited<ReturnType<typeof V.insights>>>(me ? `insights:${me.venue.id}:${period}` : null, () => V.insights(me!.venue.id, period));
  const max = Math.max(1, ...(r?.bars.map((b) => b.amount) ?? [1]));
  const maxI = r ? r.bars.findIndex((b) => b.amount === max) : -1;
  const label = (l: string) => (period === "week" ? DOW[new Date(l).getDay()] : period === "all" ? ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"][Number(l.slice(5, 7)) - 1] : l);
  const vs = period === "week" ? "өткен аптамен" : period === "month" ? "өткен аймен" : "";
  if (me && me.role !== "owner") return <NoAccess />;
  const busyH = x && x.load.total ? x.load.hours.indexOf(Math.max(...x.load.hours)) : -1;
  const busyD = x && x.load.total ? x.load.weekdays.indexOf(Math.max(...x.load.weekdays)) : -1;
  const quietD = x && x.load.total ? x.load.weekdays.indexOf(Math.min(...x.load.weekdays)) : -1;
  const sk = <Sk h={96} />;
  const m = r?.money ?? null; // ескі сервер (жаңарту кезінде) бұл өрісті бермеуі мүмкін
  return (
    <VPage tab="report">
      <h1 className={s.h1}>Есеп</h1>
      <VSticker name="money" size={108} at={[284, 126]} />
      {/* Ақша: клиент бірлікті қолданғанда мекеме үлесі есептеледі; Басқару аударымды тіркегенде ғана «аударылды» (0033) */}
      <div className={`${s.hero} ${s.green}`} style={{ minHeight: 150 }}>
        <span className={s.heroLabel}>Сізге аударылады</span>
        <span className={s.heroBig}>{m ? money(m.due) : "–"}</span>
        <span className={s.heroLabel} style={{ fontSize: 13 }}>{m ? `Есептелді ${money(m.earned)} · Аударылды ${money(m.paid)}` : "\u00a0"}</span>
        <span className={s.heroPill}>{!r ? "…" : r.testMode ? "Сынақ режимі" : m?.paidThrough ? `${dayMonth(m.paidThrough)} күніне дейін аударылды` : "Әлі аударым болған жоқ"}</span>
      </div>
      <div className={s.seg}>
        {([["week", "Апта"], ["month", "Ай"], ["all", "Барлығы"]] as const).map(([k, t]) => <button key={k} className={`${s.segBtn} ${period === k ? s.segOn : ""}`} onClick={() => { haptic.select(); setPeriod(k); }}>{t}</button>)}
      </div>
      <div className={s.chart}>
        <div className={s.chartHead}><b className={s.lead}>Табыс</b><span style={{ display: "flex", alignItems: "center", gap: 8 }}>{r && <Delta now={r.total} prev={r.prevTotal} />}<span className={s.chartSum}>{r ? money(r.total) : "–"}</span></span></div>
        <div className={s.bars}>
          {(r?.bars ?? Array.from({ length: 7 }, (_, i) => ({ label: String(i), amount: 0 }))).map((b, i) => (
            <div key={i} className={`${s.barCol} ${i === maxI && b.amount ? s.max : ""}`}><i style={{ height: `${Math.max(12, (b.amount / max) * 100)}%` }} /><span>{r ? label(b.label) : ""}</span></div>
          ))}
        </div>
        {r && <span className={s.statSub} style={{ display: "block", marginTop: 10 }}>{`Бүгін: ${money(r.today)} · комиссия ${r.feePct}%${vs ? ` · пайыз ${vs} салыстырғанда` : ""}`}</span>}
      </div>

      <div className={s.sectionHead}><h2 className={s.blueHead}>Клиенттер</h2></div>
      {!x ? sk : <div className={s.stats}>
        <Stat label="Сатып алушы" value={String(x.customers.buyers)} delta={<Delta now={x.customers.buyers} prev={x.customers.buyersPrev} />} />
        <Stat label="Жаңа клиент" value={String(x.customers.newBuyers)} delta={<Delta now={x.customers.newBuyers} prev={x.customers.newPrev} />} sub="Сізден алғаш пакет алғандар" />
        <Stat label="Қайта келген" value={String(x.customers.returning)} sub="Бұрын да пакет алған" />
        <Stat label="Қайта сатып алу" value={pctText(x.customers.repeatRate)} sub={`${x.customers.everBuyers} клиенттің екінші пакет алғаны`} />
        <Stat label="Келген клиент" value={String(x.customers.visitors)} delta={<Delta now={x.customers.visitors} prev={x.customers.visitorsPrev} />} sub="Пакетін қолданғандар" />
        <Stat label="Рейтинг" value={stars(x.rating.all)} sub={x.rating.periodReviews ? `Кезеңде ${stars(x.rating.period)} · ${x.rating.periodReviews} баға` : `${x.rating.reviews} пікір`} />
      </div>}

      <div className={s.sectionHead}><h2 className={s.blueHead}>Алдын ала ақша</h2></div>
      {!x ? sk : <div className={s.stats}>
        <Stat label="Сатылған пакет" value={String(x.money.packs)} delta={<Delta now={x.money.packs} prev={x.money.packsPrev} />} />
        <Stat label="Алдын ала сатылды" value={money(x.money.prepaid)} delta={<Delta now={x.money.prepaid} prev={x.money.prepaidPrev} />} sub="Сіздің үлесіңіз, комиссиясыз" />
        <Stat label="Қызмет көрсету керек" value={money(x.money.liability)} sub={`${x.money.unitsLeft} бірлік · ${x.money.activePacks} белсенді пакет`} />
        <Stat label="Мерзімі өтті" value={money(x.money.expiredValue)} sub={`${x.money.expiredUnits} бірлік клиентке бонус болды`} />
      </div>}

      {x && x.offers.length > 0 && <>
        <div className={s.sectionHead}><h2 className={s.blueHead}>Ұсыныстар</h2></div>
        <div className={s.card}>
          {x.offers.map((o) => (
            <button key={o.id} className={s.row} style={{ ["--inset" as string]: "16px" }} onClick={() => { haptic.tap(); go(`/v/offers/${o.id}`); }}>
              <span className={s.rowText}>
                <span className={s.rowTitle}>{o.title}</span>
                <span className={s.rowSub} style={{ whiteSpace: "normal" }}>{`${o.packs} пакет · ${o.uses} қолдану · пайдаланылды ${pctText(o.utilization)} · қайта алу ${pctText(o.repeatRate)}`}</span>
              </span>
              <b className={s.lead}>{money(o.prepaid)}</b>
            </button>
          ))}
        </div>
      </>}

      <div className={s.sectionHead}><h2 className={s.blueHead}>Жүктеме</h2></div>
      {!x ? sk : x.load.total === 0 ? <div className={s.card}><div className={s.row}><span className={s.rowSub}>Бұл кезеңде қолдану болған жоқ</span></div></div> : <>
        <div className={s.chart}>
          <div className={s.chartHead}><b className={s.lead}>Апта күндері</b><span className={s.statSub}>{`Ең көп: ${DOW_ISO[busyD]} · ең аз: ${DOW_ISO[quietD]}`}</span></div>
          <LoadBars values={x.load.weekdays} labels={DOW_ISO} />
        </div>
        <div className={s.chart}>
          <div className={s.chartHead}><b className={s.lead}>Сағаттар</b><span className={s.statSub}>{`Қарбалас: ${String(busyH).padStart(2, "0")}:00–${String((busyH + 1) % 24).padStart(2, "0")}:00`}</span></div>
          <LoadBars values={x.load.hours} labels={x.load.hours.map((_, h) => String(h).padStart(2, "0"))} every={3} />
        </div>
        <div className={s.note}>Бос сағаттарға жеңілдік қойсаңыз (ұсыныс → «Бос сағат жеңілдігі»), клиенттер сол уақытқа келеді, кезек азаяды.</div>
      </>}

      <div className={s.sectionHead}><h2 className={s.blueHead}>Төлемдер</h2><button className={s.link} onClick={() => go("/v/expired")}>Мерзімі өткен пакеттер</button></div>
      <div className={s.card}>
        {r === null ? <div className={s.row}><Sk h={40} /></div> : r.days.length === 0 ? <div className={s.row}><span className={s.rowSub}>Әзірге төлем жоқ</span></div>
          : r.days.map((d) => (
            <div key={d.date} className={s.row} style={{ ["--inset" as string]: "16px" }}>
              <span className={s.rowText}><span className={s.rowTitle}>{dayMonth(d.date)}</span><span className={s.rowSub}>{`${d.count} қолдану`}</span></span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}><b className={s.lead}>{money(d.amount)}</b>
                <span className={`${s.tag} ${d.status === "paid" ? s.tagGreen : s.tagYellow}`}>{d.status === "paid" ? "Аударылды" : "Күтуде"}</span></span>
            </div>
          ))}
      </div>
      {r && (r.payouts?.length ?? 0) > 0 && <>
        <div className={s.sectionHead}><h2 className={s.blueHead}>Аударымдар</h2></div>
        <div className={s.card}>
          {r.payouts.map((p) => (
            <div key={p.id} className={s.row} style={{ ["--inset" as string]: "16px" }}>
              <span className={s.rowText}><span className={s.rowTitle}>{dayMonth(p.paidAt)}</span><span className={s.rowSub}>{`${dayMonth(p.from)} — ${dayMonth(p.to)}${p.ref ? ` · ${p.ref}` : ""}`}</span></span>
              <b className={s.lead}>{money(p.amount)}</b>
            </div>
          ))}
        </div>
      </>}
    </VPage>
  );
}

export function VMenu() {
  const go = useGo();
  const me = useCurrent();
  if (!me) return <VPage back><Sk h={160} /></VPage>;
  const owner = me.role === "owner";
  const rows: { e: string; t: string; sub?: string; on: () => void; hide?: boolean }[][] = [[
    { e: "v:venue", t: "Мекеме профилі", on: () => go("/v/profile"), hide: !owner },
    { e: "v:branch", t: "Филиалдар", sub: `${me.venue.branchesTotal} филиал`, on: () => go("/v/branches"), hide: me.role === "cashier" },
    { e: "v:team", t: "Команда", on: () => go("/v/team"), hide: me.role === "cashier" },
    { e: "v:orders", t: "Алдын ала тапсырыстар", on: () => go("/v/orders") },
    { e: "v:complaint", t: "Шағымдар", on: () => go("/v/complaints"), hide: me.role === "cashier" },
    { e: "v:expired", t: "Мерзімі өткен пакеттер", on: () => go("/v/expired"), hide: me.role === "cashier" },
    { e: "v:integration", t: "Интеграция", on: soon, hide: !owner },
    { e: "v:reviews", t: "Пікірлер", sub: `${me.venue.reviews} пікір`, on: () => go("/v/reviews"), hide: me.role === "cashier" },
  ], [
    { e: "v:guide", t: "Кассаға нұсқау", on: () => go("/v/guide") },
    { e: "v:settings", t: "Баптаулар", on: () => go("/v/settings") },
    { e: "v:support", t: "Қолдау", on: () => go("/v/support") },
    { e: "v:client", t: "Клиент режиміне өту", on: () => go("/", "fade") },
  ]];
  return (
    <VPage back>
      <VSticker name="city" size={96} at={[286, 110]} />
      <div className={s.cover}>
        {me.venue.coverUrl && <img className={s.coverImg} src={me.venue.coverUrl} alt="" />}
        <span className={s.coverLogo}>{me.venue.logoUrl ? <img src={me.venue.logoUrl} alt="" /> : me.venue.name.slice(0, 1)}</span>
      </div>
      <h1 className={s.h1}>{me.venue.name}</h1>
      <div className={s.pills}>
        {me.venue.rating && <span className={s.rating}>{`★ ${me.venue.rating.toFixed(1).replace(".", ",")} • ${me.venue.reviews} пікір`}</span>}
        <span className={s.tag}>{roleName[me.role]}</span>
      </div>
      {rows.map((g, i) => (
        <div key={i} className={s.card}>
          {g.filter((r) => !r.hide).map((r) => (
            <button key={r.t} className={s.row} style={{ minHeight: 56 }} onClick={() => { haptic.tap(); r.on(); }}>
              <Tile e={r.e} size={36} />
              <span className={s.rowText}><span className={s.rowTitle}>{r.t}</span>{r.sub && <span className={s.rowSub}>{r.sub}</span>}</span>
              <i className={s.arrow} />
            </button>
          ))}
        </div>
      ))}
    </VPage>
  );
}

/** Figma «13 · Рұқсат жоқ» (14012:9822): stop стикері 120, тақырып, түсініктеме, «Кассир режимі» */
export function NoAccess() {
  const go = useGo();
  return (
    <VPage>
      <div className={s.state} style={{ top: "calc(351px + var(--top-shift))" }}>
        <VSticker name="stop" size={120} />
        <h2 className={s.stateTitle}>Қолжетімділік жоқ</h2>
        <p className={s.stateText}>Бұл бөлім тек иесіне немесе басқарушыға ашық. Кассир рөлі үшін «Кассир» бөлімі қолжетімді.</p>
      </div>
      <Buttons main={{ text: "Кассир режимі", onClick: () => go("/v/cashier", "fade") }} />
    </VPage>
  );
}
