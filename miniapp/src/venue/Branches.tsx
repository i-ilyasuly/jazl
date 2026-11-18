// Figma «07 · Филиалдар»: тізім (14009:8007), Филиалды өңдеу (14019:7998, 8183), Жұмыс уақытын таңдау (14019:8272),
// 24/7 режимі (14019:8414), Мереке күнін қосу (14019:8520), Уақытша жабу (14009:8193).
// Ереже: жұмыс уақытынан тыс не уақытша жабық филиалда QR төлем қабылданбайды (бэкенд hours.ts).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, nativeAlert, nativePick } from "../telegram";
import { Switch } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { api } from "../api";
import { err, loadStaff, useCurrent } from "./api";
import { Buttons, Note, Sheet, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

interface Day { on: boolean; open: string; close: string }
interface Holiday { name: string; from: string; to: string; closed: boolean; open?: string; close?: string }
interface Status { open: boolean; kind: "open" | "temp" | "holiday" | "247" | "closed" | "unknown"; until: string | null; reason?: string | null }
interface Branch { id: string; address: string; is247: boolean; hours: { days?: Day[]; daily?: [string, string] } | null; holidays: Holiday[]; status: Status; today: number; cashiers: number }

const DOW = ["Дүйсенбі", "Сейсенбі", "Сәрсенбі", "Бейсенбі", "Жұма", "Сенбі", "Жексенбі"];
const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const dm = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;
const weekOf = (b: Branch): Day[] => b.hours?.days ?? Array.from({ length: 7 }, () => ({ on: true, open: b.hours?.daily?.[0] ?? "09:00", close: b.hours?.daily?.[1] ?? "22:00" }));

function pill(st: Status): [string, string] {
  if (st.kind === "temp") return [`Уақытша жабық${st.until ? ` • ${st.until}-ге дейін` : ""}`, "tagYellow"];
  if (st.kind === "247") return ["24/7 • Тәулік бойы ашық", "tag"];
  if (st.kind === "holiday") return st.open ? [`${st.reason} • ${st.until}-ге дейін`, "tagGreen"] : [`${st.reason} • жабық`, "tagYellow"];
  if (st.open) return [`Ашық${st.until ? ` • ${st.until}-ге дейін` : ""}`, "tagGreen"];
  return [`Жабық${st.until ? ` • ${st.until}-де ашылады` : ""}`, "tagGray"];
}

export function VBranches() {
  const go = useGo();
  const me = useCurrent();
  const [data, setData] = useState<{ today: number; branches: Branch[] } | null>(null);
  const [closeFor, setCloseFor] = useState<Branch | null>(null);
  const load = useCallback(() => { if (me) api<{ today: number; branches: Branch[] }>(`/v1/venue/${me.venue.id}/branches`).then(setData).catch(() => setData({ today: 0, branches: [] })); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  async function toggle(b: Branch, on: boolean) {
    if (!me) return;
    if (!on) { setCloseFor(b); return; }
    await api(`/v1/venue/${me.venue.id}/branches/${b.id}/open`, { method: "POST" }).catch(() => null); haptic.success(); load();
  }
  const [adding, setAdding] = useState(false);
  const [addr, setAddr] = useState("");
  async function add() {
    if (!me || addr.trim().length < 3) return;
    try { const r = await api<{ id: string }>(`/v1/venue/${me.venue.id}/branches`, { method: "POST", body: JSON.stringify({ address: addr.trim() }) }); await loadStaff(); setAdding(false); setAddr(""); go(`/v/branches/${r.id}`); } catch { haptic.error(); }
  }
  return (
    <VPage title="Филиалдар" back>
      <VSticker name="city" size={92} at={[300, 92]} />
      <div style={{ minHeight: 70 }}>
        <h1 className={s.h1}>{data ? `${data.branches.length} филиал` : " "}</h1>
        <p className={s.muted} style={{ marginTop: 4 }}>{data ? `Бүгін ${data.today} қолдану` : " "}</p>
      </div>
      {data === null ? <><Sk h={110} /><Sk h={110} /></> : data.branches.map((b) => {
        const [t, c] = pill(b.status);
        return (
          <div key={b.id} className={s.oc}>
            <div className={s.ocTop}>
              <span className={s.ocPic} style={{ width: 44, height: 44, borderRadius: 12, background: "var(--hl-blue-bg)" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#229af0" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg></span>
              <span className={s.rowText}><b className={s.lead} style={{ fontSize: 18 }}>{b.address}</b><span className={`${s.tag} ${s[c]}`} style={{ alignSelf: "flex-start", marginTop: 4 }}>{t}</span></span>
              <Switch on={b.status.kind !== "temp"} onChange={(v) => void toggle(b, v)} />
            </div>
            <div className={s.ocBottom}><span className={s.rowSub}>{`Бүгін ${b.today} қолдану • ${b.cashiers} кассир`}</span><button className={s.textBtn} onClick={() => go(`/v/branches/${b.id}`)}>Өңдеу</button></div>
          </div>
        );
      })}
      {me?.role === "owner" && <button className={s.card} style={{ height: 64, border: "1.5px dashed #229af0", background: "none", color: "var(--link)", fontSize: 17, fontWeight: 600 }} onClick={() => setAdding(true)}>+ Филиал қосу</button>}
      {adding && <Sheet title="Филиал қосу" onClose={() => setAdding(false)} grab={false}>
        <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
          <span className="t-cap1" style={{ color: "var(--link)" }}>Мекенжай</span>
          <input autoFocus value={addr} maxLength={120} placeholder="Бұхар-Жырау, 52" onChange={(e) => setAddr(e.target.value)} style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        </label>
        <Note>Жаңа филиал әдепкіде күн сайын 09:00 – 22:00 жұмыс істейді. Кейін «Өңдеу» арқылы өзгертесіз.</Note>
        <Buttons main={{ text: "Қосу", onClick: () => void add(), disabled: addr.trim().length < 3 }} second={{ text: "Бас тарту", onClick: () => setAdding(false) }} />
      </Sheet>}
      {closeFor && <CloseSheet b={closeFor} onClose={() => setCloseFor(null)} onDone={() => { setCloseFor(null); load(); }} />}
    </VPage>
  );
}

/** Figma «Уақытша жабу» */
function CloseSheet({ b, onClose, onDone }: { b: Branch; onClose: () => void; onDone: () => void }) {
  const me = useCurrent();
  const [f, setF] = useState<"1h" | "3h" | "today" | "tomorrow">("1h");
  const [reason, setReason] = useState("Үзіліс");
  const save = async () => {
    if (!me) return;
    try { await api(`/v1/venue/${me.venue.id}/branches/${b.id}/close`, { method: "POST", body: JSON.stringify({ for: f, reason }) }); haptic.success(); onDone(); } catch { haptic.error(); }
  };
  return (
    <Sheet title="Уақытша жабу" onClose={onClose} grab={false}>
      <h3 className={s.blueHead}>Қанша уақытқа</h3>
      <div className={s.chips} style={{ flexWrap: "wrap" }}>{([["1h", "1 сағат"], ["3h", "3 сағат"], ["today", "Бүгін"], ["tomorrow", "Ертеңге дейін"]] as const).map(([k, t]) => <button key={k} className={`${s.chip} ${f === k ? s.chipOn : ""}`} onClick={() => { haptic.select(); setF(k); }}>{t}</button>)}</div>
      <h3 className={s.blueHead}>Себебі</h3>
      <div className={s.chips} style={{ flexWrap: "wrap" }}>{["Үзіліс", "Техникалық", "Тауар біткен", "Басқа"].map((t) => <button key={t} className={`${s.chip} ${reason === t ? s.chipOn : ""}`} onClick={() => { haptic.select(); setReason(t); }}>{t}</button>)}</div>
      <Note tone="warn">Жабық филиалда клиенттер төлем жасай алмайды, оларға «Қазір жабық» көрсетіледі.</Note>
      <Buttons main={{ text: "Жабу", onClick: () => void save() }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

export function VBranchEdit() {
  const go = useGo();
  const me = useCurrent();
  const { id = "" } = useParams();
  const [b, setB] = useState<Branch | null>(null);
  const [address, setAddress] = useState("");
  const [is247, set247] = useState(false);
  const [days, setDays] = useState<Day[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [hoursFor, setHoursFor] = useState<number | null>(null);
  const [hol, setHol] = useState<number | "new" | null>(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (me) api<{ branches: Branch[] }>(`/v1/venue/${me.venue.id}/branches`).then((r) => { const x = r.branches.find((y) => y.id === id); if (x) { setB(x); setAddress(x.address); set247(x.is247); setDays(weekOf(x)); setHolidays(x.holidays ?? []); } }).catch(() => null); }, [me?.venue.id, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const save = useCallback(async () => {
    if (!me || busy) return;
    setBusy(true); haptic.medium();
    try { await api(`/v1/venue/${me.venue.id}/branches/${id}`, { method: "PUT", body: JSON.stringify({ address, is247, days, holidays }) }); haptic.success(); await loadStaff(); go(-1, "back"); }
    catch { haptic.error(); nativeAlert("Сақталмады. Мекенжай мен уақыттарды тексеріңіз."); } finally { setBusy(false); }
  }, [me, busy, id, address, is247, days, holidays, go]);
  const remove = useCallback(async () => {
    if (!me) return;
    const r = await nativePick("Филиалды өшіру?", "Филиал тізімнен алынады. Тарихы есепте сақталады.", [{ id: "no", text: "Жоқ" }, { id: "yes", text: "Өшіру" }], "yes");
    if (r !== "yes") return;
    try { await api(`/v1/venue/${me.venue.id}/branches/${id}/remove`, { method: "POST" }); await loadStaff(); go(-1, "back"); }
    catch (e) { nativeAlert(err(e) === "last_branch" ? "Жалғыз филиалды өшіруге болмайды." : "Өшірілмеді."); }
  }, [me, id, go]);
  if (!b) return <VPage title="Филиал" back><Sk h={80} /><Sk h={200} /></VPage>;
  return (
    <VPage title={b.address} back>
      <label className={s.card} style={{ padding: "10px 16px", display: "block" }}>
        <span className={`t-cap1 ${s.muted}`}>Мекенжай</span>
        <input value={address} maxLength={120} onChange={(e) => setAddress(e.target.value)} style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, paddingTop: 4, color: "var(--text-strong)" }} />
      </label>
      <h2 className={s.blueHead}>Жұмыс уақыты</h2>
      <div className={s.card}>
        <div className={s.row}><Tile e="v:clock" size={36} /><span className={s.rowText}><span className={s.rowTitle}>24/7 жұмыс істейді</span><span className={s.rowSub}>Тәулік бойы, мереке күндері де</span></span><Switch on={is247} onChange={set247} /></div>
      </div>
      {!is247 && <>
        <button className={s.softBtn} onClick={() => setHoursFor(-1)}>⏷ Барлық күнге бірдей қою</button>
        <div className={s.card}>
          {days.map((d, i) => (
            <div key={i} className={s.row} style={{ ["--inset" as string]: "16px", minHeight: 60 }}>
              <button className={s.rowText} style={{ textAlign: "left" }} onClick={() => d.on && setHoursFor(i)}>
                <span className={s.rowTitle}>{DOW[i]}</span>
                <span className={s.rowSub} style={d.on ? { color: "var(--link)", fontWeight: 600 } : undefined}>{d.on ? `${d.open} – ${d.close} ✎` : "Демалыс"}</span>
              </button>
              <Switch on={d.on} onChange={(v) => setDays(days.map((x, k) => (k === i ? { ...x, on: v } : x)))} />
            </div>
          ))}
        </div>
      </>}
      <h2 className={s.blueHead}>Мереке және ерекше күндер</h2>
      {holidays.length > 0 && <div className={s.card}>
        {holidays.map((h, i) => (
          <button key={i} className={s.row} style={{ ["--inset" as string]: "16px" }} onClick={() => setHol(i)}>
            <span className={s.rowText}><span className={s.rowTitle}>{h.name}</span><span className={s.rowSub}>{h.from === h.to ? dm(h.from) : `${dm(h.from).split(" ")[0]}–${dm(h.to)}`} • {h.closed ? "жабық" : `${h.open} – ${h.close}`}</span></span><i className={s.arrow} />
          </button>
        ))}
      </div>}
      <button className={s.card} style={{ height: 56, border: "1.5px dashed #229af0", background: "none", color: "var(--link)", fontSize: 17, fontWeight: 600 }} onClick={() => setHol("new")}>+ Күн қосу</button>
      <h2 className={s.blueHead}>Уақытша жабу</h2>
      <div className={s.card}>
        <button className={s.row} onClick={() => (b.status.kind === "temp" ? void api(`/v1/venue/${me!.venue.id}/branches/${id}/open`, { method: "POST" }).then(load) : setClosing(true))}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: "#ff9500", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>❚❚</span>
          <span className={s.rowText}><span className={s.rowTitle}>{b.status.kind === "temp" ? "Филиалды қазір ашу" : "Филиалды уақытша жабу"}</span><span className={s.rowSub}>{b.status.kind === "temp" ? pill(b.status)[0] : "Клиентке «Қазір жабық» көрсетіледі"}</span></span><i className={s.arrow} />
        </button>
      </div>
      <Note>Жұмыс уақытынан тыс QR төлем қабылданбайды.</Note>
      <Buttons main={{ text: busy ? "Сақталуда…" : "Сақтау", onClick: () => void save(), disabled: busy || address.trim().length < 3 }} second={{ text: "Өшіру", onClick: () => void remove() }} />
      {hoursFor !== null && <HoursSheet title={hoursFor < 0 ? "Барлық күн: жұмыс уақыты" : `${DOW[hoursFor]}: жұмыс уақыты`} day={days[Math.max(0, hoursFor)]} all={hoursFor < 0}
        onClose={() => setHoursFor(null)} onSave={(d, all) => { setDays(all ? days.map((x) => ({ ...x, open: d.open, close: d.close, on: true })) : days.map((x, k) => (k === hoursFor ? d : x))); setHoursFor(null); }} />}
      {hol !== null && <HolidaySheet h={hol === "new" ? null : holidays[hol]} onClose={() => setHol(null)}
        onSave={(h) => { setHolidays(hol === "new" ? [...holidays, h] : holidays.map((x, k) => (k === hol ? h : x))); setHol(null); }}
        onDelete={hol === "new" ? undefined : () => { setHolidays(holidays.filter((_, k) => k !== hol)); setHol(null); }} />}
      {closing && <CloseSheet b={b} onClose={() => setClosing(false)} onDone={() => { setClosing(false); load(); }} />}
    </VPage>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
function Wheel({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const i = Math.max(0, HOURS.indexOf(value));
  return (
    <div className={s.card} style={{ flex: 1, padding: "8px 0", textAlign: "center" }}>
      <span className={`t-cap1 ${s.muted}`}>{label}</span>
      {[-2, -1, 0, 1, 2].map((k) => {
        const v = HOURS[(i + k + 24) % 24];
        return <button key={k} onClick={() => { haptic.select(); onChange(v); }} style={{ display: "block", width: "calc(100% - 16px)", margin: "2px 8px", height: 34, borderRadius: 10, fontSize: k ? 17 : 19, fontWeight: k ? 400 : 700, color: k ? "var(--text-secondary)" : "var(--link)", background: k ? "none" : "var(--hl-blue-bg)", opacity: Math.abs(k) === 2 ? 0.5 : 1 }}>{v}</button>;
      })}
    </div>
  );
}

/** Figma «Жұмыс уақытын таңдау»: екі баған, дайын нұсқалар, «Барлық күнге бірдей қою» */
function HoursSheet({ title, day, all, onClose, onSave }: { title: string; day: Day; all: boolean; onClose: () => void; onSave: (d: Day, all: boolean) => void }) {
  const [d, setD] = useState<Day>({ ...day, on: true });
  const [toAll, setToAll] = useState(all);
  const presets: [string, string, string][] = [["09:00", "18:00", "09:00 – 18:00"], ["10:00", "22:00", "10:00 – 22:00"], ["09:00", "23:00", "09:00 – 23:00"], ["00:00", "00:00", "Тәулік бойы"]];
  return (
    <Sheet title={title} onClose={onClose} grab={false}>
      <div style={{ display: "flex", gap: 8 }}>
        <Wheel label="Ашылады" value={d.open} onChange={(open) => setD({ ...d, open })} />
        <Wheel label="Жабылады" value={d.close} onChange={(close) => setD({ ...d, close })} />
      </div>
      <div className={s.chips} style={{ flexWrap: "wrap" }}>{presets.map(([o, c, t]) => <button key={t} className={`${s.chip} ${d.open === o && d.close === c ? s.chipOn : ""}`} onClick={() => { haptic.select(); setD({ on: true, open: o, close: c }); }}>{t}</button>)}</div>
      {!all && <div className={s.card}><div className={s.row}><span className={s.rowText}><span className={s.rowTitle}>Барлық күнге бірдей қою</span><span className={s.rowSub}>Аптаның барлық күніне қолданылады</span></span><Switch on={toAll} onChange={setToAll} /></div></div>}
      <Buttons main={{ text: "Сақтау", onClick: () => onSave(d, toAll) }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Figma «Мереке немесе ерекше күн»: аты, басталу/аяқталу, «Жабық» не «Ерекше уақыт» */
function HolidaySheet({ h, onClose, onSave, onDelete }: { h: Holiday | null; onClose: () => void; onSave: (h: Holiday) => void; onDelete?: () => void }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
  const [x, setX] = useState<Holiday>(h ?? { name: "", from: today, to: today, closed: true, open: "10:00", close: "18:00" });
  const date = (label: string, v: string, on: (v: string) => void) => (
    <label className={s.card} style={{ flex: 1, padding: "10px 14px", display: "block" }}>
      <span className={`t-cap1 ${s.muted}`}>{label}</span>
      <input type="date" value={v} onChange={(e) => on(e.target.value)} style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 16, paddingTop: 4, color: "var(--text-strong)" }} />
    </label>
  );
  return (
    <Sheet title="Мереке немесе ерекше күн" onClose={onClose} grab={false}>
      <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
        <span className="t-cap1" style={{ color: "var(--link)" }}>Аты</span>
        <input value={x.name} maxLength={40} placeholder="Наурыз мейрамы" onChange={(e) => setX({ ...x, name: e.target.value })} style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
      </label>
      <div style={{ display: "flex", gap: 8 }}>{date("Басталу", x.from, (from) => setX({ ...x, from, to: x.to < from ? from : x.to }))}{date("Аяқталу", x.to, (to) => setX({ ...x, to }))}</div>
      <div className={s.seg}>
        <button className={`${s.segBtn} ${x.closed ? s.segOn : ""}`} onClick={() => setX({ ...x, closed: true })}>Жабық</button>
        <button className={`${s.segBtn} ${!x.closed ? s.segOn : ""}`} onClick={() => setX({ ...x, closed: false })}>Ерекше уақыт</button>
      </div>
      {!x.closed && <div style={{ display: "flex", gap: 8 }}>
        <Wheel label="Ашылады" value={x.open ?? "10:00"} onChange={(open) => setX({ ...x, open })} />
        <Wheel label="Жабылады" value={x.close ?? "18:00"} onChange={(close) => setX({ ...x, close })} />
      </div>}
      <Note>{x.closed ? "Осы күндері QR төлем қабылданбайды, клиентке «Қазір жабық» көрсетіледі." : "Осы күндері тек көрсетілген уақытта төлем қабылданады."}</Note>
      {onDelete && <button className={`${s.textBtn} ${s.redText}`} style={{ alignSelf: "flex-start" }} onClick={onDelete}>Күнді өшіру</button>}
      <Buttons main={{ text: h ? "Сақтау" : "Қосу", onClick: () => onSave({ ...x, name: x.name.trim(), ...(x.closed ? { open: undefined, close: undefined } : {}) }), disabled: !x.name.trim() }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
