// Figma «10 · Пікірлер»: Пікірлер (14011:9042), Пікірге жауап (14011:9146), Пікірлер: бос (14011:9272).
import { useCallback, useEffect, useState } from "react";
import { haptic } from "../telegram";
import { api } from "../api";
import { dayMonth, useCurrent } from "./api";
import { Buttons, Person, Sheet, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

interface Review { id: string; stars: number; text: string | null; reply: string | null; at: string; customer: string; offer: string | null; branch: string | null }
interface Data { summary: { avg: number | null; count: number; dist: number[]; noReply: number }; items: Review[] }

const Stars = ({ n, size = 16 }: { n: number; size?: number }) => (
  <span style={{ display: "inline-flex", gap: 2 }}>{[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ fontSize: size, lineHeight: 1, color: i <= n ? "#ffb800" : "#d5dae0" }}>★</span>)}</span>
);

export function VReviews() {
  const me = useCurrent();
  const [f, setF] = useState<"all" | "noreply" | "low">("all");
  const [d, setD] = useState<Data | null>(null);
  const [reply, setReply] = useState<Review | null>(null);
  const load = useCallback(() => { if (me) api<Data>(`/v1/venue/${me.venue.id}/reviews?filter=${f}`).then(setD).catch(() => setD({ summary: { avg: null, count: 0, dist: [0, 0, 0, 0, 0], noReply: 0 }, items: [] })); }, [me?.venue.id, f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  if (d && d.summary.count === 0) return (
    <VPage title="Пікірлер" back>
      <VSticker name="love" size={120} at={[146, 150]} />
      <div style={{ marginTop: 190, textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <h2 className={s.stateTitle}>Әзірге пікір жоқ</h2>
        <p className={s.stateText}>Клиенттер пакетті қолданған соң баға қалдырады. Пікірлер осында көрінеді, оларға жауап бере аласыз.</p>
      </div>
    </VPage>
  );
  const max = Math.max(1, ...(d?.summary.dist ?? [1]));
  return (
    <VPage title="Пікірлер" back>
      <div className={s.card} style={{ display: "flex", alignItems: "center", gap: 20, padding: "18px 18px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 92 }}>
          <b style={{ fontSize: 34, lineHeight: "40px", fontWeight: 700, color: "var(--text-strong)" }}>{d?.summary.avg?.toFixed(1).replace(".", ",") ?? "–"}</b>
          <Stars n={Math.round(d?.summary.avg ?? 0)} />
          <span className={`t-cap1 ${s.muted}`}>{d ? `${d.summary.count} пікір` : ""}</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {[5, 4, 3, 2, 1].map((st, i) => (
            <span key={st} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`t-cap1 ${s.muted}`} style={{ width: 10 }}>{st}</span>
              <span style={{ flex: 1, height: 6, borderRadius: 3, background: "#e9edf1", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${((d?.summary.dist[i] ?? 0) / max) * 100}%`, background: "#ffb800", borderRadius: 3 }} /></span>
            </span>
          ))}
        </div>
      </div>
      <div className={s.chips}>
        {([["all", "Барлығы"], ["noreply", `Жауапсыз${d?.summary.noReply ? " · " + d.summary.noReply : ""}`], ["low", "Төмен баға"]] as const).map(([k, t]) => (
          <button key={k} className={`${s.chip} ${f === k ? s.chipOn : ""}`} onClick={() => { haptic.select(); setF(k); }}>{t}</button>
        ))}
      </div>
      {d === null ? <><Sk h={120} /><Sk h={120} /></> : d.items.length === 0 ? <div className={s.card}><div className={s.row}><span className={s.rowSub}>Бұл сүзгіде пікір жоқ</span></div></div>
        : d.items.map((r) => (
          <div key={r.id} className={s.card} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Person name={r.customer} size={36} />
              <span className={s.rowText}><b className={s.lead}>{r.customer}</b><span className={s.rowSub}>{dayMonth(r.at)}{r.branch ? ` • ${r.branch}` : ""}</span></span>
              <Stars n={r.stars} />
            </div>
            {r.text && <p style={{ fontSize: 16, lineHeight: "22px", color: "var(--text-strong)" }}>{r.text}</p>}
            {r.reply && <p className="t-sub2 infoBox" style={{ margin: 0 }}><b style={{ fontWeight: 600 }}>Сіздің жауабыңыз:</b> {r.reply}</p>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {r.offer ? <span className={`${s.tag} ${s.tagGray}`}>{r.offer}</span> : <span />}
              {r.reply ? <span className={`${s.tag} ${s.tagGreen}`}>Жауап берілді</span> : <button className={s.textBtn} onClick={() => { haptic.tap(); setReply(r); }}>Жауап беру</button>}
            </div>
          </div>
        ))}
      {reply && <ReplySheet r={reply} onClose={() => setReply(null)} onDone={() => { setReply(null); load(); }} />}
    </VPage>
  );
}

function ReplySheet({ r, onClose, onDone }: { r: Review; onClose: () => void; onDone: () => void }) {
  const me = useCurrent();
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!me || t.trim().length < 2 || busy) return;
    setBusy(true);
    try { await api(`/v1/venue/${me.venue.id}/reviews/${r.id}/reply`, { method: "POST", body: JSON.stringify({ text: t.trim() }) }); haptic.success(); onDone(); } catch { haptic.error(); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Пікірге жауап" onClose={onClose} grab={false}>
      <p className={s.muted} style={{ marginTop: -6 }}>{`${r.customer} • ${r.stars} жұлдыз`}</p>
      <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
        <span className="t-cap1" style={{ color: "var(--link)" }}>Жауабың</span>
        <textarea autoFocus rows={2} maxLength={300} value={t} onChange={(e) => setT(e.target.value)} placeholder="Рақмет! Келесіде де күтеміз"
          style={{ display: "block", width: "100%", border: 0, outline: 0, resize: "none", background: "none", font: "inherit", fontSize: 17, lineHeight: "22px", padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
      </label>
      <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>Жауап барлық клиентке көрінеді</p>
      <div className={s.chips} style={{ flexWrap: "wrap" }}>
        {["Рақмет!", "Кешіріңіз, түзетеміз", "Қайта келіңіз"].map((x) => <button key={x} className={s.chip} onClick={() => { haptic.select(); setT((v) => (v ? v + " " : "") + x); }}>{x}</button>)}
      </div>
      <Buttons main={{ text: busy ? "Жіберілуде…" : "Жіберу", onClick: () => void send(), disabled: t.trim().length < 2 || busy }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
