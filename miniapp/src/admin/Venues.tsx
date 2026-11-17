// Figma «03 · Мекемелер» (14063:9710): Мекемелер (іздеу, сүзгі), Өтінімдер, Өтінім беті, Қайтару себебі, Өтінім бекітілді,
// Мекеме картасы, Комиссияны өзгерту, Мекемені тоқтату, Ішкі жазбалар.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, nativeAlert, openExternal } from "../telegram";
import { Tile } from "../ui/Tile";
import { API_URL } from "../api";
import { useCached } from "../venue/api";
import { Buttons, Note, Person, Sheet, Sk, VPage, VSticker } from "../venue/ui";
import { A, ago, dayMonth, money, post, when } from "./api";
import { Empty, Field, Growth, PinSheet, RadioRow } from "./ui";
import { useDesk } from "./Desk";
import v from "../venue/V.module.css";
import s from "./A.module.css";

interface VRow { id: string; name: string; kind: string; kindName: string; city: string; status: string; rating: number | null; reviews: number; branches: number; sales30: number }
interface AppRow { id: string; name: string | null; kind: string; kindName: string; submitted_at: string | null; bin?: string; status?: string; form?: string; note?: string | null }
const statusTag: Record<string, [string, string]> = { active: ["Белсенді", "tagGreen"], paused: ["Тоқтатылған", "tagYellow"], closed: ["Жабық", "tagGray"], app: ["Өтінім", ""] };

export function AVenues() {
  const go = useGo();
  const desk = useDesk();
  const sel = useParams().id;
  const [q, setQ] = useState(() => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("q") ?? "");
  const [qq, setQq] = useState("");
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const [f, setF] = useState<"all" | "active" | "app" | "paused">("all");
  const [d] = useCached<{ venues: VRow[]; applications: AppRow[] }>(`a:venues:${qq}`, () => A(`/venues?q=${encodeURIComponent(qq)}`));
  const list = d?.venues ?? []; const apps = d?.applications ?? [];
  const n = { all: list.length + apps.length, active: list.filter((x) => x.status === "active").length, app: apps.length, paused: list.filter((x) => x.status === "paused").length };
  const shown = f === "app" ? [] : list.filter((x) => f === "all" || x.status === f);
  return (
    <VPage nav>
      <h1 className={v.h1}>Мекемелер</h1>
      <p className={s.sub}>{d ? `${list.length} мекеме · ${n.active} белсенді` : " "}</p>
      <label className={s.search}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Атауы, БСН немесе қала" /></label>
      <div className={s.chipsWrap}>{([["all", "Барлығы"], ["active", "Белсенді"], ["app", "Өтінім"], ["paused", "Тоқтатылған"]] as const).map(([k, t]) => (
        <button key={k} className={`${v.chip} ${f === k ? v.chipOn : ""}`} onClick={() => { haptic.select(); setF(k); }}>{t} {d ? n[k] : ""}</button>
      ))}</div>
      {d && desk && shown.length + (f === "all" || f === "app" ? apps.length : 0) > 0 ? (
        // Figma «Мекемелер / Desktop»: кесте (Мекеме · Санат · Күйі · Рейтинг · Сатылым, 30 күн)
        <table className={s.table}>
          <thead><tr><th>Мекеме</th><th>Санат</th><th>Күйі</th><th>Рейтинг</th><th className={s.num}>Сатылым, 30 күн</th></tr></thead>
          <tbody>
            {shown.map((x) => { const [t, k] = statusTag[x.status] ?? statusTag.active; return (
              <tr key={x.id} className={sel === x.id ? s.sel : ""} onClick={() => go(`/a/venues/${x.id}`)}>
                <td><b>{x.name}</b><small>{x.branches} филиал</small></td><td>{x.kindName}</td><td><span className={`${v.tag} ${v[k]}`}>{t}</span></td>
                <td>{x.rating ? `★ ${x.rating.toFixed(1).replace(".", ",")}` : "—"}</td><td className={s.num}>{money(x.sales30)}</td>
              </tr>); })}
            {(f === "all" || f === "app") && apps.map((a) => (
              <tr key={a.id} onClick={() => go(`/a/apps/${a.id}`)}>
                <td><b>{a.name ?? "Атаусыз"}</b><small>{a.submitted_at ? when(a.submitted_at, false) + " түсті" : ""}</small></td><td>{a.kindName}</td><td><span className={v.tag}>Өтінім</span></td><td>—</td><td className={s.num}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !d ? <Sk h={260} /> : shown.length + (f === "all" || f === "app" ? apps.length : 0) === 0 ? (
        <div className={v.result}><VSticker name="search" size={100} /><h2 className={v.stateTitle}>Ештеңе табылмады</h2><p className={v.stateText}>Атауын не БСН-ді тексеріп, қайта іздеңіз.</p></div>
      ) : (
        <div className={v.card}>
          {shown.map((x) => { const [t, k] = statusTag[x.status] ?? statusTag.active; return (
            <button key={x.id} className={v.row} style={{ minHeight: 64 }} onClick={() => go(`/a/venues/${x.id}`)}>
              <Person name={x.name} size={40} />
              <span className={v.rowText}><span className={v.rowTitle}>{x.name}<span className={`${v.tag} ${v[k]}`}>{t}</span></span><span className={v.rowSub}>{x.kindName} · {x.branches} филиал{x.rating ? ` · ★ ${x.rating.toFixed(1).replace(".", ",")}` : ""}</span></span>
              <span className={s.right}><b>{money(x.sales30)}</b><span>30 күнде</span></span>
            </button>); })}
          {(f === "all" || f === "app") && apps.map((a) => (
            <button key={a.id} className={v.row} style={{ minHeight: 64 }} onClick={() => go(`/a/apps/${a.id}`)}>
              <Person name={a.name ?? "?"} size={40} />
              <span className={v.rowText}><span className={v.rowTitle}>{a.name ?? "Атаусыз"}<span className={v.tag}>Өтінім</span></span><span className={v.rowSub}>{a.kindName} · {a.submitted_at ? when(a.submitted_at, false) + " түсті" : ""}</span></span>
              <i className={v.arrow} />
            </button>
          ))}
        </div>
      )}
    </VPage>
  );
}

interface VCard { id: string; name: string; kind: string; kindName: string; city: string; status: string; statusNote: string | null; createdAt: string; rating: number | null; reviews: number; feePct: number; feeCustom: boolean;
  sales30: number; salesGrowth: number | null; fee30: number; complaintShare: number; branches: number; offers: number; team: number; complaints: number; notes: number; activePacks: number; eligible8: boolean }
export function AVenue() {
  const go = useGo();
  const { id = "" } = useParams();
  const [d, , reload] = useCached<{ venue: VCard }>(`a:venue:${id}`, () => A(`/venues/${id}`));
  const [sheet, setSheet] = useState<"fee" | "stop" | "msg" | null>(null);
  const x = d?.venue;
  if (!x) return <VPage title="Мекеме" back><Sk h={80} /><Sk h={200} /></VPage>;
  const [t, k] = statusTag[x.status] ?? statusTag.active;
  const rows = [
    { e: "a:fee", t: "Комиссия", r: `${x.feePct}%`, on: () => setSheet("fee") },
    { e: "a:branches", t: "Филиалдар", r: String(x.branches), on: () => go(`/a/venues/${id}/branches`) },
    { e: "a:offers", t: "Ұсыныстар", r: `${x.offers} белсенді`, on: () => go(`/a/offers?venue=${id}&tab=active`) },
    { e: "a:team", t: "Команда", r: `${x.team} адам`, on: () => go(`/a/venues/${id}/team`) },
    { e: "a:complaints", t: "Шағымдар тарихы", r: String(x.complaints), on: () => go(`/a/complaints?venue=${id}&tab=done`) },
    { e: "a:notes", t: "Ішкі жазбалар", r: String(x.notes), on: () => go(`/a/venues/${id}/notes`) },
  ];
  return (
    <VPage title="Мекеме" back>
      <div className={v.card}><div className={v.row} style={{ minHeight: 70 }}>
        <Person name={x.name} size={44} />
        <span className={v.rowText}><span className={v.rowTitle} style={{ fontSize: 19 }}>{x.name}<span className={`${v.tag} ${v[k]}`}>{t}</span></span><span className={v.rowSub}>{x.kindName} · Қарағанды · {dayMonth(x.createdAt)}-ден бері</span></span>
      </div></div>
      {x.status !== "active" && x.statusNote && <Note tone="warn">Себебі: {x.statusNote}</Note>}
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Сатылым, 30 күн</span><span className={v.statNum}>{money(x.sales30)}</span><Growth v={x.salesGrowth} /></div>
        <div className={v.stat}><span className={v.statLabel}>Комиссия, 30 күн</span><span className={v.statNum}>{money(x.fee30)}</span><span className={v.tag} style={{ alignSelf: "flex-start" }}>{x.feePct}%</span></div>
      </div>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Рейтинг</span><span className={v.statNum}>★ {x.rating ? x.rating.toFixed(1).replace(".", ",") : "—"}</span><span className={`${v.tag} ${v.tagGray}`} style={{ alignSelf: "flex-start" }}>{x.reviews} пікір</span></div>
        <div className={v.stat}><span className={v.statLabel}>Шағым үлесі</span><span className={v.statNum}>{String(x.complaintShare).replace(".", ",")}%</span><span className={`${v.tag} ${x.complaintShare > 5 ? v.tagRed : v.tagGreen}`} style={{ alignSelf: "flex-start" }}>{x.complaintShare > 5 ? "жоғары" : "төмен"}</span></div>
      </div>
      <div className={v.card}>{rows.map((r) => (
        <button key={r.t} className={v.row} style={{ minHeight: 56 }} onClick={() => { haptic.tap(); r.on(); }}>
          <Tile e={r.e} size={36} /><span className={v.rowText}><span className={v.rowTitle}>{r.t}</span></span><b className={v.lead} style={{ fontSize: 16 }}>{r.r}</b><i className={v.arrow} />
        </button>
      ))}</div>
      <Buttons main={x.status === "active" ? { text: "Тоқтату", onClick: () => setSheet("stop"), danger: true } : { text: "Қайта қосу", onClick: () => setSheet("stop") }} second={{ text: "Хабарлама жазу", onClick: () => setSheet("msg") }} />
      {sheet === "fee" && <FeeSheet x={x} onClose={() => setSheet(null)} done={() => void reload()} />}
      {sheet === "stop" && <StopSheet x={x} onClose={() => setSheet(null)} done={() => void reload()} />}
      {sheet === "msg" && <MsgSheet x={x} onClose={() => setSheet(null)} />}
    </VPage>
  );
}

/** Figma «Комиссияны өзгерту»: 10% негізгі / 8% жоғары рейтинг → PIN */
function FeeSheet({ x, onClose, done }: { x: VCard; onClose: () => void; done: () => void }) {
  const [fee, setFee] = useState(x.feePct);
  const [pin, setPin] = useState(false);
  if (pin) return <PinSheet text={`${x.name} комиссиясын ${x.feePct}% → ${fee}% етіп өзгерту.`} onClose={onClose} run={async (p) => { await post(`/venues/${x.id}/fee`, { feePct: fee, pin: p }); done(); }} />;
  return (
    <Sheet title="Комиссия" onClose={onClose}>
      <div className={v.card}>
        <RadioRow on={fee === 10} title="10% — негізгі" onClick={() => setFee(10)} />
        <RadioRow on={fee === 8} title="8% — жоғары рейтинг" sub={`Рейтинг 4,7-ден жоғары, шағым 2%-дан төмен, кемінде 20 пікір${x.eligible8 ? " · шарт орындалған" : " · шарт әлі орындалмаған"}`} onClick={() => setFee(8)} />
      </div>
      <Note>Комиссия тек мекемеге көрінеді. Жаңа мән келесі сатылымнан бастап қолданылады.</Note>
      <Buttons main={{ text: "Өзгерту", onClick: () => (fee === x.feePct ? onClose() : setPin(true)) }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Figma «Мекемені тоқтату»: уақытша / біржола, себебі (мекемеге көрінеді) → PIN */
function StopSheet({ x, onClose, done }: { x: VCard; onClose: () => void; done: () => void }) {
  const resume = x.status !== "active";
  const [mode, setMode] = useState<"paused" | "closed">("paused");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState(resume);
  if (pin) return <PinSheet text={resume ? `${x.name}-ді қайта іске қосу.` : `${x.name}-ді ${mode === "paused" ? "уақытша тоқтату" : "біржола жабу"}.`} onClose={onClose}
    run={async (p) => { await post(`/venues/${x.id}/status`, { status: resume ? "active" : mode, reason: reason.trim(), pin: p }); done(); }} />;
  return (
    <Sheet title={`${x.name}-ді тоқтату`} onClose={onClose}>
      <div className={v.card}>
        <RadioRow on={mode === "paused"} title="Уақытша тоқтату" sub="Жаңа сатылым жабылады, бар пакеттер жұмыс істейді" onClick={() => setMode("paused")} />
        <RadioRow on={mode === "closed"} title="Біржола өшіру" sub="Қайтарылмайтын әрекет" onClick={() => setMode("closed")} />
      </div>
      {x.activePacks > 0 && <Note tone="warn">Клиенттерде {x.activePacks} белсенді пакет бар. Олар мерзімі біткенше қолданыла береді: мекеме қызмет көрсетуге міндетті.</Note>}
      <Field label="Себебі (мекемеге көрінеді)" value={reason} onChange={setReason} placeholder="Қайталанған шағымдар" />
      <Buttons main={{ text: "Тоқтату", danger: true, onClick: () => { if (reason.trim().length < 3) { haptic.error(); nativeAlert("Себебін жазыңыз."); return; } setPin(true); } }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

function MsgSheet({ x, onClose }: { x: VCard; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    try { const r = await post<{ sent: number }>(`/venues/${x.id}/message`, { text: text.trim() }); haptic.success(); nativeAlert(r.sent ? "Хабарлама мекеме иесіне Medeo боты арқылы жіберілді." : "Мекеме иесі ботқа рұқсат бермеген: хабар жетпеуі мүмкін."); onClose(); }
    catch { haptic.error(); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Хабарлама жазу" onClose={onClose}>
      <Field label={`${x.name} иесіне`} value={text} onChange={setText} rows={3} max={800} placeholder="Сәлеметсіз бе! …" />
      <Buttons main={{ text: busy ? "…" : "Жіберу", onClick: () => void send(), disabled: busy || text.trim().length < 3 }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Figma «Ішкі жазбалар»: тек Басқару командасы көреді */
export function ANotes() {
  const { id = "" } = useParams();
  const [d, , reload] = useCached<{ notes: { id: string; text: string; at: string; author: string }[] }>(`a:notes:${id}`, () => A(`/venues/${id}/notes`));
  const [text, setText] = useState("");
  const add = async () => { if (text.trim().length < 2) return; try { await post(`/venues/${id}/notes`, { text: text.trim() }); haptic.success(); setText(""); void reload(); } catch { haptic.error(); } };
  return (
    <VPage title="Ішкі жазбалар" back>
      <Note>Жазбаларды тек Басқару командасы көреді. Мекемеге көрінбейді.</Note>
      {!d ? <Sk h={120} /> : d.notes.length > 0 && <div className={v.card}>{d.notes.map((n) => (
        <div key={n.id} className={v.row} style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
          <Person name={n.author} size={36} /><span className={v.rowText}><span className={v.rowTitle}>{n.author} · {dayMonth(n.at)}</span><span className={v.rowSub} style={{ whiteSpace: "normal" }}>{n.text}</span></span>
        </div>))}</div>}
      <Field label="Жаңа жазба" value={text} onChange={setText} rows={2} max={1000} placeholder="Мәтін жазыңыз…" />
      <Buttons main={{ text: "Жазба қосу", onClick: () => void add(), disabled: text.trim().length < 2 }} />
    </VPage>
  );
}

export function ABranches() {
  const { id = "" } = useParams();
  const [d] = useCached<{ branches: { id: string; address: string; active: boolean; is_247: boolean; closed_until: string | null }[] }>(`a:br:${id}`, () => A(`/venues/${id}/branches`));
  return (
    <VPage title="Филиалдар" back>
      {!d ? <Sk h={120} /> : d.branches.length === 0 ? <Empty>Филиал жоқ</Empty> : <div className={v.card}>{d.branches.map((b) => (
        <div key={b.id} className={v.row}><Tile e="a:branches" size={36} /><span className={v.rowText}><span className={v.rowTitle}>{b.address}</span><span className={v.rowSub}>{!b.active ? "Өшірілген" : b.closed_until && new Date(b.closed_until) > new Date() ? "Уақытша жабық" : b.is_247 ? "24/7" : "Белсенді"}</span></span></div>
      ))}</div>}
    </VPage>
  );
}
export function ATeam() {
  const { id = "" } = useParams();
  const [d] = useCached<{ team: { first_name: string; last_name: string | null; username: string | null; role: string; status: string }[] }>(`a:team:${id}`, () => A(`/venues/${id}/team`));
  const role: Record<string, string> = { owner: "Иесі", manager: "Басқарушы", cashier: "Кассир" };
  return (
    <VPage title="Команда" back>
      {!d ? <Sk h={120} /> : <div className={v.card}>{d.team.map((m, i) => (
        <div key={i} className={v.row}><Person name={m.first_name} size={40} /><span className={v.rowText}><span className={v.rowTitle}>{m.first_name} {m.last_name ?? ""}</span><span className={v.rowSub}>{role[m.role]}{m.username ? ` · @${m.username}` : ""}{m.status === "pending" ? " · растауды күтуде" : ""}</span></span></div>
      ))}</div>}
    </VPage>
  );
}

// ── Өтінімдер ──
export function AApps() {
  const go = useGo();
  const [tab, setTab] = useState<"review" | "need_info" | "rejected">("review");
  const [d] = useCached<{ counts: { review: number; need_info: number; rejected: number }; applications: AppRow[] }>(`a:apps:${tab}`, () => A(`/applications?status=${tab}`));
  return (
    <VPage title="Өтінімдер" back>
      <div className={v.seg}>{([["review", "Жаңа"], ["need_info", "Түзетуде"], ["rejected", "Қайтарылған"]] as const).map(([k, t]) => (
        <button key={k} className={`${v.segBtn} ${tab === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setTab(k); }}>{t}{d && k !== "rejected" ? ` · ${d.counts[k]}` : ""}</button>
      ))}</div>
      {!d ? <Sk h={160} /> : d.applications.length === 0 ? (
        <div className={v.result}><VSticker name="sleep" size={100} /><h2 className={v.stateTitle}>Өтінім жоқ</h2><p className={v.stateText}>Жаңа мекеме тіркелсе, осында көрінеді.</p></div>
      ) : (
        <div className={v.card}>{d.applications.map((a) => {
          const h = a.submitted_at ? (Date.now() - new Date(a.submitted_at).getTime()) / 3600_000 : 0;
          return (
            <button key={a.id} className={v.row} style={{ minHeight: 64 }} onClick={() => go(`/a/apps/${a.id}`)}>
              <Person name={a.name ?? "?"} size={40} />
              <span className={v.rowText}><span className={v.rowTitle}>{a.name ?? "Атаусыз"}</span><span className={v.rowSub}>{a.kindName} · {a.form} · {a.submitted_at ? when(a.submitted_at) : ""}</span></span>
              {tab === "review" && a.submitted_at && <span className={`${v.tag} ${h >= 12 ? v.tagRed : v.tagYellow}`}>{ago(a.submitted_at)}</span>}
              <i className={v.arrow} />
            </button>
          );
        })}</div>
      )}
      <Note>Өтінімге 24 сағат ішінде жауап беру ұсынылады. Мерзімі жақындағандар қызылмен белгіленеді.</Note>
    </VPage>
  );
}

interface AppFull { id: string; status: string; note: string | null; submittedAt: string | null; venueId: string | null; docs: { id: string; kind: string; file_name: string; mime: string; size: number }[];
  data: { name?: string; kindName: string; legalName?: string; bin?: string; director?: string; contactName?: string; phone?: string; email?: string; iban?: string; bank: string | null; branches?: { address: string; open: string; close: string }[]; about?: string } }
const DOCS = [["bin", "Тіркеу куәлігі"], ["id", "Жеке куәлік"], ["charter", "Жарғы"], ["halal", "Халал сертификаты"]] as const;
const REASONS = ["Құжат жетіспейді", "Деректер сәйкес емес", "Санат сәйкес келмейді", "Басқа себеп"];
export function AApp() {
  const go = useGo();
  const { id = "" } = useParams();
  const [d] = useCached<{ application: AppFull }>(`a:app:${id}`, () => A(`/applications/${id}`));
  const [ret, setRet] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = d?.application;
  const approve = useCallback(async () => {
    if (!a || busy) return; setBusy(true);
    try { await post(`/applications/${a.id}/approve`); haptic.success(); go(`/a/apps/${a.id}/done`, "up", { replace: true }); }
    catch { haptic.error(); nativeAlert("Бекітілмеді. Қайталап көріңіз."); } finally { setBusy(false); }
  }, [a, busy, go]);
  const openDoc = async (docId: string) => { try { const r = await A<{ url: string }>(`/docs/${docId}/link`); openExternal(API_URL + r.url); } catch { haptic.error(); } };
  if (!a) return <VPage title="Өтінім" back><Sk h={160} /><Sk h={200} /></VPage>;
  const x = a.data;
  const kv = (k: string, val?: string | null) => <div className={v.kv} key={k}><span>{k}</span><b>{val || "—"}</b></div>;
  const iban = x.iban ? x.iban.replace(/\s/g, "").replace(/^(.{4})(.{4}).*(.{4})$/, "$1 $2 •••• $3") : null;
  return (
    <VPage title={x.name ?? "Өтінім"} back>
      {a.status !== "review" && <Note tone={a.status === "approved" ? "ok" : "warn"}>{a.status === "approved" ? "Бекітілген" : a.status === "need_info" ? "Түзетуге жіберілген" : "Қайтарылған"}{a.note ? `: ${a.note}` : ""}</Note>}
      <div className={v.card} style={{ padding: "4px 16px" }}>{kv("Заңды атауы", x.legalName)}{kv("ЖСН / БСН", x.bin?.replace(/^(\d{6})(\d{6})$/, "$1 $2"))}{kv("Басшы", x.director)}{kv("Санат", x.kindName)}{kv("Қала", "Қарағанды")}</div>
      <h2 className={v.blueHead}>Құжаттар</h2>
      <div className={v.card}>{DOCS.map(([k, t]) => {
        const f = a.docs.filter((d2) => d2.kind === k);
        return (
          <button key={k} className={v.row} onClick={() => f[0] && void openDoc(f[0].id)} style={{ ["--inset" as string]: "52px" }}>
            <span className={f.length ? s.ok : k === "charter" || k === "halal" ? s.wait : s.bad}>{f.length ? "✓" : k === "charter" || k === "halal" ? "–" : "✕"}</span>
            <span className={v.rowText}><span className={v.rowTitle}>{t}</span><span className={`${v.rowSub} ${f.length ? "" : s.red}`}>{f.length ? `${f[0].mime.includes("pdf") ? "PDF" : "JPG"} · ${(f.reduce((a2, y) => a2 + y.size, 0) / 1048576).toFixed(1).replace(".", ",")} МБ` : k === "charter" || k === "halal" ? "Міндетті емес" : "Жүктелмеген"}</span></span>
            {f.length > 0 && <i className={v.arrow} />}
          </button>
        );
      })}</div>
      <h2 className={v.blueHead}>Шот</h2>
      <div className={v.card} style={{ padding: "4px 16px" }}>{kv("IBAN", iban)}{kv("Банк", x.bank)}</div>
      <h2 className={v.blueHead}>Байланыс және филиалдар</h2>
      <div className={v.card} style={{ padding: "4px 16px" }}>{kv("Байланыс", x.contactName)}{kv("Телефон", x.phone)}{kv("Email", x.email)}{(x.branches ?? []).map((b, i) => kv(`Филиал ${i + 1}`, `${b.address} · ${b.open}–${b.close}`))}</div>
      {a.status === "review" && <Buttons main={{ text: busy ? "…" : "Бекіту", onClick: () => void approve(), disabled: busy }} second={{ text: "Қайтару", onClick: () => setRet(true) }} />}
      {a.status === "approved" && a.venueId && <Buttons main={{ text: "Мекеме картасы", onClick: () => go(`/a/venues/${a.venueId}`) }} />}
      {ret && <ReturnSheet id={a.id} onClose={() => setRet(false)} done={() => go(-1, "back")} />}
    </VPage>
  );
}
function ReturnSheet({ id, onClose, done }: { id: string; onClose: () => void; done: () => void }) {
  const [r, setR] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [hard, setHard] = useState(false);
  const send = async () => {
    try { await post(`/applications/${id}/return`, { status: hard ? "rejected" : "need_info", reason: r, note: note.trim() }); haptic.success(); onClose(); done(); }
    catch { haptic.error(); nativeAlert("Жіберілмеді. Қайталап көріңіз."); }
  };
  return (
    <Sheet title="Өтінімді қайтару" onClose={onClose}>
      <p className={s.pinText} style={{ textAlign: "left" }}>Мекеме себепті көріп, түзетіп қайта жібере алады.</p>
      <div className={v.card}>{REASONS.map((x) => <RadioRow key={x} on={r === x} title={x} onClick={() => setR(x)} />)}</div>
      <Field label="Түсініктеме" value={note} onChange={setNote} placeholder="Санитарлық қорытындыны жүктеңіз" />
      <button className={v.textBtn} style={{ alignSelf: "flex-start", color: hard ? "#e53935" : undefined }} onClick={() => { haptic.select(); setHard(!hard); }}>{hard ? "✓ Мүлде қабылдамау (қайта жібере алмайды)" : "Мүлде қабылдамау…"}</button>
      <Buttons main={{ text: hard ? "Қабылдамау" : "Түзетуге жіберу", onClick: () => void send(), danger: hard }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Figma «Өтінім бекітілді»: party стикері, «Мекеме картасы» / «Келесі өтінім» */
export function AAppDone() {
  const go = useGo();
  const { id = "" } = useParams();
  const [d] = useCached<{ application: AppFull }>(`a:app:${id}:done`, () => A(`/applications/${id}`));
  const next = async () => { const r = await A<{ applications: AppRow[] }>("/applications?status=review").catch(() => null); const n = r?.applications[0]; go(n ? `/a/apps/${n.id}` : "/a/venues", "fade", { replace: true }); };
  return (
    <VPage>
      <div className={v.state} style={{ top: "calc(300px + var(--top-shift))" }}>
        <VSticker name="party" size={120} />
        <h2 className={v.stateTitle}>{d?.application.data.name ?? "Мекеме"} қосылды</h2>
        <p className={v.stateText}>Мекемеге хабарлама жіберілді. Енді ол ұсыныс құра алады; алғашқы ұсынысы модерацияға түседі.</p>
      </div>
      <Buttons main={{ text: "Келесі өтінім", onClick: () => void next() }} second={{ text: "Мекеме картасы", onClick: () => d?.application.venueId && go(`/a/venues/${d.application.venueId}`, "fade", { replace: true }) }} />
    </VPage>
  );
}
