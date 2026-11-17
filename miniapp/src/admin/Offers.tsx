// Figma «04 · Ұсыныстар модерациясы» (14064:9732): Модерация кезегі (Жаңа / Өзгертілген), Ұсынысты тексеру, Түзету сұрау,
// Барлық ұсыныстар (іздеу), Ұсынысты тоқтату.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, nativeAlert } from "../telegram";
import { useCached } from "../venue/api";
import { Buttons, Note, OfferPic, Sheet, Sk, VPage, VSticker } from "../venue/ui";
import { A, money, post } from "./api";
import { Field, PinSheet } from "./ui";
import type { OfferKind } from "../mocks/offers";
import v from "../venue/V.module.css";
import s from "./A.module.css";

interface ORow { id: string; title: string; units: number; unitName: string; price: number; regular: number; discount: number; unitPrice: number; status: string; venue: string; venueId: string; kind: OfferKind; sold: number; isNew: boolean; reviewNote: { field?: string; text?: string } | null }
type Tab = "queue" | "active" | "stopped";

export function AOffers() {
  const go = useGo();
  const [sp] = useSearchParams();
  const venue = sp.get("venue") ?? "";
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) || "queue");
  const [q, setQ] = useState(""); const [qq, setQq] = useState("");
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const [d] = useCached<{ counts: { queue: number; active: number; stopped: number }; offers: ORow[] }>(`a:offers:${tab}:${qq}:${venue}`, () => A(`/offers?tab=${tab}&q=${encodeURIComponent(qq)}&venue=${venue}`));
  const row = (o: ORow, right: React.ReactNode) => (
    <button key={o.id} className={v.row} style={{ minHeight: 64 }} onClick={() => go(`/a/offers/${o.id}`)}>
      <span className={v.ic}><OfferPic kind={o.kind} size={26} /></span>
      <span className={v.rowText}><span className={v.rowTitle}>{o.title} · {o.units} {o.unitName}</span><span className={v.rowSub}>{o.venue} · {money(o.price)}{tab === "queue" ? ` · ▼ ${o.discount}%` : ""}</span></span>
      {right}
    </button>
  );
  const tag = (o: ORow) => o.isNew ? <span className={v.tag}>Жаңа</span> : <span className={`${v.tag} ${v.tagYellow}`}>Өзгертілген</span>;
  const list = d?.offers ?? [];
  return (
    <VPage title="Ұсыныстар" back>
      <div className={v.seg}>{([["queue", "Кезек"], ["active", "Белсенді"], ["stopped", "Тоқтатылған"]] as const).map(([k, t]) => (
        <button key={k} className={`${v.segBtn} ${tab === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setTab(k); }}>{t}{d && k !== "stopped" ? ` · ${d.counts[k]}` : ""}</button>
      ))}</div>
      {tab !== "queue" && <label className={s.search}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ұсыныс немесе мекеме" /></label>}
      {!d ? <Sk h={200} /> : list.length === 0 ? (
        <div className={v.result}><VSticker name="sleep" size={100} /><h2 className={v.stateTitle}>{tab === "queue" ? "Кезек бос" : "Ұсыныс жоқ"}</h2><p className={v.stateText}>{tab === "queue" ? "Мекемелер жаңа ұсыныс жарияласа, осында түседі." : "Іздеу сөзін өзгертіп көріңіз."}</p></div>
      ) : tab === "queue" ? <>
        {list.some((o) => o.isNew) && <><h2 className={v.blueHead}>Жаңа</h2><div className={v.card}>{list.filter((o) => o.isNew).map((o) => row(o, <>{tag(o)}<i className={v.arrow} /></>))}</div></>}
        {list.some((o) => !o.isNew) && <><h2 className={v.blueHead}>Өзгертілген</h2><div className={v.card}>{list.filter((o) => !o.isNew).map((o) => row(o, <>{tag(o)}<i className={v.arrow} /></>))}</div></>}
      </> : <div className={v.card}>{list.map((o) => row(o, <span className={s.right}><b>{o.sold}</b><span>пакет</span></span>))}</div>}
    </VPage>
  );
}

interface OFull extends ORow { about: string; photosList: string[]; regularUnitPrice: number; kindName: string; validDays: number; checks: { t: string; sub: string; s: "ok" | "check" | "fail" }[] }
const FIELDS = [["price", "Баға"], ["photo", "Фото"], ["about", "Сипаттама"], ["discount", "Жеңілдік"], ["other", "Басқа"]] as const;
export function AOffer() {
  const go = useGo();
  const { id = "" } = useParams();
  const [d, , reload] = useCached<{ offer: OFull }>(`a:offer:${id}`, () => A(`/offers/${id}`));
  const [sheet, setSheet] = useState<"fix" | "stop" | "preview" | null>(null);
  const [busy, setBusy] = useState(false);
  const o = d?.offer;
  if (!o) return <VPage title="Тексеру" back><Sk h={120} /><Sk h={240} /></VPage>;
  const approve = async () => { if (busy) return; setBusy(true); try { await post(`/offers/${o.id}/approve`); haptic.success(); go(-1, "back"); } catch { haptic.error(); nativeAlert("Бекітілмеді."); } finally { setBusy(false); } };
  return (
    <VPage title={o.status === "review" ? "Тексеру" : "Ұсыныс"} back>
      <div className={v.card} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className={v.ic} style={{ width: 48, height: 48 }}><OfferPic kind={o.kind} size={30} /></span>
          <span className={v.rowText}><b className={v.rowTitle} style={{ fontSize: 19 }}>{o.title} · {o.units} {o.unitName}</b><span className={v.rowSub}>{o.venue} · {o.kindName} · {o.validDays} күн</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b style={{ fontSize: 26, color: "var(--text-strong)" }}>{money(o.price)}</b>
          <span className={s.pillUp}>▼ {o.discount}%</span>
          <span className={`${v.tag} ${v.tagYellow}`}>{money(o.unitPrice)} / {o.unitName}</span>
        </div>
        <span className={v.rowSub}>Бөлек баға: {money(o.regular)} · үнем {money(o.regular - o.price)}</span>
      </div>
      {o.reviewNote?.text && <Note tone="warn">{o.reviewNote.field === "stopped" ? "Тоқтату себебі" : "Сұралған түзету"}: {o.reviewNote.text}</Note>}
      <h2 className={v.blueHead}>Тексеру парағы</h2>
      <div className={v.card}>{o.checks.map((c) => (
        <div key={c.t} className={v.row} style={{ ["--inset" as string]: "52px" }}>
          <span className={c.s === "ok" ? s.ok : c.s === "check" ? s.wait : s.bad}>{c.s === "ok" ? "✓" : c.s === "check" ? "◷" : "✕"}</span>
          <span className={v.rowText}><span className={v.rowTitle}>{c.t}</span><span className={v.rowSub} style={{ whiteSpace: "normal" }}>{c.sub}</span></span>
        </div>
      ))}</div>
      <div className={v.card}><button className={v.row} onClick={() => setSheet("preview")}><span className={v.ic} style={{ background: "#8e8e93", color: "#fff" }}>👁</span><span className={v.rowText}><span className={v.rowTitle}>Клиент көретін көрініс</span></span><i className={v.arrow} /></button></div>
      {o.status === "review" && <Buttons main={{ text: busy ? "…" : "Бекіту", onClick: () => void approve(), disabled: busy }} second={{ text: "Түзету сұрау", onClick: () => setSheet("fix") }} />}
      {o.status === "active" && <Buttons main={{ text: "Тоқтату", danger: true, onClick: () => setSheet("stop") }} />}
      {sheet === "fix" && <FixSheet id={o.id} onClose={() => setSheet(null)} done={() => go(-1, "back")} />}
      {sheet === "stop" && <StopOffer id={o.id} title={o.title} onClose={() => setSheet(null)} done={() => void reload()} />}
      {sheet === "preview" && (
        <Sheet title="Клиент көретін көрініс" onClose={() => setSheet(null)}>
          {o.photosList?.[0] ? <img src={o.photosList[0]} alt="" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 16 }} /> : <div className={v.card} style={{ height: 160, display: "grid", placeItems: "center" }}><OfferPic kind={o.kind} size={64} /></div>}
          <b className={v.rowTitle} style={{ fontSize: 22 }}>{o.title} · {o.units} {o.unitName}</b>
          <span className={v.rowSub}>{o.venue} · {money(o.price)} · −{o.discount}%</span>
          <p className="t-sub2" style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-strong)" }}>{o.about || "Сипаттама жоқ"}</p>
        </Sheet>
      )}
    </VPage>
  );
}

/** Figma «Түзету сұрау»: өріс чиптері + мекемеге хабарлама; «Мүлде қайтару» */
function FixSheet({ id, onClose, done }: { id: string; onClose: () => void; done: () => void }) {
  const [field, setField] = useState<(typeof FIELDS)[number][0]>("price");
  const [text, setText] = useState("");
  const send = async (reject = false) => {
    if (text.trim().length < 3) { haptic.error(); nativeAlert("Мекемеге не түзету керегін жазыңыз."); return; }
    try { await post(`/offers/${id}/fix`, { field, text: text.trim(), reject }); haptic.success(); onClose(); done(); } catch { haptic.error(); }
  };
  return (
    <Sheet title="Түзету сұрау" onClose={onClose}>
      <p className={s.pinText} style={{ textAlign: "left" }}>Ұсыныс мекемеге қайтарылады, түзеткен соң кезекке қайта түседі.</p>
      <div className={s.chipsWrap}>{FIELDS.map(([k, t]) => <button key={k} className={`${v.chip} ${field === k ? v.chipOn : ""}`} onClick={() => { haptic.select(); setField(k); }}>{t}</button>)}</div>
      <Field label="Мекемеге хабарлама" value={text} onChange={setText} rows={2} placeholder="Бөлек бағаны мәзірмен сәйкестендіріңіз" />
      <Buttons main={{ text: "Түзетуге жіберу", onClick: () => void send() }} second={{ text: "Мүлде қайтару", onClick: () => void send(true) }} />
    </Sheet>
  );
}
function StopOffer({ id, title, onClose, done }: { id: string; title: string; onClose: () => void; done: () => void }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState(false);
  if (pin) return <PinSheet text={`«${title}» ұсынысын тоқтату.`} onClose={onClose} run={async (p) => { await post(`/offers/${id}/stop`, { reason: reason.trim(), pin: p }); done(); }} />;
  return (
    <Sheet title="Ұсынысты тоқтату" onClose={onClose}>
      <Note tone="warn">Жаңа сатылым тоқтайды. Сатылған пакеттер мерзімі біткенше жарамды.</Note>
      <Field label="Себебі (мекемеге көрінеді)" value={reason} onChange={setReason} placeholder="Баға шынайы емес" />
      <Buttons main={{ text: "Тоқтату", danger: true, onClick: () => { if (reason.trim().length < 3) { haptic.error(); return; } setPin(true); } }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
