// Figma «02 · Тіркелу» (13996:*) және «03 · Өтінім күйі» (13997:*): Дайындал ал → 8 қадам → Шарттар → Өтінім қаралуда → Мекеме тіркелді.
// Біздің жолмен келіспейтін жері: заңды тұлғаның деректері мемлекеттік дерекқордан әзірге алынбайды — БСН бақылау санымен тексеріліп,
// атауы мен басшысын өтінім беруші өзі жазады (Medeo командасы құжатпен салыстырады). Мекеме түрі (Figma 14) — 1-қадамда.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { askPhone, haptic, nativeAlert, openChat } from "../telegram";
import { Tile } from "../ui/Tile";
import { api, API_URL } from "../api";
import { SUPPORT_BOT } from "../config";
import { err, loadStaff } from "./api";
import { pickImage, uploadImage } from "./media";
import { Buttons, Note, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

type Kind = "food" | "coffee" | "hair";
interface Branch { address: string; open: string; close: string }
export interface AppData {
  kind?: Kind; name?: string; about?: string; link?: string; bin?: string; legalName?: string; director?: string; regDate?: string; authorized?: boolean;
  contactName?: string; phone?: string; email?: string; branches?: Branch[]; logoUrl?: string | null; coverUrl?: string | null; gallery?: string[];
  iban?: string; ownAccount?: boolean; agreeTerms?: boolean; agreePrivacy?: boolean;
}
interface Doc { kind: string; fileName: string; size: number; mime: string }
interface Application { id: string; status: "draft" | "review" | "need_info" | "rejected" | "approved"; data: AppData; note: string | null; submittedAt: string | null; decidedAt: string | null; venueId: string | null; docs: Doc[]; missing: string[] }

const getApp = () => api<{ application: Application | null }>("/v1/venue/application").then((r) => r.application);
const saveApp = (data: AppData) => api<{ application: Application }>("/v1/venue/application", { method: "PUT", body: JSON.stringify({ data }) }).then((r) => r.application);
const STEPS = ["", "Мекеме туралы", "Заңды тұлға", "Байланыс", "Филиалдар", "Фото", "Банк", "Құжаттар", "Тексеру"];
const KINDS: [Kind, string, string][] = [["food", "🍴", "Тағам"], ["coffee", "☕", "Кофе"], ["hair", "✂", "Шаштараз"]];

function Field({ label, value, onChange, hint, ok, inputMode, placeholder, max = 120, multiline }: { label: string; value: string; onChange: (v: string) => void; hint?: string; ok?: boolean; inputMode?: "numeric" | "tel" | "email" | "text"; placeholder?: string; max?: number; multiline?: boolean }) {
  const st = { display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, lineHeight: "22px", padding: "4px 0 8px", color: "var(--text-strong)", resize: "none" as const };
  return (
    <div>
      <label className={s.card} style={{ padding: "10px 16px 0", display: "block", position: "relative" }}>
        <span className="t-cap1" style={{ color: "var(--link)" }}>{label}</span>
        {multiline ? <textarea rows={2} maxLength={max} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={st} />
          : <input inputMode={inputMode} maxLength={max} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={st} />}
        {ok && <span style={{ position: "absolute", right: 16, top: 26, color: "#31d158", fontSize: 18, fontWeight: 700 }}>✓</span>}
      </label>
      {hint && <p className={`t-cap1 ${s.muted}`} style={{ margin: "6px 4px 0" }}>{hint}</p>}
    </div>
  );
}
const Check = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <button onClick={() => { haptic.select(); onChange(!on); }} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", fontSize: 16, lineHeight: "21px", color: "var(--text-strong)" }}>
    <span style={{ flex: "none", width: 22, height: 22, borderRadius: 6, background: on ? "#229af0" : "none", boxShadow: on ? "none" : "inset 0 0 0 2px #b0b5ba", color: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700 }}>{on ? "✓" : ""}</span>{children}
  </button>
);
function StepBar({ n }: { n: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: -4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ height: 4, borderRadius: 2, background: i < n ? "#229af0" : "var(--separator)" }} />)}</div>
      <span className={`t-cap1 ${s.muted}`}>Қадам {n} / 8 · {STEPS[n]}</span>
    </div>
  );
}

/** «Дайындал ал» (13996:7999) — өтінім жіберілген болса, күйіне бағыттайды */
export function VApplyIntro() {
  const go = useGo();
  const [a, setA] = useState<Application | null | undefined>(undefined);
  useEffect(() => { getApp().then(setA).catch(() => setA(null)); }, []);
  useEffect(() => { if (a && a.status !== "draft" && a.status !== "need_info") go("/v/apply/status", "fade", { replace: true }); }, [a, go]);
  const start = useCallback(() => { haptic.medium(); go(`/v/apply/${a ? Math.max(1, firstMissing(a)) : 1}`); }, [a, go]);
  const rows: [string, string, string][] = [["v:file", "БИН немесе ЖСН", "Заңды тұлға немесе жеке кәсіпкер"], ["v:bank", "Банк шоты (IBAN)", "Төлем осы шотқа аударылады"], ["v:photo", "Логотип және фото", "Логотип, мұқаба, кемінде 3 фото"], ["v:docs", "Құжаттар", "БИН анықтамасы, басшының жеке куәлігі"]];
  return (
    <VPage title="Тіркелу" back>
      <h1 className={s.h1} style={{ fontSize: 22 }}>Дайындап ал</h1>
      <p className={s.muted} style={{ marginTop: -6 }}>Толтыру шамамен 10–15 минут. Кез келген кезде тоқтатып, кейін жалғастыруға болады.</p>
      <div className={s.card}>{rows.map(([e, t, sub]) => <div key={t} className={s.row}><Tile e={e} size={36} /><span className={s.rowText}><span className={s.rowTitle}>{t}</span><span className={s.rowSub}>{sub}</span></span></div>)}</div>
      <Note>Мекеме қаралғанша қолданбада көрінбейді. Қарау 1 жұмыс күні.</Note>
      <Buttons main={{ text: a?.data.name ? "Жалғастыру" : "Бастау", onClick: start, disabled: a === undefined }} second={{ text: "Артқа", onClick: () => go(-1, "back") }} />
    </VPage>
  );
}
const order = ["about", "legal", "contact", "branches", "photos", "bank", "docs"];
const firstMissing = (a: Application) => { const i = order.findIndex((k) => a.missing.includes(k)); return i < 0 ? 8 : i + 1; };

export function VApplyStep() {
  const go = useGo();
  const n = Number(useParams().step ?? 1);
  const [a, setA] = useState<Application | null>(null);
  const [d, setD] = useState<AppData>({});
  const [busy, setBusy] = useState("");
  const [binOk, setBinOk] = useState<boolean | null>(null);
  const [bank, setBank] = useState<{ valid: boolean; bank: string | null; bik: string | null } | null>(null);
  const [addBranch, setAddBranch] = useState<Branch | null>(null);
  useEffect(() => { getApp().then((x) => { if (x) { setA(x); setD({ ...x.data, contactName: x.data.contactName ?? x.data.director }); } }).catch(() => null); }, []);
  useEffect(() => { if (d.bin?.length === 12) api<{ valid: boolean }>(`/v1/venue/check/bin/${d.bin}`).then((r) => setBinOk(r.valid)).catch(() => null); else setBinOk(null); }, [d.bin]);
  useEffect(() => { const v = (d.iban ?? "").replace(/\s/g, ""); if (v.length === 20) api<{ valid: boolean; bank: string | null; bik: string | null }>(`/v1/venue/check/iban/${v}`).then(setBank).catch(() => null); else setBank(null); }, [d.iban]);
  const up = (p: Partial<AppData>) => setD((x) => ({ ...x, ...p }));

  const valid = (): string | null => {
    if (n === 1) return !d.kind ? "Мекеме түрін таңдаңыз" : !d.name || d.name.trim().length < 2 ? "Мекеме атауын жазыңыз" : !d.about || d.about.trim().length < 20 ? "Сипаттама кемінде 20 таңба" : null;
    if (n === 2) return !binOk ? "БСН/ЖСН дұрыс емес (12 сан)" : !d.legalName ? "Заңды тұлғаның атауын жазыңыз" : !d.authorized ? "Өкілеттікті растаңыз" : null;
    if (n === 3) return !d.contactName ? "Байланыс тұлғасын жазыңыз" : !d.phone || !/^\+?\d[\d\s()-]{9,}$/.test(d.phone) ? "Телефон дұрыс емес" : !d.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) ? "E-mail дұрыс емес" : null;
    if (n === 4) return d.branches?.length ? null : "Кемінде бір филиал қосыңыз";
    if (n === 5) return !d.logoUrl ? "Логотип жүктеңіз" : !d.coverUrl ? "Мұқаба жүктеңіз" : (d.gallery?.length ?? 0) < 3 ? "Галереяға кемінде 3 фото қосыңыз" : null;
    if (n === 6) return !bank?.valid ? "IBAN дұрыс емес (KZ-пен басталатын 20 таңба)" : !d.ownAccount ? "Шот мекеме атына ашылғанын растаңыз" : null;
    if (n === 7) { const k = (a?.docs ?? []).map((x) => x.kind); return !k.includes("bin") ? "БИН анықтамасын жүктеңіз" : !k.includes("id") ? "Басшының жеке куәлігін жүктеңіз" : d.kind === "food" && !k.includes("halal") ? "Тамақ мекемесіне халал сертификаты керек" : null; }
    return null;
  };
  const next = useCallback(async () => {
    const e = valid(); if (e) { haptic.error(); return nativeAlert(e); }
    setBusy("save");
    try { const x = await saveApp(d); setA(x); setD(x.data); haptic.tap(); go(n < 8 ? `/v/apply/${n + 1}` : "/v/apply/terms", "forward"); }
    catch { haptic.error(); nativeAlert("Сақталмады. Желіні тексеріңіз."); } finally { setBusy(""); }
  }, [d, n, go, a, bank, binOk]); // eslint-disable-line react-hooks/exhaustive-deps — valid() a/bank/binOk-ты оқиды

  async function photo(kind: "logo" | "cover" | "gallery") {
    if (!a) { try { const x = await saveApp(d); setA(x); } catch { return; } }
    const f = await pickImage(); if (!f) return;
    setBusy(kind);
    try {
      const url = await uploadApplyImage(f, kind);
      if (kind === "logo") up({ logoUrl: url }); else if (kind === "cover") up({ coverUrl: url }); else up({ gallery: [...(d.gallery ?? []), url].slice(0, 9) });
      haptic.success();
    } catch (e) { haptic.error(); nativeAlert(err(e) === "too_large" ? "Файл 5 МБ-тан үлкен." : "Жүктелмеді. Қайталап көріңіз."); } finally { setBusy(""); }
  }
  async function doc(kind: string) {
    const x = a ?? await saveApp(d).catch(() => null); if (!x) return; setA(x);
    const f = await pickFile(); if (!f) return;
    setBusy(kind);
    try { const r = await uploadDoc(kind, f); setA((v) => v ? { ...v, docs: [...v.docs.filter((y) => y.kind !== kind), r] } : v); haptic.success(); }
    catch (e) { haptic.error(); nativeAlert(err(e) === "bad_type" ? "Тек PDF, JPG немесе PNG." : err(e) === "too_large" ? "Файл 5 МБ-тан үлкен." : "Жүктелмеді."); } finally { setBusy(""); }
  }
  if (!a && n > 1) return <VPage title={STEPS[n]} back><Sk h={80} /><Sk h={80} /></VPage>;
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const docRow = (kind: string, title: string) => {
    const x = a?.docs.find((y) => y.kind === kind);
    return (
      <>
        <h2 className={s.blueHead}>{title}</h2>
        <div className={s.card}>
          {busy === kind ? <div className={s.row}><span className={s.sk} style={{ width: 40, height: 40 }} /><span className={s.rowText}><span className={s.rowTitle}>Жүктелуде…</span></span></div>
            : x ? <div className={s.row}><Tile e="v:file" size={40} /><span className={s.rowText}><span className={s.rowTitle}>{x.fileName}</span><span className={s.rowSub}>{x.mime === "application/pdf" ? "PDF" : "Сурет"} · {(x.size / 1024 / 1024).toFixed(1)} МБ</span></span>
              <button style={{ fontSize: 22, color: "#b0b5ba", padding: 6 }} onClick={async () => { await api(`/v1/venue/application/docs/${kind}/remove`, { method: "POST" }).catch(() => null); setA((v) => v ? { ...v, docs: v.docs.filter((y) => y.kind !== kind) } : v); }}>×</button></div>
            : <button className={s.row} onClick={() => void doc(kind)}><span style={{ width: 40, textAlign: "center", fontSize: 20, color: "var(--link)" }}>📎</span><span className={s.rowText}><span className={s.rowTitle} style={{ color: "var(--link)" }}>Файл қосу</span></span></button>}
        </div>
      </>
    );
  };
  const img = (label: string, url: string | null | undefined, kind: "logo" | "cover", hint: string) => (
    <div className={s.card} style={{ border: url ? undefined : "1.5px dashed #b0c4d8", background: url ? undefined : "none" }}>
      <button className={s.row} onClick={() => void photo(kind)}>
        <span style={{ width: 44, height: 44, borderRadius: kind === "logo" ? 22 : 10, overflow: "hidden", background: url ? undefined : "var(--hl-blue-bg)", display: "grid", placeItems: "center", flex: "none" }}>
          {busy === kind ? <span className={s.sk} style={{ width: 44, height: 44 }} /> : url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--link)", fontSize: 20 }}>⇪</span>}
        </span>
        <span className={s.rowText}><span className={s.rowTitle}>{label}</span><span className={s.rowSub}>{url ? "Жүктелді" : hint}</span></span>
        {url && <span className={s.textBtn}>Өзгерту</span>}
      </button>
    </div>
  );
  return (
    <VPage title={STEPS[n]} back>
      <StepBar n={n} />
      {n === 1 && <>
        <div className={s.chips}>{KINDS.map(([k, e, t]) => <button key={k} className={`${s.chip} ${d.kind === k ? s.chipOn : ""}`} onClick={() => { haptic.select(); up({ kind: k }); }}>{e} {t}</button>)}</div>
        <Field label="Мекеме атауы" value={d.name ?? ""} max={60} onChange={(v) => up({ name: v })} hint="Клиенттер осы атауды көреді" placeholder="Dämdi Doner" />
        <Field label="Қысқаша сипаттама" value={d.about ?? ""} multiline onChange={(v) => up({ about: v })} hint="Кемінде 20 таңба" placeholder="Мысалы: үй донері, лаваш, фирмалық соустар" />
        <Field label="Instagram немесе сайт (міндетті емес)" value={d.link ?? ""} max={100} onChange={(v) => up({ link: v })} placeholder="@damdi.doner" />
      </>}
      {n === 2 && <>
        <Field label="БИН немесе ЖСН" value={d.bin ?? ""} inputMode="numeric" max={12} ok={binOk === true} onChange={(v) => up({ bin: v.replace(/\D/g, "").slice(0, 12) })} hint={binOk === false ? "БСН/ЖСН дұрыс емес: бақылау саны сәйкес келмейді" : "12 таңба"} />
        <div className={s.card}>
          <Field label="Атауы" value={d.legalName ?? ""} onChange={(v) => up({ legalName: v })} placeholder="ТОО «Дамди Донер»" />
          <Field label="Басшысы" value={d.director ?? ""} max={80} onChange={(v) => up({ director: v })} placeholder="Бекенов Нұрлан" />
          <Field label="Тіркелген күні (міндетті емес)" value={d.regDate ?? ""} max={20} onChange={(v) => up({ regDate: v })} placeholder="12.06.2018" />
        </div>
        <Check on={Boolean(d.authorized)} onChange={(v) => up({ authorized: v })}>Мен осы мекемені Medeo қолданбасында ұсынуға құқылымын</Check>
        <Note>Атауы мен басшысын БСН анықтамасындағыдай жазыңыз. Medeo командасы құжатпен салыстырып тексереді.</Note>
      </>}
      {n === 3 && <>
        <Field label="Байланыс тұлғасы" value={d.contactName ?? d.director ?? ""} max={80} onChange={(v) => up({ contactName: v })} />
        <Field label="Телефон" value={d.phone ?? ""} inputMode="tel" max={20} ok={Boolean(d.phone && /^\+?\d[\d\s()-]{9,}$/.test(d.phone))} onChange={(v) => up({ phone: v })} placeholder="+7 701 234 56 78" />
        <button className={s.textBtn} style={{ alignSelf: "flex-start", marginTop: -6 }} onClick={async () => { const p = await askPhone(); if (p) up({ phone: p.startsWith("+") ? p : "+" + p }); }}>Telegram-дағы нөмірді алу</button>
        <Field label="E-mail" value={d.email ?? ""} inputMode="email" max={80} ok={Boolean(d.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email))} onChange={(v) => up({ email: v.trim() })} placeholder="info@damdi.kz" />
        <div className={s.card}><div className={s.row}><Tile e="v:team" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Telegram аккаунты</span><span className={s.rowSub}>{tgUser?.username ? `@${tgUser.username} • расталды` : "Telegram арқылы кірдіңіз • расталды"}</span></span><span style={{ color: "#31d158", fontWeight: 700 }}>✓</span></div></div>
        <Note>Телефон мен e-mail тек қолдау және шарт үшін қолданылады, клиенттерге көрсетілмейді.</Note>
      </>}
      {n === 4 && <>
        {(d.branches ?? []).map((b, i) => (
          <div key={i} className={s.card} style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}><b className={s.lead}>{b.address}</b><button style={{ fontSize: 20, color: "#b0b5ba" }} onClick={() => up({ branches: d.branches!.filter((_, k) => k !== i) })}>×</button></span>
            <span className={s.rowSub}>Күн сайын {b.open}–{b.close}</span>
            {i === 0 && <span className={s.tag} style={{ alignSelf: "flex-start" }}>Негізгі</span>}
          </div>
        ))}
        {addBranch ? (
          <div className={s.card} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <Field label="Мекенжай" value={addBranch.address} onChange={(v) => setAddBranch({ ...addBranch, address: v })} placeholder="Нұркен Әбдіров, 24" />
            <div style={{ display: "flex", gap: 8 }}>
              <label className={s.card} style={{ flex: 1, padding: "8px 14px", display: "block" }}><span className={`t-cap1 ${s.muted}`}>Ашылады</span><input type="time" value={addBranch.open} onChange={(e) => setAddBranch({ ...addBranch, open: e.target.value })} style={{ display: "block", border: 0, background: "none", font: "inherit", fontSize: 17, color: "var(--text-strong)" }} /></label>
              <label className={s.card} style={{ flex: 1, padding: "8px 14px", display: "block" }}><span className={`t-cap1 ${s.muted}`}>Жабылады</span><input type="time" value={addBranch.close} onChange={(e) => setAddBranch({ ...addBranch, close: e.target.value })} style={{ display: "block", border: 0, background: "none", font: "inherit", fontSize: 17, color: "var(--text-strong)" }} /></label>
            </div>
            <div className={s.twoBtns}><button className={s.softBtn} onClick={() => setAddBranch(null)}>Бас тарту</button><button className={s.softBtn} style={{ background: "#229af0", color: "#fff" }} onClick={() => { if (addBranch.address.trim().length < 3) return nativeAlert("Мекенжайды жазыңыз."); up({ branches: [...(d.branches ?? []), { ...addBranch, address: addBranch.address.trim() }] }); setAddBranch(null); }}>Қосу</button></div>
          </div>
        ) : <button className={s.card} style={{ height: 56, border: "1.5px dashed #229af0", background: "none", color: "var(--link)", fontSize: 17, fontWeight: 600 }} onClick={() => setAddBranch({ address: "", open: "09:00", close: "22:00" })}>+ Филиал қосу</button>}
        <Note>Пакет мекеменің барлық филиалында жұмыс істейді, тапсырыс беру кезінде филиал таңдалады.</Note>
      </>}
      {n === 5 && <>
        <h1 className={s.h1} style={{ fontSize: 22 }}>Суреттер</h1>
        <p className={s.muted} style={{ marginTop: -6 }}>Клиенттер осы суреттерді карточкаларда көреді</p>
        {img("Логотип", d.logoUrl, "logo", "Шаршы, кемінде 512×512")}
        {img("Мұқаба", d.coverUrl, "cover", "4:3, JPG немесе PNG, 5 МБ дейін")}
        <h2 className={s.blueHead}>Галерея · {(d.gallery ?? []).length} / 3+</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {(d.gallery ?? []).map((g, i) => <button key={g} onClick={() => up({ gallery: d.gallery!.filter((_, k) => k !== i) })} style={{ aspectRatio: "1", borderRadius: 14, overflow: "hidden" }}><img src={g} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></button>)}
          {(d.gallery?.length ?? 0) < 9 && <button onClick={() => void photo("gallery")} style={{ aspectRatio: "1", borderRadius: 14, border: `1.5px dashed ${(d.gallery?.length ?? 0) < 3 ? "#e53935" : "#229af0"}`, color: "var(--link)", fontSize: 24 }}>{busy === "gallery" ? "…" : "+"}</button>}
        </div>
        {(d.gallery?.length ?? 0) < 3 && <p className="t-cap1" style={{ color: "#e53935", marginTop: -4 }}>Кемінде 3 фото қосу керек</p>}
        <Note tone="warn">Сурет сапасы жоғары болса, пакеттер жиі сатылады. Адам беттері мен мәтін көрінбейтін фото таңда.</Note>
      </>}
      {n === 6 && <>
        <Field label="ИИК (IBAN)" value={d.iban ?? ""} max={24} ok={bank?.valid === true} onChange={(v) => up({ iban: v.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 20) })} hint={bank && !bank.valid ? "IBAN дұрыс емес: бақылау саны сәйкес келмейді" : "20 таңба, KZ-пен басталады"} placeholder="KZ86125KZT5004100100" />
        {bank?.valid && <div className={s.card}>
          <div className={s.kv}><span>Банк</span><b>{bank.bank ?? "Анықталмады"}</b></div>
          <div className={s.kv}><span>БИК</span><b>{bank.bik ?? "—"}</b></div>
          <div className={s.kv}><span>Шот иесі</span><b>{d.legalName ?? "—"}</b></div>
        </div>}
        <Check on={Boolean(d.ownAccount)} onChange={(v) => up({ ownAccount: v })}>Шот мекеме атына ашылған</Check>
        <Note tone="warn">Шот иесі БИН-мен сәйкес келмесе, төлем жасалмайды. Ақша әр төлем сәтінде осы шотқа бірден түседі.</Note>
      </>}
      {n === 7 && <>
        <h1 className={s.h1} style={{ fontSize: 22 }}>Құжаттарды жүкте</h1>
        {docRow("bin", "БИН анықтамасы")}
        {docRow("id", "Басшының жеке куәлігі")}
        {docRow("charter", "Жарғы (ТОО үшін)")}
        {docRow("halal", "Халал сертификаты")}
        <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -4 }}>{d.kind === "food" ? "Тамақ мекемелері үшін міндетті. " : ""}PDF, JPG немесе PNG</p>
        <Note>Құжаттар тек тексеру үшін қолданылады және клиенттерге көрсетілмейді.</Note>
      </>}
      {n === 8 && a && <>
        <div className={s.sectionHead}><h2 className={s.blueHead}>Мекеме</h2><button className={s.link} onClick={() => go("/v/apply/1")}>Өзгерту</button></div>
        <div className={s.card}><div className={s.kv}><span>Атауы</span><b>{d.name}</b></div><div className={s.kv}><span>БИН</span><b>{d.bin}</b></div><div className={s.kv}><span>Санат</span><b>{KINDS.find((k) => k[0] === d.kind)?.[2]}</b></div></div>
        <div className={s.sectionHead}><h2 className={s.blueHead}>Филиалдар · {d.branches?.length ?? 0}</h2><button className={s.link} onClick={() => go("/v/apply/4")}>Өзгерту</button></div>
        <div className={s.card}>{(d.branches ?? []).map((b, i) => <div key={i} className={s.kv}><span>{b.address}</span><b>{b.open}–{b.close}</b></div>)}</div>
        <div className={s.sectionHead}><h2 className={s.blueHead}>Банк және құжаттар</h2><button className={s.link} onClick={() => go("/v/apply/6")}>Өзгерту</button></div>
        <div className={s.card}><div className={s.kv}><span>IBAN</span><b>{d.iban?.slice(0, 4)} •••• {d.iban?.slice(-4)}</b></div><div className={s.kv}><span>Құжаттар</span><b>{a.docs.length} / {d.kind === "food" ? 3 : 2}+ жүктелді</b></div></div>
      </>}
      <Buttons main={{ text: busy === "save" ? "Сақталуда…" : "Жалғастыру", onClick: () => void next(), disabled: Boolean(busy) }} second={{ text: "Артқа", onClick: () => go(-1, "back") }} />
    </VPage>
  );
}

export function VApplyTerms() {
  const go = useGo();
  const [d, setD] = useState<AppData>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { getApp().then((x) => x && setD(x.data)).catch(() => null); }, []);
  const send = useCallback(async () => {
    setBusy(true);
    try {
      await saveApp({ agreeTerms: d.agreeTerms, agreePrivacy: d.agreePrivacy });
      await api("/v1/venue/application/submit", { method: "POST" });
      haptic.success(); go("/v/apply/status", "forward", { replace: true });
    } catch (e) {
      haptic.error();
      const m = (e as { body?: { missing?: string[] } }).body?.missing;
      nativeAlert(m?.length ? `Толтырылмаған қадам: ${m.map((k) => STEPS[order.indexOf(k) + 1] || "Шарттар").join(", ")}` : "Жіберілмеді. Қайталап көріңіз.");
    } finally { setBusy(false); }
  }, [d, go]);
  const items = ["Пакет ақшасы мекемеге бірлік қолданылған сәтте бөлінеді", "Төлем әр қолдану сәтінде бірден бөлініп, шотқа түседі", "Баға өзгерсе, жаңа бағам тек жаңа пакетке қолданылады"];
  return (
    <VPage title="Шарттар" back>
      <h1 className={s.h1} style={{ fontSize: 22 }}>Негізгі шарттар</h1>
      <p className={s.muted} style={{ marginTop: -6 }}>Толық мәтінді оқып шық</p>
      <div className={s.card}>
        {items.map((t) => <div key={t} className={s.row}><span style={{ width: 32, height: 32, borderRadius: 9, background: "#31d158", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flex: "none" }}>✓</span><span className={s.rowText}><span className={s.rowTitle} style={{ whiteSpace: "normal", fontSize: 16 }}>{t}</span></span></div>)}
        <button className={s.row} onClick={() => go("/profile/terms")}><Tile e="v:guide" size={32} /><span className={s.rowText}><span className={s.rowTitle}>Шартты толық оқу</span></span><i className={s.arrow} /></button>
      </div>
      <Check on={Boolean(d.agreeTerms)} onChange={(v) => setD({ ...d, agreeTerms: v })}>Қолдану шарттарымен және тарифпен келісемін</Check>
      <Check on={Boolean(d.agreePrivacy)} onChange={(v) => setD({ ...d, agreePrivacy: v })}>Құпиялылық саясатымен келісемін</Check>
      <Buttons main={{ text: busy ? "Жіберілуде…" : "Өтінімді жіберу", onClick: () => void send(), disabled: !d.agreeTerms || !d.agreePrivacy || busy, shine: true }} second={{ text: "Артқа", onClick: () => go(-1, "back") }} />
    </VPage>
  );
}

const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const when = (d: string) => { const x = new Date(new Date(d).toLocaleString("en-US", { timeZone: "Asia/Almaty" })); return `${x.getDate()} ${MON[x.getMonth()]}, ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };

/** Figma «03 · Өтінім күйі»: қаралуда / қосымша ақпарат қажет / қабылданбады / мекеме тіркелді */
export function VApplyStatus() {
  const go = useGo();
  const [a, setA] = useState<Application | null>(null);
  const load = useCallback(() => getApp().then(setA).catch(() => null), []);
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);
  if (!a) return <VPage><Sk h={200} /></VPage>;
  if (a.status === "approved") return (
    <VPage>
      <div className={s.result} style={{ marginTop: 40 }}>
        <VSticker name="party" size={120} />
        <h1 className={s.resultTitle}>Мекеме тіркелді</h1>
        <p className={s.stateText}>{a.data.name} енді Medeo қолданбасында. Келесі қадамдар:</p>
      </div>
      <div className={s.card}>
        <button className={s.row} onClick={async () => { await loadStaff(); go("/v/offers/new"); }}><Tile e="v:file" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Ұсыныс құру</span><span className={s.rowSub}>Пакет көлемі, бағасы, мерзімі</span></span><i className={s.arrow} /></button>
        <button className={s.row} onClick={async () => { await loadStaff(); go("/v/team/invite"); }}><Tile e="v:key" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Кассир шақыру</span><span className={s.rowSub}>Кассир режимін қосу</span></span><i className={s.arrow} /></button>
        <button className={s.row} onClick={() => nativeAlert("POS (iiko) интеграциясы келесі кезеңде қосылады.")}><Tile e="v:integration" size={36} /><span className={s.rowText}><span className={s.rowTitle}>POS қосу</span><span className={s.rowSub}>Тапсырыс алу үшін (міндетті емес)</span></span><i className={s.arrow} /></button>
      </div>
      <Buttons main={{ text: "Мекемеге өту", onClick: async () => { await loadStaff(); go("/v", "fade", { replace: true }); }, shine: true }} second={{ text: "Кейін", onClick: () => go("/profile", "fade") }} />
    </VPage>
  );
  if (a.status === "need_info" || a.status === "rejected") return (
    <VPage>
      <div className={s.state} style={{ top: "calc(300px + var(--top-shift))" }}>
        <VSticker name={a.status === "rejected" ? "sad" : "think"} size={120} />
        <h2 className={s.stateTitle}>{a.status === "rejected" ? "Өтінім қабылданбады" : "Қосымша ақпарат қажет"}</h2>
        <p className={s.stateText}>{a.note ?? (a.status === "rejected" ? "Себебін қолдау қызметінен біле аласыз." : "Medeo командасы кейбір деректерді нақтылауды сұрады.")}</p>
      </div>
      <Buttons main={a.status === "need_info" ? { text: "Өтінімді түзету", onClick: () => go(`/v/apply/${Math.max(1, firstMissing(a))}`) } : { text: "Қолдауға жазу", onClick: () => openChat(SUPPORT_BOT) }} second={{ text: "Жабу", onClick: () => go("/profile", "fade") }} />
    </VPage>
  );
  const steps: [string, string, boolean, boolean][] = [
    ["Өтінім жіберілді", a.submittedAt ? when(a.submittedAt) : "", true, false],
    ["Құжаттар тексерілуде", "Орындалуда", false, true],
    ["Шартқа қол қою", "Тексеруден кейін", false, false],
    ["Мекеме белсендіріледі", "Қолданбада көрінеді", false, false],
  ];
  const test = window.location.hostname === "localhost" || /test/i.test(import.meta.env.VITE_PAYMENTS_MODE ?? "test");
  return (
    <VPage>
      <div className={s.result} style={{ marginTop: 24 }}>
        <VSticker name="wait" size={120} />
        <h1 className={s.resultTitle} style={{ fontSize: 22 }}>Өтінім қаралуда</h1>
        <p className={s.stateText}>Қарау 1 жұмыс күні ішінде аяқталады. Нәтижені Telegram арқылы жібереміз.</p>
      </div>
      <div className={`${s.card} ${s.steps}`}>
        {steps.map(([t, sub, ok, now], i) => (
          <div key={t} className={`${s.step} ${ok ? "" : s.todo}`}>
            {ok ? <span className={s.dotOk} /> : now ? <span style={{ flex: "none", width: 22, height: 22, borderRadius: 11, boxShadow: "inset 0 0 0 6px #229af0" }} /> : <span className={s.dotTodo} />}
            <span className={s.rowText}><span className={s.rowTitle} style={!ok && !now ? { color: "var(--text-secondary)" } : undefined}>{t}</span><span className={s.rowSub}>{sub}</span></span>
            {i === 0 && null}
          </div>
        ))}
      </div>
      {test && <button className={s.textBtn} style={{ alignSelf: "center" }} onClick={async () => { try { await api("/v1/venue/application/dev-approve", { method: "POST" }); haptic.success(); await load(); } catch { nativeAlert("Тек сынақ режимінде."); } }}>Сынақ режимі: өтінімді мақұлдау</button>}
      <Buttons main={{ text: "Түсінікті", onClick: () => go("/profile", "fade") }} second={{ text: "Өтінімді көру", onClick: () => go("/v/apply/8") }} />
    </VPage>
  );
}

// ── Файл жүктеу көмекшілері ──
async function uploadApplyImage(f: File, kind: "logo" | "cover" | "gallery") {
  // Тіркеу кезінде мекеме әлі жоқ: сурет өтінім жолымен (/v1/venue/application/media) жүктеледі
  return uploadImage("application", f, kind === "gallery" ? "offer" : kind);
}
function pickFile(): Promise<File | null> {
  return new Promise((res) => { const i = document.createElement("input"); i.type = "file"; i.accept = "application/pdf,image/jpeg,image/png"; i.onchange = () => res(i.files?.[0] ?? null); i.click(); });
}
async function uploadDoc(kind: string, f: File): Promise<Doc> {
  const wa = window.Telegram?.WebApp;
  let init = wa?.initData ?? "";
  if (!init && import.meta.env.DEV) { try { init = localStorage.getItem("medeo_dev_init") ?? ""; } catch { /* жоқ */ } }
  const res = await fetch(`${API_URL}/v1/venue/application/docs?kind=${kind}`, { method: "POST", body: f, headers: { Authorization: "tma " + init, "Content-Type": f.type || "application/pdf", "X-File-Name": encodeURIComponent(f.name) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j?.error ?? "http"), { body: j });
  return j.doc as Doc;
}
