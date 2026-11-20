// Figma «04 · Басты (иесі)» 14003:8463 және «05 · Кассир: басты (кассир рөлі)» 14015:8993.
import { useCallback, useEffect, useState } from "react";
import { useGo } from "../nav";
import { haptic, nativePick } from "../telegram";
import { Tile } from "../ui/Tile";
import { hm, isToday, money, roleName, useCached, useCurrent, V, type Dashboard, type Use } from "./api";
import { OfferPic, Sk, VPage, VSticker } from "./ui";
import qrGlyph from "../assets/glyphs/qr-code.svg";
import { achievementFor, NewVenueHome, Suspended } from "./States";
import s from "./V.module.css";

const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];

function useDashboard(branch?: string) {
  const me = useCurrent();
  const [d, , load] = useCached<Dashboard>(me ? `dash:${me.venue.id}:${branch ?? ""}` : null, () => V.dashboard(me!.venue.id, branch));
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);
  return d;
}

/** 7 күндік сызық (көк карточканың астында) */
function Spark({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [8 + (i * 264) / (data.length - 1), 40 - (v / max) * 28] as const);
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className={s.spark} viewBox="0 0 380 46" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,46 ${line} ${last[0]},46`} fill="rgba(255,255,255,0.16)" />
      <polyline points={line} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="4.5" fill="#fff" />
    </svg>
  );
}

/** Қолдану жолы. home — «Тауық донері · 1 бірлік / Айгерім Н. • 14:32 • филиал»; cashier — «Тауық донері / 14:32 • Айгерім Н.»;
 *  history — «Тауық донері [Тапсырыс] / Айгерім Н. • 14:32 • Сканер» (Figma 14003:8463, 14015:8993, 14010:8003) */
export function UseRow({ u, kind, onClick, variant }: { u: Use; kind: "food" | "coffee" | "hair"; onClick?: () => void; variant: "home" | "cashier" | "history" }) {
  const Tag = onClick ? "button" : "div";
  const name = u.title.split(" · ")[0];
  const sub = variant === "home" ? `${u.customer} • ${hm(u.at)} • ${u.branch.split(",")[0]}` : variant === "cashier" ? `${hm(u.at)} • ${u.customer}`
    : `${u.customer} • ${hm(u.at)} • ${u.kind === "order" ? "Тапсырыс №" + u.orderNo : "Сканер"}`;
  return (
    <Tag className={s.row} onClick={onClick}>
      <span className={s.ic}><OfferPic kind={kind} size={26} /></span>
      <span className={s.rowText}>
        <span className={s.rowTitle}>{name}{variant === "home" ? ` · ${u.units} бірлік` : u.units > 1 ? ` × ${u.units}` : ""}
          {variant === "history" && u.kind === "order" && <span className={s.tag}>Тапсырыс</span>}{u.cancelled && <span className={`${s.tag} ${s.tagRed}`}>Қайтарылды</span>}</span>
        <span className={s.rowSub}>{sub}</span>
      </span>
      {u.cancelled ? <span className={`${s.plus} ${s.gray}`}>Қайтарылды</span> : <span className={s.plus}>+{money(u.venueAmount)}</span>}
    </Tag>
  );
}

export function VHome() {
  const go = useGo();
  const me = useCurrent();
  const [branch, setBranch] = useState<string | undefined>();
  const d = useDashboard(branch);
  // Жетістік (100-ші қолдану, рекорд күн) — бір рет қана
  useEffect(() => { if (me && d) void achievementFor(me.venue.id, d as Parameters<typeof achievementFor>[1]).then((to) => to && go(to, "up")); }, [d?.total, me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <VPage tab="home"><Sk h={200} /></VPage>;
  if (me.venue.status === "paused") return <Suspended note={me.venue.statusNote ?? null} />;
  if (d && (d as Dashboard & { offers: number }).offers === 0) return <NewVenueHome d={d as Parameters<typeof NewVenueHome>[0]["d"]} />;
  const complaintsN = (d as (Dashboard & { complaints?: number }) | null)?.complaints ?? 0;
  const now = new Date();
  const diff = d ? d.today - d.yesterday : 0;
  const pct = d && d.revenueYesterday ? Math.round(((d.revenueToday - d.revenueYesterday) / d.revenueYesterday) * 100) : null;
  const branchName = branch ? me.branches.find((b) => b.id === branch)?.address : me.branches.length > 1 ? "Барлық филиал" : me.branches[0]?.address;
  async function pickBranch() {
    if (me!.branches.length < 2) return;
    const opts = [{ id: "all", text: "Барлық филиал" }, ...me!.branches.slice(0, 2).map((b) => ({ id: b.id, text: b.address }))];
    const id = await nativePick("Филиал", "Қай филиалдың көрсеткіштері?", opts, "all");
    if (id) { haptic.select(); setBranch(id === "all" ? undefined : id); }
  }
  return (
    <VPage tab="home">
      <div className={s.head}>
        <button className={s.avatar} onClick={() => go("/v/menu")} aria-label="Мәзір">{me.venue.logoUrl ? <img src={me.venue.logoUrl} alt="" /> : me.venue.name.slice(0, 1)}</button>
        <button className={s.headText} onClick={() => void pickBranch()}>
          <span className={s.headName}>{me.venue.name}</span>
          <span className={s.headSub}>{branchName}{me.branches.length > 1 && <i className={s.chev} />}</span>
        </button>
        <button className={s.bell} onClick={() => go("/v/orders")} aria-label="Тапсырыстар"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-strong)" }}><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg></button>
      </div>

      <VSticker name="chart" size={96} at={[292, 142]} once />
      <button className={s.hero} onClick={() => go("/v/history")}>
        <span className={s.heroLabel}>{`Бүгін, ${now.getDate()} ${MON[now.getMonth()]}`}</span>
        <span className={s.heroBig}>{d ? d.today : "–"}<small>қолдану</small></span>
        {d && <span className={s.heroPill}>{diff >= 0 ? `▲ кешегіден ${diff} артық` : `▼ кешегіден ${-diff} кем`}</span>}
        <span style={{ height: 10 }} />
        {d && <Spark data={d.series} />}
        <span className={s.sparkLabel}>7 күн</span>
      </button>

      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>Түскен сома</span>
          <span className={s.statNum}>{d ? money(d.revenueToday) : <Sk w={110} h={28} />}</span>
          {pct !== null && <span className={`${s.up} ${pct < 0 ? s.down : ""}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>}
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Белсенді пакет</span>
          <span className={s.statNum}>{d ? d.activePacks : <Sk w={60} h={28} />}</span>
          {d && <span className={s.statSub}>{`${d.unitsLeft} бірлік қалды`}</span>}
        </div>
      </div>

      <div className={s.quick}>
        <button className={s.qa} onClick={() => go("/v/cashier")}><Tile e="v:cashier" size={40} />Кассир</button>
        <button className={s.qa} onClick={() => go("/v/offers")}><Tile e="v:offer" size={40} />Ұсыныс</button>
        <button className={s.qa} onClick={() => go(me.role === "owner" ? "/v/team/invite" : "/v/team")}><Tile e="v:invite" size={40} />Шақыру</button>
        <button className={s.qa} onClick={() => go(me.role === "owner" ? "/v/report" : "/v/history")}><Tile e="v:report" size={40} />Есеп</button>
      </div>

      {complaintsN > 0 && <button className="t-sub2 infoBox infoWarn" style={{ textAlign: "left" }} onClick={() => go("/v/complaints")}>{`${complaintsN} жаңа шағым: 24 сағат ішінде жауап беріңіз →`}</button>}
      <div className={s.sectionHead}><h2 className={s.sectionTitle}>Соңғы қолданулар</h2><button className={s.link} onClick={() => go("/v/history")}>Барлығы</button></div>
      <div className={s.card}>
        {d === null ? <div className={s.row}><Sk h={40} /></div> : d.recent.length === 0 ? <div className={s.row}><span className={s.rowSub}>Бүгін әзірге қолдану жоқ</span></div>
          : d.recent.map((u) => <UseRow key={u.id} u={u} kind={me.venue.kind} variant="home" onClick={() => go(u.kind === "order" ? `/v/orders/${u.id}` : "/v/history")} />)}
      </div>
    </VPage>
  );
}

export function VCashier() {
  const go = useGo();
  const me = useCurrent();
  const d = useDashboard();
  const pay = useCallback(() => { haptic.medium(); go("/v/pay"); }, [go]);
  if (!me) return <VPage tab="cashier"><Sk h={200} /></VPage>;
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const myName = u?.first_name ? `${u.first_name}${u.last_name ? " " + u.last_name.slice(0, 1) + "." : ""}` : roleName[me.role];
  const branchLine = me.branches.length === 1 ? me.branches[0].address : `${me.branches.length} филиал`;
  const todayList = d?.recent.filter((x) => isToday(x.at)) ?? [];
  return (
    <VPage tab="cashier">
      <div className={s.head}>
        <span className={s.avatar} style={{ background: "#8e7cf3" }}>{u?.photo_url ? <img src={u.photo_url} alt="" /> : myName.slice(0, 1)}</span>
        <span className={s.headText}><span className={s.headName}>{myName}</span><span className={s.headSub}>{roleName[me.role]} • {branchLine}</span></span>
        {me.role !== "cashier" && <button className={s.link} onClick={() => go("/v/home")}>Басты</button>}
      </div>
      <VSticker name="race" size={104} at={[284, 208]} once />
      <button className={`${s.hero} ${s.cashier}`} onClick={pay}>
        <span className={s.heroIcon}><span style={{ maskImage: `url(${JSON.stringify(qrGlyph)})`, WebkitMaskImage: `url(${JSON.stringify(qrGlyph)})` }} /></span>
        <span className={s.heroTitle}>Төлем қабылдау</span>
        <span className={s.heroSub}>Пакетті таңда, QR шығар</span>
      </button>
      <div className={s.stats}>
        <div className={s.stat}><span className={s.statLabel}>Бүгін қолдану</span><span className={s.statNum}>{d ? d.cashierToday : <Sk w={40} h={28} />}</span></div>
        <div className={s.stat}><span className={s.statLabel}>Түскен сома</span><span className={s.statNum}>{d ? money(d.cashierRevenue) : <Sk w={110} h={28} />}</span></div>
      </div>
      <div className={s.sectionHead}><h2 className={s.sectionTitle}>Соңғы төлемдер</h2><button className={s.link} onClick={() => go("/v/history")}>Тарих</button></div>
      <div className={s.card}>
        {d === null ? <div className={s.row}><Sk h={40} /></div> : todayList.length === 0 ? <div className={s.row}><span className={s.rowSub}>Бүгін әзірге төлем болған жоқ</span></div>
          : todayList.map((x) => <UseRow key={x.id} u={x} kind={me.venue.kind} variant="cashier" />)}
      </div>
    </VPage>
  );
}
