// Figma «08 · Шағымдар және даулар» (14066:12126): Шағымдар (Жаңа / Қаралуда / Шешілген), Шағым беті, Шешім, Шешім жіберілді, бос күй.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, nativeAlert } from "../telegram";
import { Tile } from "../ui/Tile";
import { useCached } from "../venue/api";
import { Buttons, Note, Person, Sheet, Sk, VPage, VSticker } from "../venue/ui";
import { A, money, post, when } from "./api";
import { Field, RadioRow, setComplaintDot } from "./ui";
import v from "../venue/V.module.css";
import s from "./A.module.css";

interface CRow { id: string; no: number; status: string; reason: string | null; at: string; customer: string; offer: string; venue: string; hoursLeft: number }
type Tab = "new" | "review" | "done";

export function AComplaints() {
  const go = useGo();
  const [sp] = useSearchParams();
  const venue = sp.get("venue") ?? "";
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) || "new");
  const [d] = useCached<{ counts: { new: number; review: number; avgMin: number | null; repeat: number }; complaints: CRow[] }>(`a:compl:${tab}:${venue}`, () => A(`/complaints?tab=${tab}&venue=${venue}`));
  useEffect(() => { if (d) setComplaintDot(d.counts.new > 0); }, [d]);
  const avg = d?.counts.avgMin ? `${Math.floor(d.counts.avgMin / 60)} сағ ${d.counts.avgMin % 60} мин` : "—";
  return (
    <VPage nav={!venue} back={Boolean(venue)} title={venue ? "Шағымдар тарихы" : undefined}>
      {!venue && <><h1 className={v.h1}>Шағымдар</h1><p className={s.sub}>{d ? `${d.counts.new + d.counts.review} ашық · орташа жауап ${avg}` : " "}</p></>}
      <div className={v.seg}>{([["new", "Жаңа"], ["review", "Қаралуда"], ["done", "Шешілген"]] as const).map(([k, t]) => (
        <button key={k} className={`${v.segBtn} ${tab === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setTab(k); }}>{t}{d && k !== "done" ? ` · ${d.counts[k]}` : ""}</button>
      ))}</div>
      {!d ? <Sk h={160} /> : d.complaints.length === 0 ? (
        <div className={v.result}><VSticker name="love" size={100} /><h2 className={v.stateTitle}>{tab === "done" ? "Әзірге шешілген шағым жоқ" : "Ашық шағым жоқ"}</h2><p className={v.stateText}>Клиенттер риза. Жаңа шағым түссе, осында көрінеді.</p></div>
      ) : (
        <div className={v.card}>{d.complaints.map((c) => (
          <button key={c.id} className={v.row} style={{ minHeight: 70, alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }} onClick={() => go(`/a/complaints/${c.id}`)}>
            <Person name={c.customer} size={40} />
            <span className={v.rowText}><span className={v.rowTitle}>{c.customer}
              {tab === "new" && <span className={`${v.tag} ${c.hoursLeft <= 6 ? v.tagRed : v.tagYellow}`}>{c.hoursLeft <= 0 ? "Мерзімі өтті" : c.hoursLeft <= 6 ? "Бүгін бітеді" : `${c.hoursLeft} сағ қалды`}</span>}
              {tab === "review" && <span className={`${v.tag} ${v.tagYellow}`}>Мекеме қайтармады</span>}
              {tab === "done" && <span className={`${v.tag} ${c.status === "refunded" ? v.tagGreen : v.tagGray}`}>{c.status === "refunded" ? "Қайтарылды" : "Жабылды"}</span>}</span>
              <span className={v.rowSub} style={{ whiteSpace: "normal" }}>№{c.no} · {c.offer} · {c.venue}{c.reason ? ` · ${c.reason.toLowerCase()}` : ""}</span></span>
            <i className={v.arrow} />
          </button>
        ))}</div>
      )}
      {!venue && <>
        <Note>Шағымға 24 сағат ішінде шешім шығару ұсынылады. Мерзімі жақындағандар жоғарыда тұрады.</Note>
        <div className={v.card}>
          <button className={v.row} onClick={() => nativeAlert("Жауап үлгілері келесі кезеңде қосылады.")}><Tile e="a:templates" size={36} /><span className={v.rowText}><span className={v.rowTitle}>Жауап үлгілері</span></span><i className={v.arrow} /></button>
          <button className={v.row} onClick={() => go("/a/venues")}><Tile e="a:repeat" size={36} /><span className={v.rowText}><span className={v.rowTitle}>Қайталанатын шағымдар</span><span className={v.rowSub}>Шағым үлесі 5%-дан асқан мекемелер</span></span><b className={v.lead} style={{ fontSize: 16 }}>{d?.counts.repeat ?? "–"}</b><i className={v.arrow} /></button>
        </div>
      </>}
    </VPage>
  );
}

interface CFull { id: string; no: number; status: string; reason: string | null; text: string; reply: string | null; byAdmin: boolean; at: string; customer: string; clientPacks: number; firstComplaint: boolean; packId: string;
  offer: string; venue: string; venueId: string; usedAt: string | null; units: number; cashier: string | null; amount: number }
export function AComplaint() {
  const go = useGo();
  const { id = "" } = useParams();
  const [d] = useCached<{ complaint: CFull }>(`a:c:${id}`, () => A(`/complaints/${id}`));
  const [sheet, setSheet] = useState(false);
  const c = d?.complaint;
  if (!c) return <VPage title="Шағым" back><Sk h={80} /><Sk h={200} /></VPage>;
  const open = c.status === "new" || (c.status === "rejected" && !c.byAdmin);
  const kv = (k: string, val: React.ReactNode) => <div className={v.kv}><span>{k}</span><b>{val}</b></div>;
  return (
    <VPage title={`Шағым №${c.no}`} back>
      <div className={v.card}><button className={v.row} onClick={() => go(`/a/packs/${c.packId}`)}>
        <Person name={c.customer} size={40} />
        <span className={v.rowText}><span className={v.rowTitle}>{c.customer}</span><span className={v.rowSub}>{`Клиент · ${c.clientPacks} пакет алған · ${c.firstComplaint ? "алғашқы шағымы" : "бұрын да шағымданған"}`}</span></span><i className={v.arrow} />
      </button></div>
      <p className={s.quoteYellow}>«{c.text}»</p>
      <h2 className={v.blueHead}>Дерек</h2>
      <div className={v.card} style={{ padding: "4px 16px" }}>
        {kv("Мекеме", c.venue)}{kv("Ұсыныс", c.offer)}{kv("Қолданылған уақыты", c.usedAt ? when(c.usedAt) : "—")}{kv("Кассир", c.cashier ?? "—")}{kv("Шегерілгені", <span className={s.red}>{`${c.units} бірлік · ${money(c.amount)}`}</span>)}{kv("Түсті", when(c.at))}
      </div>
      {c.reply && <><h2 className={v.blueHead}>{c.byAdmin ? "Medeo шешімі" : "Мекеме жауабы"}</h2><p className={s.quoteBlue}>«{c.reply}»</p></>}
      {!open && <Note tone="ok">{c.status === "refunded" ? "Шешілді: бірлік клиентке қайтарылды." : "Шешілді: шағым жабылды."}</Note>}
      {open && <Buttons main={{ text: "Шешім шығару", onClick: () => setSheet(true) }} second={{ text: "Мекемеге жазу", onClick: () => go(`/a/venues/${c.venueId}`) }} />}
      {sheet && <DecideSheet c={c} onClose={() => setSheet(false)} done={(side) => go(`/a/complaints/${c.id}/sent?side=${side}`, "up", { replace: true })} />}
    </VPage>
  );
}

/** Figma «Шешім»: клиент пайдасына / мекеме пайдасына / жартылай + екі жаққа түсініктеме */
function DecideSheet({ c, onClose, done }: { c: CFull; onClose: () => void; done: (side: string) => void }) {
  const [side, setSide] = useState<"client" | "venue" | "partial">("client");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (reply.trim().length < 3) { haptic.error(); nativeAlert("Екі жаққа түсініктеме жазыңыз."); return; }
    setBusy(true);
    try { await post(`/complaints/${c.id}/decide`, { side, reply: reply.trim() }); haptic.success(); onClose(); done(side); }
    catch { haptic.error(); nativeAlert("Жіберілмеді. Қайталап көріңіз."); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`Шешім · №${c.no}`} onClose={onClose}>
      <div className={v.card}>
        <RadioRow on={side === "client"} title="Клиент пайдасына" sub={`${c.units} бірлік пакетке оралады, мекемеден ${money(Math.round(c.amount * 0.9))} ұсталады`} onClick={() => setSide("client")} />
        <RadioRow on={side === "venue"} title="Мекеме пайдасына" sub="Шағым жабылады, өзгеріс жоқ" onClick={() => setSide("venue")} />
        <RadioRow on={side === "partial"} title="Жартылай" sub="Бірлік оралады, шығынды платформа көтереді" onClick={() => setSide("partial")} />
      </div>
      <Field label="Екі жаққа түсініктеме" value={reply} onChange={setReply} rows={2} placeholder="Қолдану екі рет тіркелген, бір бірлік қайтарылды" />
      <Buttons main={{ text: busy ? "…" : "Шешімді жіберу", onClick: () => void send(), disabled: busy }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

export function AComplaintSent() {
  const go = useGo();
  const [sp] = useSearchParams();
  const side = sp.get("side");
  return (
    <VPage>
      <div className={v.state} style={{ top: "calc(300px + var(--top-shift))" }}>
        <VSticker name="party" size={120} />
        <h2 className={v.stateTitle}>Шешім жіберілді</h2>
        <p className={v.stateText}>{side === "venue" ? "Шағым жабылды. Клиент пен мекемеге хабарлама кетті." : "Бірлік клиенттің пакетіне оралды. Клиент пен мекемеге хабарлама кетті."}</p>
      </div>
      <Buttons main={{ text: "Шағымдарға оралу", onClick: () => go("/a/complaints", "fade", { replace: true }) }} />
    </VPage>
  );
}
