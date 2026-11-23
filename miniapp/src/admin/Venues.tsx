// Figma «03 · Мекемелер» (14063:9710): Мекемелер (іздеу, сүзгі), Өтінімдер, Өтінім беті, Қайтару себебі, Өтінім бекітілді,
// Мекеме картасы, Комиссияны өзгерту, Мекемені тоқтату, Ішкі жазбалар.
import { useCallback, useEffect, useRef, useState } from "react";
import { drawSticker, stickerPng, type StickerData } from "./sticker";
import { Switch } from "../ui/SubPage";
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
                <td><b>{x.name}</b><small>{`${x.branches} филиал`}</small></td><td>{x.kindName}</td><td><span className={`${v.tag} ${v[k]}`}>{t}</span></td>
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
              <span className={v.rowText}><span className={v.rowTitle}>{x.name}<span className={`${v.tag} ${v[k]}`}>{t}</span></span><span className={v.rowSub}>{`${x.kindName} · ${x.branches} филиал${x.rating ? ` · ★ ${x.rating.toFixed(1).replace(".", ",")}` : ""}`}</span></span>
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
  sales30: number; salesGrowth: number | null; fee30: number; complaintShare: number; branches: number; offers: number; team: number; complaints: number; notes: number; activePacks: number; eligible8: boolean; burnShare: number; burnAvg: number; refused30: number }
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
    { e: "a:branches", t: "Жапсырмалар (QR)", r: "", on: () => go(`/a/venues/${id}/stickers`) },
    { e: "a:fee", t: "Аударымдар", r: "", on: () => go(`/a/venues/${id}/payouts`) },
    { e: "a:offers", t: "Ұсыныстар", r: `${x.offers} белсенді`, on: () => go(`/a/offers?venue=${id}&tab=active`) },
    { e: "a:team", t: "Команда", r: `${x.team} адам`, on: () => go(`/a/venues/${id}/team`) },
    { e: "a:complaints", t: "Шағымдар тарихы", r: String(x.complaints), on: () => go(`/a/complaints?venue=${id}&tab=done`) },
    { e: "a:notes", t: "Ішкі жазбалар", r: String(x.notes), on: () => go(`/a/venues/${id}/notes`) },
  ];
  return (
    <VPage title="Мекеме" back>
      <div className={v.card}><div className={v.row} style={{ minHeight: 70 }}>
        <Person name={x.name} size={44} />
        <span className={v.rowText}><span className={v.rowTitle} style={{ fontSize: 19 }}>{x.name}<span className={`${v.tag} ${v[k]}`}>{t}</span></span><span className={v.rowSub}>{`${x.kindName} · Қарағанды · ${dayMonth(x.createdAt)}-ден бері`}</span></span>
      </div></div>
      {x.status !== "active" && x.statusNote && <Note tone="warn">{`Себебі: ${x.statusNote}`}</Note>}
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Сатылым, 30 күн</span><span className={v.statNum}>{money(x.sales30)}</span><Growth v={x.salesGrowth} /></div>
        <div className={v.stat}><span className={v.statLabel}>Комиссия, 30 күн</span><span className={v.statNum}>{money(x.fee30)}</span><span className={v.tag} style={{ alignSelf: "flex-start" }}>{x.feePct}%</span></div>
      </div>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Рейтинг</span><span className={v.statNum}>★ {x.rating ? x.rating.toFixed(1).replace(".", ",") : "—"}</span><span className={`${v.tag} ${v.tagGray}`} style={{ alignSelf: "flex-start" }}>{`${x.reviews} пікір`}</span></div>
        <div className={v.stat}><span className={v.statLabel}>Шағым үлесі</span><span className={v.statNum}>{String(x.complaintShare).replace(".", ",")}%</span><span className={`${v.tag} ${x.complaintShare > 5 ? v.tagRed : v.tagGreen}`} style={{ alignSelf: "flex-start" }}>{x.complaintShare > 5 ? "жоғары" : "төмен"}</span></div>
      </div>
      {/* Айла белгілері (Патша, 2026-11-17): күйген бірлік үлесі платформа орташасынан екі есе жоғары болса не «қабылдамады» шағымы көп болса — қызыл */}
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Күйген бірлік, 90 күн</span><span className={v.statNum}>{String(x.burnShare).replace(".", ",")}%</span><span className={`${v.tag} ${x.burnShare > Math.max(10, x.burnAvg * 2) ? v.tagRed : v.tagGray}`} style={{ alignSelf: "flex-start" }}>{`орташа ${String(x.burnAvg).replace(".", ",")}%`}</span></div>
        <div className={v.stat}><span className={v.statLabel}>«Қабылдамады», 30 күн</span><span className={v.statNum}>{`${x.refused30} клиент`}</span><span className={`${v.tag} ${x.refused30 >= 3 ? v.tagRed : v.tagGreen}`} style={{ alignSelf: "flex-start" }}>{x.refused30 >= 3 ? "тексеру керек" : "қалыпты"}</span></div>
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
      {x.activePacks > 0 && <Note tone="warn">{`Клиенттерде ${x.activePacks} белсенді пакет бар. Олар мерзімі біткенше қолданыла береді: мекеме қызмет көрсетуге міндетті.`}</Note>}
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
  // Мекемелер қандай касса бағдарламасын қолданады (жіберілген өтінімдер) — POS-ты қайсысынан бастау
  const [pos] = useCached<{ total: number; items: { pos: string; name: string; n: number }[] }>("a:pos", () => A("/pos-stats"));
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
      {pos && pos.total > 0 && <>
        <h2 className={v.blueHead}>{`Касса бағдарламалары · ${pos.total} өтінім`}</h2>
        <div className={v.card} style={{ padding: "4px 16px" }}>{pos.items.map((p) => <div className={v.kv} key={p.pos + p.name}><span>{p.name}</span><b>{`${p.n} · ${Math.round((p.n * 100) / pos.total)}%`}</b></div>)}</div>
        <Note>POS интеграциясын ең көп қолданылатын бағдарламадан бастаймыз.</Note>
      </>}
    </VPage>
  );
}

interface AppFull { id: string; status: string; note: string | null; submittedAt: string | null; venueId: string | null; docs: { id: string; kind: string; file_name: string; mime: string; size: number }[];
  data: { name?: string; kindName: string; legalName?: string; bin?: string; director?: string; contactName?: string; phone?: string; email?: string; iban?: string; bank: string | null; branches?: { address: string; open: string; close: string }[]; about?: string; posName?: string | null } }
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
      <div className={v.card} style={{ padding: "4px 16px" }}>{kv("Байланыс", x.contactName)}{kv("Телефон", x.phone)}{kv("Email", x.email)}{(x.branches ?? []).map((b, i) => kv(`Филиал ${i + 1}`, `${b.address} · ${b.open}–${b.close}`))}{kv("Касса бағдарламасы", x.posName)}</div>
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
        <h2 className={v.stateTitle}>{`${d?.application.data.name ?? "Мекеме"} қосылды`}</h2>
        <p className={v.stateText}>Мекемеге хабарлама жіберілді. Енді ол ұсыныс құра алады; алғашқы ұсынысы модерацияға түседі.</p>
      </div>
      <Buttons main={{ text: "Келесі өтінім", onClick: () => void next() }} second={{ text: "Мекеме картасы", onClick: () => d?.application.venueId && go(`/a/venues/${d.application.venueId}`, "fade", { replace: true }) }} />
    </VPage>
  );
}

// ── Мекеме жапсырмалары (Патша, 2026-11-22): әр филиалға тұрақты QR, басып шығаруға PNG ──
type StickerRow = { id: string; address: string; active: boolean; code: string; scans30: number; uses30: number; url: string };
function StickerPreview({ data }: { data: StickerData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) void drawSticker(ref.current, data, 620); }, [data]);
  return <canvas ref={ref} style={{ width: "100%", height: "auto", display: "block", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,.08)" }} />;
}
export function AStickers() {
  const { id = "" } = useParams();
  const [d, , reload] = useCached<{ venue: { id: string; name: string; enabled: boolean }; branches: StickerRow[] }>(`a:st:${id}`, () => A(`/venues/${id}/stickers`));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try { await post(`/venues/${id}/stickers`, { enabled: on }); haptic.success(); reload(); } catch { haptic.error(); nativeAlert("Сақталмады, қайталап көріңіз"); } finally { setBusy(false); }
  };
  const save = async (b: StickerRow) => {
    const blob = await stickerPng({ url: b.url, venue: d!.venue.name, address: b.address, code: b.code });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `squirrel-${b.code}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  return (
    <VPage title="Жапсырмалар" back>
      {!d ? <Sk h={200} /> : <>
        <div className={v.card}>
          <div className={v.row}>
            <span className={v.rowText}><span className={v.rowTitle}>Жапсырма арқылы қолдану</span><span className={v.rowSub} style={{ whiteSpace: "normal" }}>{d.venue.enabled ? "Қосулы: клиент жапсырманы сканерлеп, бірлікті өзі қолдана алады" : "Өшірулі: сканерлесе де қолдану рұқсат етілмейді"}</span></span>
            <Switch on={d.venue.enabled} onChange={(x) => { if (!busy) { haptic.select(); void toggle(x); } }} />
          </div>
        </div>
        {d.branches.length === 0 ? <Empty>Филиал жоқ</Empty> : d.branches.map((b) => (
          <div key={b.id} className={v.card} style={{ padding: 0 }}>
            <button className={v.row} onClick={() => { haptic.select(); setOpen(open === b.id ? null : b.id); }}>
              <Tile e="a:branches" size={36} />
              <span className={v.rowText}><span className={v.rowTitle}>{b.address}</span><span className={v.rowSub}>{`${b.code} · 30 күнде: ${b.scans30} сканер, ${b.uses30} қолдану${b.active ? "" : " · филиал өшірулі"}`}</span></span>
              <i className={v.arrow} />
            </button>
            {open === b.id && <div style={{ padding: "4px 16px 16px", display: "grid", gap: 12 }}>
              <StickerPreview data={{ url: b.url, venue: d.venue.name, address: b.address, code: b.code }} />
              <button className={v.btn} onClick={() => { haptic.select(); void save(b); }}>PNG жүктеу · A6, 300 dpi</button>
            </div>}
          </div>
        ))}
        <Note>QR ішінде — біздің сервердегі қысқа сілтеме (/b/код). Ол бүгін Telegram мини аппқа, кейін қосымшаға бағыттайды — жапсырманы қайта басып шығару керек емес. Домен алынған соң STICKER_BASE_URL қойылады, ескі жапсырмалар да жұмыс істей береді.</Note>
      </>}
    </VPage>
  );
}

// ── Мекемеге аударымдар (0033, Патша 2026-11-23): есептелді / аударылды / күтуде; аударымды PIN-мен тіркеу, қате болса жою ──
// Ақша алушы (0034): франшиза желісінде әр заңды тұлғаның өз филиалдары, өз қалдығы — аударым алушы бойынша тіркеледі
interface Payee { id: string; legalName: string; bin: string | null; iban: string | null; bank: string | null; contractNo: string | null; isMain: boolean }
interface Group { payee: Payee | null; branches: { id: string; address: string }[]; earned: number; paid: number; due: number; paidThrough: string | null; suggest: PayoutsData["suggest"] }
interface PayoutsData { balance: { earned: number; paid: number; due: number; paidThrough: string | null }; payouts: { id: string; amount: number; from: string; to: string; paidAt: string; ref: string | null; note: string | null; payeeId: string | null }[];
  suggest: { from: string | null; to: string; amount: number } | null; groups?: Group[] }
interface PayeesData { payees: Payee[]; branches: { id: string; address: string; payeeId: string | null; active: boolean }[] }
const todayKz = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const isDay = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
const ibanMask = (x: string | null) => (x ? `${x.slice(0, 4)} •••• ${x.slice(-4)}` : "IBAN жоқ");
export function APayouts() {
  const { id = "" } = useParams();
  const [d, , reload] = useCached<PayoutsData>(`a:payouts:${id}`, () => A(`/venues/${id}/payouts`));
  const [pd, , reloadP] = useCached<PayeesData>(`a:payees:${id}`, () => A(`/venues/${id}/payees`));
  const [add, setAdd] = useState<Group | "all" | null>(null);
  const [edit, setEdit] = useState<Payee | "new" | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const b = d?.balance;
  const groups = d?.groups ?? [];
  const many = groups.length > 1;
  const nameOf = (pid: string | null) => { const ps = pd?.payees ?? []; return (pid ? ps.find((p) => p.id === pid) : ps.find((p) => p.isMain))?.legalName ?? null; };
  const refresh = () => { void reload(); void reloadP(); };
  return (
    <VPage title="Аударымдар" back>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Есептелді</span><span className={v.statNum}>{b ? money(b.earned) : "–"}</span><span className={v.statSub}>Клиенттер қолданған бірліктер, комиссиясыз</span></div>
        <div className={v.stat}><span className={v.statLabel}>Аударылды</span><span className={v.statNum}>{b ? money(b.paid) : "–"}</span><span className={v.statSub}>{b?.paidThrough ? `${dayMonth(b.paidThrough)} күніне дейін` : "Әлі жоқ"}</span></div>
      </div>
      <div className={v.stat}><span className={v.statLabel}>Аударуды күтуде</span><span className={v.statNum} style={{ color: b && b.due > 0 ? "#1f8a3b" : undefined }}>{b ? money(b.due) : "–"}</span>
        {!many && d?.suggest && <span className={v.statSub}>{`Ұсынылатын кезең: ${d.suggest.from ? dayMonth(d.suggest.from) : "басынан"} — ${dayMonth(d.suggest.to)} · ${money(d.suggest.amount)}`}</span>}</div>

      <div className={v.sectionHead}><h2 className={v.blueHead}>Ақша алушылар</h2></div>
      {!d || !pd ? <Sk h={90} /> : <div className={v.card}>
        {groups.map((g, i) => (
          <div key={g.payee?.id ?? "none" + i} className={v.row} style={{ ["--inset" as string]: "16px", alignItems: "flex-start" }}>
            <Tile e={g.payee?.isMain ? "a:iban" : "a:settle"} size={36} />
            <button className={v.rowText} style={{ textAlign: "left" }} disabled={!g.payee} onClick={() => { if (g.payee) { haptic.tap(); setEdit(g.payee); } }}>
              <span className={v.rowTitle} style={{ whiteSpace: "normal" }}>{g.payee ? `${g.payee.legalName}${g.payee.isMain ? " · негізгі" : ""}` : "Алушы белгіленбеген"}</span>
              <span className={v.rowSub} style={{ whiteSpace: "normal" }}>{g.payee ? `${g.payee.bin ? "БСН " + g.payee.bin + " · " : ""}${ibanMask(g.payee.iban)}${g.payee.bank ? " · " + g.payee.bank : ""}${g.payee.contractNo ? " · шарт " + g.payee.contractNo : ""}` : "Филиалдарды алушыға бекітіңіз"}</span>
              <span className={v.rowSub} style={{ whiteSpace: "normal" }}>{g.branches.length ? g.branches.map((x) => x.address).join(", ") : "Филиал бекітілмеген"}</span>
              {many && <span className={v.rowSub}>{`Күтуде ${money(g.due)} · Аударылды ${money(g.paid)}${g.paidThrough ? ` (${dayMonth(g.paidThrough)} дейін)` : ""}`}</span>}
            </button>
            {many && g.payee && g.due > 0 && <button className={v.chip} style={{ alignSelf: "center", background: "var(--thumb-bg)", color: "var(--link)", fontWeight: 600 }} onClick={() => { haptic.tap(); setAdd(g); }}>Аудару</button>}
          </div>
        ))}
        {groups.length === 0 && <div className={v.row}><span className={v.rowSub}>Алушы әлі қосылмаған</span></div>}
      </div>}
      <Buttons main={{ text: "Алушы қосу (франчайзи)", onClick: () => { haptic.tap(); setEdit("new"); } }} />
      <Note>Франшиза желісінде әр филиал өз заңды тұлғасына (ЖШС/ЖК) бекітіледі. Бекітілмеген филиалдың үлесі негізгі алушыға есептеледі.</Note>

      <div className={v.sectionHead}><h2 className={v.blueHead}>Тіркелген аударымдар</h2></div>
      {!d ? <Sk h={120} /> : d.payouts.length === 0 ? <Empty>Аударым әлі тіркелмеген</Empty> : <div className={v.card}>{d.payouts.map((p) => (
        <button key={p.id} className={v.row} onClick={() => { haptic.tap(); setDel(p.id); }}>
          <Tile e="a:fee" size={36} />
          <span className={v.rowText}><span className={v.rowTitle}>{`${money(p.amount)} · ${dayMonth(p.paidAt)}`}</span><span className={v.rowSub}>{`${many && nameOf(p.payeeId) ? nameOf(p.payeeId) + " · " : ""}${dayMonth(p.from)} — ${dayMonth(p.to)}${p.ref ? ` · ${p.ref}` : ""}${p.note ? ` · ${p.note}` : ""}`}</span></span>
        </button>))}</div>}
      <Note>Аударымды банк арқылы жібергеннен кейін ғана тіркеңіз. Мекеме иесіне хабар барады, «Есеп» бетінде сол күндер «Аударылды» болады.</Note>
      {!many && <Buttons main={{ text: "Аударымды тіркеу", onClick: () => setAdd("all") }} />}
      {add && d && <PayoutSheet id={id} d={d} group={add === "all" ? null : add} onClose={() => setAdd(null)} done={refresh} />}
      {edit && pd && <PayeeSheet id={id} pd={pd} payee={edit === "new" ? null : edit} onClose={() => setEdit(null)} done={refresh} />}
      {del && <PinSheet text="Бұл аударым жазбасын жою (қате тіркелген болса)." onClose={() => setDel(null)} run={async (pin) => { await post(`/venues/${id}/payouts/${del}/delete`, { pin }); refresh(); }} />}
    </VPage>
  );
}

/** Алушыны қосу/өзгерту: заңды атауы, БСН, IBAN, шарт нөмірі, негізгі ме, қай филиалдар */
function PayeeSheet({ id, pd, payee, onClose, done }: { id: string; pd: PayeesData; payee: Payee | null; onClose: () => void; done: () => void }) {
  const [name, setName] = useState(payee?.legalName ?? "");
  const [bin, setBin] = useState(payee?.bin ?? "");
  const [iban, setIban] = useState(payee?.iban ?? "");
  const [contract, setContract] = useState(payee?.contractNo ?? "");
  const [main, setMain] = useState(payee?.isMain ?? pd.payees.length === 0);
  const [sel, setSel] = useState<string[]>(() => pd.branches.filter((b) => payee && b.payeeId === payee.id).map((b) => b.id));
  const [pin, setPin] = useState<"save" | "del" | null>(null);
  const binOk = !bin || /^\d{12}$/.test(bin.trim());
  const ibanOk = !iban || /^KZ\d{2}[0-9A-Z]{16}$/i.test(iban.replace(/\s/g, ""));
  const ok = name.trim().length >= 2 && binOk && ibanOk;
  const other = (b: PeerBranch) => b.payeeId && b.payeeId !== payee?.id ? pd.payees.find((p) => p.id === b.payeeId)?.legalName ?? null : null;
  if (pin === "save") return <PinSheet text={`«${name.trim()}» алушысын сақтау (${sel.length} филиал).`} onClose={onClose}
    run={async (p) => { await post(`/venues/${id}/payees`, { ...(payee ? { id: payee.id } : {}), legalName: name.trim(), bin: bin.trim(), iban: iban.replace(/\s/g, "").toUpperCase() || undefined, contractNo: contract.trim() || undefined, isMain: main, branchIds: sel, pin: p }); done(); }} />;
  if (pin === "del" && payee) return <PinSheet text={`«${payee.legalName}» алушысын жою. Оның филиалдары негізгі алушыға өтеді.`} onClose={onClose}
    run={async (p) => { await post(`/venues/${id}/payees/${payee.id}/delete`, { pin: p }); done(); }} />;
  return (
    <Sheet title={payee ? "Алушыны өзгерту" : "Жаңа алушы"} onClose={onClose}>
      <Field label="Заңды атауы" value={name} onChange={setName} max={120} placeholder="ЖШС «Мысал»" />
      <Field label="БСН / ЖСН (12 сан)" value={bin} onChange={(x) => setBin(x.replace(/\D/g, "").slice(0, 12))} />
      <Field label="IBAN" value={iban} onChange={(x) => setIban(x.toUpperCase().replace(/[^0-9A-Z ]/g, "").slice(0, 24))} placeholder="KZ00 0000 0000 0000 0000" />
      <Field label="Агенттік шарт нөмірі" value={contract} onChange={setContract} max={60} placeholder="АГ-12" />
      <div className={v.card} style={{ padding: 0 }}>
        <div className={v.row} style={{ ["--inset" as string]: "16px" }}><span className={v.rowText}><span className={v.rowTitle}>Негізгі алушы</span><span className={v.rowSub}>Бекітілмеген филиалдар осыған есептеледі</span></span><Switch on={main} onChange={setMain} /></div>
      </div>
      <p className={v.rowSub} style={{ margin: "12px 4px 6px" }}>Филиалдар</p>
      <div className={v.card} style={{ padding: 0 }}>
        {pd.branches.map((b) => {
          const on = sel.includes(b.id); const o = other(b);
          return <RadioRow key={b.id} on={on} title={b.address} sub={o ? `Қазір: ${o} — таңдасаңыз, осыған ауысады` : b.active ? undefined : "Өшірулі филиал"} onClick={() => setSel(on ? sel.filter((x) => x !== b.id) : [...sel, b.id])} />;
        })}
      </div>
      {!binOk && <Note tone="warn">БСН 12 саннан тұрады.</Note>}
      {!ibanOk && <Note tone="warn">IBAN: KZ + 18 таңба.</Note>}
      <Buttons main={{ text: "Сақтау", disabled: !ok, onClick: () => (ok ? setPin("save") : haptic.error()) }} second={payee && !payee.isMain ? { text: "Жою", onClick: () => setPin("del") } : { text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
type PeerBranch = PayeesData["branches"][number];
function PayoutSheet({ id, d, group, onClose, done }: { id: string; d: PayoutsData; group: Group | null; onClose: () => void; done: () => void }) {
  const sg = group ? group.suggest : d.suggest;
  const [amount, setAmount] = useState(String(sg?.amount ?? (group ? group.due : d.balance.due)));
  const [from, setFrom] = useState(sg?.from ?? (d.payouts.length ? "" : "2026-01-01"));
  const [to, setTo] = useState(sg?.to ?? todayKz());
  const [paidAt, setPaidAt] = useState(todayKz());
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState(false);
  const sum = Number(amount.replace(/\s/g, ""));
  const ok = sum > 0 && isDay(from) && isDay(to) && isDay(paidAt) && from <= to;
  if (pin) return <PinSheet text={`${group?.payee ? `«${group.payee.legalName}» шотына ` : ""}${money(sum)} аударымын тіркеу (${from} — ${to}).`} onClose={onClose}
    run={async (p) => { await post(`/venues/${id}/payouts`, { amount: sum, from, to, paidAt, ref: ref.trim() || undefined, note: note.trim() || undefined, ...(group?.payee ? { payeeId: group.payee.id } : {}), pin: p }); done(); }} />;
  return (
    <Sheet title={group?.payee ? `Аударым · ${group.payee.legalName}` : "Аударымды тіркеу"} onClose={onClose}>
      {group?.payee && <Note>{`${ibanMask(group.payee.iban)}${group.payee.bank ? " · " + group.payee.bank : ""} · филиалдар: ${group.branches.map((x) => x.address).join(", ") || "—"}`}</Note>}
      <Field label="Сома, ₸" value={amount} onChange={(x) => setAmount(x.replace(/[^\d\s]/g, ""))} />
      <Field label="Кезең басы (ЖЖЖЖ-АА-КК)" value={from} onChange={setFrom} placeholder="2026-11-01" />
      <Field label="Кезең соңы" value={to} onChange={setTo} />
      <Field label="Аударылған күн" value={paidAt} onChange={setPaidAt} />
      <Field label="Төлем құжатының нөмірі" value={ref} onChange={setRef} max={80} placeholder="ПП-123" />
      <Field label="Ескертпе (міндетті емес)" value={note} onChange={setNote} max={200} />
      {sg && sum !== sg.amount && <Note tone="warn">{`Кезеңнің есептелген сомасы ${money(sg.amount)}. Айырмашылық болса, ескертпеге себебін жазыңыз.`}</Note>}
      <Buttons main={{ text: "Тіркеу", disabled: !ok, onClick: () => (ok ? setPin(true) : (haptic.error(), nativeAlert("Сома мен күндерді тексеріңіз."))) }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
