// Figma «06 · Ұсыныстар: тізім» (14007:7999), «09 · Есеп» (14011:7999), «12 · Мәзір» (14012:9086).
import { useCallback, useEffect, useState } from "react";
import { useGo } from "../nav";
import { haptic, nativeAlert, nativePick, openChat } from "../telegram";
import { Switch } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { SUPPORT_BOT } from "../config";
import { dayMonth, money, roleName, useCurrent, V, type VOffer } from "./api";
import { Buttons, OfferPic, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

const soon = () => nativeAlert("Бұл бөлім келесі кезеңде қосылады.");

export function VOffers() {
  const go = useGo();
  const me = useCurrent();
  const [list, setList] = useState<VOffer[] | null>(null);
  const [tab, setTab] = useState<"active" | "draft" | "archive">("active");
  const load = useCallback(() => { if (me) V.offers(me.venue.id).then(setList).catch(() => setList([])); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const of = (t: typeof tab) => (list ?? []).filter((o) => (t === "active" ? o.status === "active" || o.status === "paused" : t === "draft" ? o.status === "draft" || o.status === "review" : o.status === "ended"));
  async function toggle(o: VOffer, on: boolean) {
    if (!me) return;
    if (!on) {
      const r = await nativePick("Ұсынысты тоқтату?", "Жаңа клиенттер сатып ала алмайды. Сатылған пакеттер жарамды болып қалады.", [{ id: "no", text: "Жоқ" }, { id: "yes", text: "Тоқтату" }], "yes");
      if (r !== "yes") return;
    }
    setList((l) => l?.map((x) => (x.id === o.id ? { ...x, status: on ? "active" : "paused" } : x)) ?? l);
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
              <div className={s.ocBottom}><span className={s.ocPrice}>{money(o.fromPrice)}-дан</span><span className={s.rowSub}>{o.sold} пакет сатылды</span></div>
            </div>
          );
        })}
      {me?.role !== "cashier" && <button className={s.fab} onClick={() => go("/v/offers/new")}><span style={{ fontSize: 24, lineHeight: 1 }}>+</span>Құру</button>}
    </VPage>
  );
}

const DOW = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"];
export function VReport() {
  const me = useCurrent();
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  const [r, setR] = useState<Awaited<ReturnType<typeof V.report>> | null>(null);
  useEffect(() => { if (me) { setR(null); V.report(me.venue.id, period).then(setR).catch(() => null); } }, [me?.venue.id, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...(r?.bars.map((b) => b.amount) ?? [1]));
  const maxI = r ? r.bars.findIndex((b) => b.amount === max) : -1;
  const label = (l: string) => (period === "week" ? DOW[new Date(l).getDay()] : period === "all" ? ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"][Number(l.slice(5, 7)) - 1] : l);
  if (me && me.role !== "owner") return <NoAccess />;
  return (
    <VPage tab="report">
      <h1 className={s.h1}>Есеп</h1>
      <VSticker name="money" size={108} at={[284, 126]} />
      <div className={`${s.hero} ${s.green}`} style={{ minHeight: 150 }}>
        <span className={s.heroLabel}>Бүгін мекеме шотына түсті</span>
        <span className={s.heroBig}>{r ? money(r.today) : "–"}</span>
        <span className={s.heroPill}>{r?.testMode ? "Сынақ режимі" : "Түсті"}</span>
        <span className={s.heroLabel} style={{ fontSize: 13 }}>{r?.testMode ? "Шот әлі тіркелмеген" : "Шот"}</span>
      </div>
      <div className={s.seg}>
        {([["week", "Апта"], ["month", "Ай"], ["all", "Барлығы"]] as const).map(([k, t]) => <button key={k} className={`${s.segBtn} ${period === k ? s.segOn : ""}`} onClick={() => { haptic.select(); setPeriod(k); }}>{t}</button>)}
      </div>
      <div className={s.chart}>
        <div className={s.chartHead}><b className={s.lead}>Табыс</b><span className={s.chartSum}>{r ? money(r.total) : "–"}</span></div>
        <div className={s.bars}>
          {(r?.bars ?? Array.from({ length: 7 }, (_, i) => ({ label: String(i), amount: 0 }))).map((b, i) => (
            <div key={i} className={`${s.barCol} ${i === maxI && b.amount ? s.max : ""}`}><i style={{ height: `${Math.max(12, (b.amount / max) * 100)}%` }} /><span>{r ? label(b.label) : ""}</span></div>
          ))}
        </div>
      </div>
      <h2 className={s.blueHead}>Төлемдер</h2>
      <div className={s.card}>
        {r === null ? <div className={s.row}><Sk h={40} /></div> : r.days.length === 0 ? <div className={s.row}><span className={s.rowSub}>Әзірге төлем жоқ</span></div>
          : r.days.map((d) => (
            <div key={d.date} className={s.row} style={{ ["--inset" as string]: "16px" }}>
              <span className={s.rowText}><span className={s.rowTitle}>{dayMonth(d.date)}</span><span className={s.rowSub}>{d.count} қолдану</span></span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}><b className={s.lead}>{money(d.amount)}</b><span className={`${s.tag} ${s.tagGreen}`}>Түсті</span></span>
            </div>
          ))}
      </div>
    </VPage>
  );
}

export function VMenu() {
  const go = useGo();
  const me = useCurrent();
  if (!me) return <VPage back><Sk h={160} /></VPage>;
  const owner = me.role === "owner";
  const rows: { e: string; t: string; sub?: string; on: () => void; hide?: boolean }[][] = [[
    { e: "v:venue", t: "Мекеме профилі", on: soon, hide: !owner },
    { e: "v:branch", t: "Филиалдар", sub: `${me.venue.branchesTotal} филиал`, on: soon },
    { e: "v:team", t: "Команда", on: () => go("/v/team"), hide: me.role === "cashier" },
    { e: "v:orders", t: "Алдын ала тапсырыстар", on: () => go("/v/orders") },
    { e: "v:integration", t: "Интеграция", on: soon, hide: !owner },
    { e: "v:reviews", t: "Пікірлер", sub: `${me.venue.reviews} пікір`, on: soon },
  ], [
    { e: "v:guide", t: "Кассаға нұсқау", on: () => nativeAlert("1) «Кассир» → клиенттің пакетін таңда.\n2) «QR шығар» — клиент Jazl+ сканерімен оқиды.\n3) Қосымша тауарды клиент кассада бөлек төлейді.") },
    { e: "v:settings", t: "Баптаулар", on: soon },
    { e: "v:support", t: "Қолдау", on: () => openChat(SUPPORT_BOT) },
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
        {me.venue.rating && <span className={s.rating}>★ {me.venue.rating.toFixed(1).replace(".", ",")} • {me.venue.reviews} пікір</span>}
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
