// Figma «16»: Шағым: клиенттен түсті (14045:10156), Мерзімі өткен пакеттер (14071:15442).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, nativeAlert } from "../telegram";
import { api } from "../api";
import { dayMonth, hm, isToday, money, useCurrent } from "./api";
import { Buttons, Note, Person, Sk, VPage } from "./ui";
import s from "./V.module.css";

interface Complaint { id: string; status: "new" | "refunded" | "rejected"; text: string; reason: string | null; reply: string | null; at: string; decidedAt: string | null; customer: string; offer: string; usedAt: string | null; units: number; amount: number; dueAt: string }
const statusTag = { new: ["Жаңа", "tagYellow"], refunded: ["Қайтарылды", "tagGreen"], rejected: ["Қайтарылмады", "tagGray"] } as const;
const when = (d: string) => `${isToday(d) ? "бүгін" : dayMonth(d)} ${hm(d)}`;

export function VComplaints() {
  const go = useGo();
  const me = useCurrent();
  const [list, setList] = useState<Complaint[] | null>(null);
  useEffect(() => { if (me) api<{ complaints: Complaint[] }>(`/v1/venue/${me.venue.id}/complaints`).then((r) => setList(r.complaints)).catch(() => setList([])); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <VPage title="Шағымдар" back>
      {list === null ? <Sk h={90} /> : list.length === 0 ? <div className={s.card}><div className={s.row}><span className={s.rowSub}>Шағым жоқ — жақсы жұмыс!</span></div></div>
        : <div className={s.card}>{list.map((c) => { const [t, k] = statusTag[c.status]; return (
          <button key={c.id} className={s.row} onClick={() => go(`/v/complaints/${c.id}`)}>
            <Person name={c.customer} size={40} />
            <span className={s.rowText}><span className={s.rowTitle}>{c.customer}<span className={`${s.tag} ${s[k]}`}>{t}</span></span><span className={s.rowSub}>{c.offer} • {when(c.at)}</span></span><i className={s.arrow} />
          </button>); })}</div>}
      <Note>Шағымға 24 сағат ішінде жауап беріңіз. Қате расталса — «Қайтару»: дана клиенттің пакетіне оралады.</Note>
    </VPage>
  );
}

export function VComplaint() {
  const go = useGo();
  const me = useCurrent();
  const { id = "" } = useParams();
  const [c, setC] = useState<Complaint | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) api<{ complaints: Complaint[] }>(`/v1/venue/${me.venue.id}/complaints`).then((r) => { const x = r.complaints.find((y) => y.id === id) ?? null; setC(x); setReply(x?.reply ?? ""); }).catch(() => null); }, [me?.venue.id, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const resolve = useCallback(async (action: "refund" | "reject") => {
    if (!me || !c || busy) return;
    if (action === "reject" && reply.trim().length < 3) { haptic.error(); return nativeAlert("Қайтармасаңыз, клиентке себебін жазыңыз."); }
    setBusy(true);
    try {
      const r = await api<{ returned: number }>(`/v1/venue/${me.venue.id}/complaints/${c.id}/resolve`, { method: "POST", body: JSON.stringify({ action, reply: reply.trim() }) });
      haptic.success();
      if (action === "refund") go(`/v/refunded/${r.returned}`, "up", { replace: true }); else go(-1, "back");
    } catch { haptic.error(); nativeAlert("Сақталмады. Қайталап көріңіз."); } finally { setBusy(false); }
  }, [me, c, busy, reply, go]);
  if (!c) return <VPage title="Шағым" back><Sk h={80} /><Sk h={120} /></VPage>;
  const [t, k] = statusTag[c.status];
  const hoursLeft = Math.max(0, Math.round((new Date(c.dueAt).getTime() - Date.now()) / 3600_000));
  return (
    <VPage title="Шағым" back>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className={`${s.tag} ${s[k]}`}>{t}</span>{c.status === "new" && <span className={`t-cap1 ${s.muted}`}>{hoursLeft} сағат ішінде жауап бер</span>}</div>
      <div className={s.card}><div className={s.row}><Person name={c.customer} size={40} /><span className={s.rowText}><span className={s.rowTitle}>{c.customer}</span><span className={s.rowSub}>{c.offer} • {c.usedAt ? when(c.usedAt) : when(c.at)} • {c.units} бірлік • {money(c.amount)}</span></span></div></div>
      <h2 className={s.blueHead}>Клиент жазған{c.reason ? ` · ${c.reason}` : ""}</h2>
      <p className="t-sub2 infoBox" style={{ margin: 0 }}>{c.text}</p>
      {c.status === "new" ? (
        <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
          <span className="t-cap1" style={{ color: "var(--link)" }}>Жауабың</span>
          <textarea rows={2} maxLength={300} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Тексердім, түзетемін…" style={{ display: "block", width: "100%", border: 0, outline: 0, resize: "none", background: "none", font: "inherit", fontSize: 17, lineHeight: "22px", padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        </label>
      ) : c.reply && <><h2 className={s.blueHead}>Сіздің жауабыңыз</h2><p className="t-sub2 infoBox infoOk" style={{ margin: 0 }}>{c.reply}</p></>}
      {c.status === "new" && <Buttons main={{ text: busy ? "…" : "Қайтару", onClick: () => void resolve("refund"), disabled: busy }} second={{ text: "Қайтармау", onClick: () => void resolve("reject") }} />}
    </VPage>
  );
}

interface Expired { id: string; title: string; customer: string; units: number; expiredAt: string; state: "waiting" | "credited" | "carried"; daysLeft: number; amount: number; venueAmount: number }
export function VExpired() {
  const me = useCurrent();
  const [d, setD] = useState<{ summary: { waitingPacks: number; waitingUnits: number; creditedMonth: number; creditedUnits: number }; items: Expired[] } | null>(null);
  useEffect(() => { if (me) api<NonNullable<typeof d>>(`/v1/venue/${me.venue.id}/expired`).then(setD).catch(() => null); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const icon = { waiting: ["#ff9500", "◷"], credited: ["#31d158", "✓"], carried: ["#8e8e93", "↻"] } as const;
  return (
    <VPage title="Мерзімі өткен пакеттер" back>
      <Note>Пакеттің мерзімі өткен соң 3 күн күтеміз. Клиент осы уақытта қайта алса, қалған бірліктер жаңа пакетке көшеді. Алмаса, қалдық сомасы комиссия ұсталып, сізге өтеді.</Note>
      <div className={s.stats}>
        <div className={s.stat}><span className={s.statLabel}>Күту кезеңінде</span><span className={s.statNum}>{d ? `${d.summary.waitingPacks} пакет` : "–"}</span>{d && <span className={`${s.tag} ${s.tagYellow}`} style={{ alignSelf: "flex-start" }}>{d.summary.waitingUnits} бірлік</span>}</div>
        <div className={s.stat}><span className={s.statLabel}>Осы айда түсті</span><span className={s.statNum}>{d ? money(d.summary.creditedMonth) : "–"}</span>{d && <span className={`${s.tag} ${s.tagGray}`} style={{ alignSelf: "flex-start" }}>{d.summary.creditedUnits} бірлік</span>}</div>
      </div>
      {d === null ? <Sk h={150} /> : d.items.length === 0 ? <div className={s.card}><div className={s.row}><span className={s.rowSub}>Мерзімі өткен пакет жоқ</span></div></div>
        : <div className={s.card}>{d.items.map((x) => (
          <div key={x.id} className={s.row}>
            <span style={{ width: 36, height: 36, borderRadius: 9, background: icon[x.state][0], color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>{icon[x.state][1]}</span>
            <span className={s.rowText}><span className={s.rowTitle}>{x.title} · {x.units} бірлік</span>
              <span className={s.rowSub} style={{ whiteSpace: "normal" }}>{x.state === "waiting" ? `${x.customer} • ${isToday(x.expiredAt) ? "бүгін" : dayMonth(x.expiredAt)} бітті • ${x.daysLeft} күн қалды` : x.state === "credited" ? `${dayMonth(x.expiredAt)} • күту кезеңі бітті` : `${dayMonth(x.expiredAt)} • клиент қайта алды, бірліктер көшті`}</span></span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              {x.state === "carried" ? <b className={s.lead} style={{ fontSize: 15 }}>көшті</b> : <b className={x.state === "credited" ? s.plus : s.lead} style={{ fontSize: 15 }}>{x.state === "credited" ? "+" : ""}{money(x.venueAmount)}</b>}
              {x.state !== "carried" && <span className={`t-cap1 ${s.muted}`}>{x.state === "waiting" ? "күтуде" : "түсті"}</span>}
            </span>
          </div>
        ))}</div>}
    </VPage>
  );
}
