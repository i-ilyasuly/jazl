// Figma «06 · Ұсыныстар»: Ұсыныс құру 1–4 қадам (14007:8123, 8230, 8290, 8379), Сипаттама (14018:8116), Ұсыныс тексеруде (14071:15167),
// Ұсыныс беті (14008:7998), Бағаны өзгерту (14008:8135), Ұсынысты тоқтату (14008:8304), Баға қатты түсірілді (14018:8391).
// Фото — Google Cloud Storage (venue/media.ts). Біздің жолмен келіспейтін жерлері: «Алдын ала тапсырыс» ескертуі POS емес,
// біздің тапсырыс бөлімі туралы; сипаттамадағы «дәйексөз» — дәйексөз белгісіз ақпарат блогы (04/38).
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, nativeAlert, nativePick } from "../telegram";
import { Switch } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { api } from "../api";
import { err, money, useCurrent, V } from "./api";
import { Buttons, Note, OfferPic, Sheet, Sk, VPage, VSticker } from "./ui";
import { pickImage, uploadImage } from "./media";
import s from "./V.module.css";

type Size = { units: number; price: number };
interface Draft { title: string; category: string; about: string; photos: string[]; sizes: Size[]; regularUnitPrice: number; validDays: number; rules: { carry: boolean; extend: boolean; preorder: boolean; branches: string[] | null } }
interface OfferFull extends Draft { id: string; slug: string; kind: "food" | "coffee" | "hair"; status: string; sizes: (Size & { sold: number })[]; stats: { sold: number; active: number; used: number; revenue: number; series: { date: string; n: number }[]; growth: number | null } }

const cats = { food: ["Донер", "Бургер", "Шаурма", "Кофе", "Басқа"], coffee: ["Кофе", "Шай", "Десерт", "Басқа"], hair: ["Шаш қию", "Сақал", "Балалар", "Басқа"] };
const DAYS = [7, 14, 30, 60, 90];
const saving = (x: Size, reg: number) => Math.max(0, Math.round((1 - x.price / (x.units * reg)) * 100));

/** Сипаттама белгілері: *жасыл* — артықшылық, _көк_ — маңызды, «> » жолы — ақпарат блогы, «• » — тізім */
export function Rich({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*[^*]+\*|_[^_]+_)/g).map((p, i) =>
    p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={i} className="hl hl-green" style={{ background: "var(--hl-green-bg)", color: "var(--hl-green-text)", fontWeight: 400 }}>{p.slice(1, -1)}</b>
      : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <b key={i} className="hl" style={{ background: "var(--hl-blue-bg)", color: "var(--hl-blue-text)", fontWeight: 400 }}>{p.slice(1, -1)}</b> : <Fragment key={i}>{p}</Fragment>);
  return <>{text.split("\n").filter((l) => l.trim()).map((l, i) => l.startsWith("> ")
    ? <p key={i} className="t-sub2 infoBox" style={{ margin: "8px 0 0" }}>{inline(l.slice(2))}</p>
    : <p key={i} style={{ margin: i ? "6px 0 0" : 0, fontSize: 17, lineHeight: "24px" }}>{inline(l)}</p>)}</>;
}

function Steps({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: -4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>{[1, 2, 3, 4].map((i) => <i key={i} style={{ height: 4, borderRadius: 2, background: i <= n ? "#229af0" : "var(--separator)" }} />)}</div>
      <span className={`t-cap1 ${s.muted}`}>Қадам {n} / 4 · {label}</span>
    </div>
  );
}

/** Ұсыныс құру/өңдеу шебері (/v/offers/new, /v/offers/:id/edit) */
export function VOfferWizard() {
  const go = useGo();
  const me = useCurrent();
  const { id } = useParams();
  const [step, setStep] = useState(1);
  const [editAbout, setEditAbout] = useState(false);
  const [sizeEdit, setSizeEdit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("draft");
  const [photoState, setPhotoState] = useState<"" | "loading" | "error">("");
  const [d, setD] = useState<Draft>({ title: "", category: "", about: "", photos: [], sizes: [{ units: 4, price: 6000 }], regularUnitPrice: 2000, validDays: 30, rules: { carry: true, extend: true, preorder: true, branches: null } });
  useEffect(() => { if (id && me) api<{ offer: OfferFull }>(`/v1/venue/${me.venue.id}/offers/${id}`).then(({ offer: o }) => { setStatus(o.status); setD({ title: o.title, category: o.category ?? "", about: o.about, photos: o.photos ?? [], sizes: o.sizes.map(({ units, price }) => ({ units, price })), regularUnitPrice: o.regularUnitPrice, validDays: o.validDays, rules: o.rules }); }).catch(() => null); }, [id, me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  async function addPhoto() {
    if (!me || photoState === "loading") return;
    const f = await pickImage(); if (!f) return;
    setPhotoState("loading");
    try { const url = await uploadImage(me.venue.id, f, "offer"); up({ photos: [url] }); setPhotoState(""); haptic.success(); }
    catch (e) { setPhotoState("error"); haptic.error(); if (err(e) === "storage_disabled") nativeAlert("Сурет сақтау орны әлі қосылмаған (Cloud Storage)."); else if (err(e) === "too_large") nativeAlert("Сурет 5 МБ-тан үлкен."); }
  }
  const low = d.sizes.find((x) => saving(x, d.regularUnitPrice) < 10);
  const locked = Boolean(id) && status !== "draft"; // жарияланған ұсыныстың бағасы — тек «Бағаны өзгерту» арқылы

  const save = useCallback(async (publish: boolean) => {
    if (!me || busy) return;
    setBusy(true); haptic.medium();
    const body = { ...d, category: d.category || undefined, publish };
    try {
      const st = id ? (await api<{ status: string }>(`/v1/venue/${me.venue.id}/offers/${id}`, { method: "PUT", body: JSON.stringify(body) })).status
        : (await api<{ offer: { status: string } }>(`/v1/venue/${me.venue.id}/offers`, { method: "POST", body: JSON.stringify(body) })).offer.status;
      haptic.success();
      // «Ұсыныс тексеруде» — тек Jazl+ тексеруіне кеткенде (нақты режим); сынақ режимінде бірден жарияланады
      go(st === "review" ? "/v/offers/review" : "/v/offers", "forward", { replace: true });
    } catch (e) { haptic.error(); nativeAlert(err(e) === "low_discount" ? "Жеңілдік кемінде 10% болуы керек: көлем бағасын азайтыңыз." : "Сақталмады. Қайталап көріңіз."); }
    finally { setBusy(false); }
  }, [me, busy, d, id, status, go]);

  const next = useCallback(() => {
    if (step === 1 && d.title.trim().length < 2) { haptic.error(); return nativeAlert("Ұсыныс атауын жазыңыз."); }
    if (step === 2 && low && !locked) { haptic.error(); return nativeAlert(`Жеңілдік 10%-дан аз: ${low.units} бірлік. Бағаны азайтыңыз не қалыпты бағаны тексеріңіз.`); }
    haptic.tap(); setStep((x) => Math.min(4, x + 1));
  }, [step, d, low, locked]);
  const back = useCallback(() => { if (step === 1) go(-1, "back"); else setStep((x) => x - 1); }, [step, go]);

  if (!me) return <VPage back><Sk h={200} /></VPage>;
  if (editAbout) return <AboutEditor value={d.about} onDone={(v) => { up({ about: v }); setEditAbout(false); }} />;
  const label = ["Негізгі", "Көлем және баға", "Мерзім және ережелер", "Алдын ала қарау"][step - 1];
  const branches = me.branches;
  return (
    <VPage title={id ? "Ұсынысты өңдеу" : "Ұсыныс құру"} back>
      <Steps n={step} label={label} />
      {step === 1 && <>
        <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
          <span className="t-cap1" style={{ color: "var(--link)" }}>Атауы</span>
          <input value={d.title} maxLength={60} onChange={(e) => up({ title: e.target.value })} placeholder="Мысалы: Тауық донері"
            style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        </label>
        <h2 className={s.blueHead}>Санат</h2>
        <div className={s.chips} style={{ flexWrap: "wrap" }}>
          {cats[me.venue.kind].map((c) => <button key={c} className={`${s.chip} ${d.category === c ? s.chipOn : ""}`} onClick={() => { haptic.select(); up({ category: c }); }}>{c}</button>)}
        </div>
        <div className={s.card} style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span className={`t-cap1 ${s.muted}`}>Сипаттама</span><button className={s.link} onClick={() => setEditAbout(true)}>Өңдеу</button></div>
          {d.about ? <Rich text={d.about} /> : <button className={s.muted} style={{ textAlign: "left" }} onClick={() => setEditAbout(true)}>Пакетке не кіреді, қалай беріледі — қысқаша жазыңыз</button>}
        </div>
        {d.photos[0] ? (
          <div className={s.card} style={{ padding: 8 }}>
            <img src={d.photos[0]} alt="" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 14 }} />
            <div style={{ display: "flex", gap: 16, padding: "10px 8px 4px" }}>
              <button className={s.textBtn} onClick={() => void addPhoto()}>{photoState === "loading" ? "Жүктелуде…" : "Ауыстыру"}</button>
              <button className={`${s.textBtn} ${s.redText}`} onClick={() => up({ photos: [] })}>Өшіру</button>
            </div>
          </div>
        ) : (
          <button className={s.card} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, border: `1.5px dashed ${photoState === "error" ? "#e53935" : "#b0c4d8"}`, background: "none" }} onClick={() => void addPhoto()}>
            <VSticker name="painter" size={56} />
            <span className={s.rowText}><span className={s.rowTitle}>{photoState === "loading" ? "Жүктелуде…" : "Негізгі фото"}</span>
              <span className={s.rowSub} style={photoState === "error" ? { color: "#e53935" } : undefined}>{photoState === "error" ? "Жүктелмеді. Қайта басып көріңіз" : "4:3, JPG/PNG, 5 МБ дейін"}</span></span>
          </button>
        )}
        <Note>Жақсы фото сатылымды арттырады: табиғи жарық, тақта үстінде, мәтінсіз.</Note>
      </>}

      {step === 2 && <>
        {d.sizes.map((x, i) => (
          <button key={i} className={s.card} style={{ textAlign: "left", padding: "14px 16px", background: i === 0 ? "var(--hl-blue-bg)" : undefined }} onClick={() => { if (!locked) setSizeEdit(i); }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b className={s.lead} style={{ fontSize: 19 }}>{x.units} бірлік</b><span className={`${s.tag} ${s.tagGreen}`}>Үнем {saving(x, d.regularUnitPrice)}%</span>
              <b className={s.lead} style={{ marginLeft: "auto", fontSize: 19 }}>{money(x.price)}</b>
            </span>
            <span className={s.rowSub} style={{ display: "block", marginTop: 8 }}>Бірлікке {money(Math.round(x.price / x.units))}   <span style={{ color: "var(--link)" }}>Сізге төленеді: {money(Math.round((x.price / x.units) * 0.9))} / бірлік</span></span>
          </button>
        ))}
        {!locked && d.sizes.length < 5 && <button className={s.card} style={{ height: 56, border: "1.5px dashed #229af0", background: "none", color: "var(--link)", fontSize: 17, fontWeight: 600 }}
          onClick={() => { const l = d.sizes[d.sizes.length - 1]; up({ sizes: [...d.sizes, { units: l.units * 2, price: Math.round(l.price * 1.85 / 100) * 100 }] }); setSizeEdit(d.sizes.length); }}>+ Көлем қосу</button>}
        <label className={s.card} style={{ padding: "10px 16px", display: "block" }}>
          <span className={`t-cap1 ${s.muted}`}>Бірліктің қалыпты бағасы</span>
          <input inputMode="numeric" disabled={locked} value={d.regularUnitPrice.toLocaleString("ru-RU") + " ₸"} onChange={(e) => up({ regularUnitPrice: Number(e.target.value.replace(/\D/g, "")) || 0 })}
            style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, paddingTop: 4, color: "var(--text-strong)" }} />
        </label>
        <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>Клиент «үнем» осы бағамен салыстырады</p>
        {low && !locked ? <Note tone="warn">Жеңілдік 10%-дан аз ({low.units} бірлік). Jazl+ ұсыныстарында жеңілдік кемінде 10% болуы керек.</Note>
          : <Note tone="warn">{locked ? "Жарияланған ұсыныстың бағасы «Бағаны өзгерту» арқылы ғана өзгереді (тек иесі)." : "Бірлік бағасы кассирдің пакет тізімінде көрінеді, ол QR-ды бірлікпен шығарады."}</Note>}
      </>}

      {step === 3 && <>
        <div className={s.card}>
          <div className={s.row}>
            <Tile e="v:clock" size={36} />
            <span className={s.rowText}><span className={s.rowTitle}>Пакет мерзімі</span><span className={s.rowSub}>Сатып алған сәттен</span></span>
            <div className={s.stepper}>
              <button className={s.stepBtn} disabled={d.validDays <= DAYS[0]} onClick={() => { haptic.select(); up({ validDays: [...DAYS].reverse().find((x) => x < d.validDays) ?? DAYS[0] }); }}>−</button>
              <span className={s.stepVal} style={{ width: 64, fontSize: 16 }}>{d.validDays} күн</span>
              <button className={s.stepBtn} disabled={d.validDays >= DAYS[DAYS.length - 1]} onClick={() => { haptic.select(); up({ validDays: DAYS.find((x) => x > d.validDays) ?? d.validDays }); }}>+</button>
            </div>
          </div>
          {([["carry", "v:carry", "Қалғанын көшіру", "Қайта алғанда қалған бірлік қосылады"], ["extend", "v:extend", "Мерзімді ұзарту", "1 рет тегін +7 күн"], ["preorder", "v:preorder", "Алдын ала тапсырыс", "Клиент тапсырыс беріп, өзі алып кетеді"]] as const).map(([k, e, t, sub]) => (
            <div key={k} className={s.row}>
              <Tile e={e} size={36} />
              <span className={s.rowText}><span className={s.rowTitle}>{t}</span><span className={s.rowSub}>{sub}</span></span>
              <Switch on={d.rules[k]} onChange={(v) => up({ rules: { ...d.rules, [k]: v } })} />
            </div>
          ))}
        </div>
        <h2 className={s.blueHead}>Қай филиалдарда</h2>
        <div className={s.chips} style={{ flexWrap: "wrap" }}>
          <button className={`${s.chip} ${d.rules.branches === null ? s.chipOn : ""}`} onClick={() => { haptic.select(); up({ rules: { ...d.rules, branches: null } }); }}>Барлығы</button>
          {branches.map((b) => {
            const on = d.rules.branches?.includes(b.id) ?? false;
            return <button key={b.id} className={`${s.chip} ${on ? s.chipOn : ""}`} onClick={() => { haptic.select(); const cur = d.rules.branches ?? []; const n = on ? cur.filter((x) => x !== b.id) : [...cur, b.id]; up({ rules: { ...d.rules, branches: n.length ? n : null } }); }}>{b.address}</button>;
          })}
        </div>
        <Note>Алдын ала тапсырыс қосулы болса, клиент «Тапсырыс» және «Жоспарлау» арқылы алдын ала тапсырыс бере алады.</Note>
      </>}

      {step === 4 && <>
        <h2 className={s.blueHead}>Клиент осылай көреді</h2>
        <div className={s.card} style={{ padding: 16 }}>
          <b className={s.lead} style={{ fontSize: 19 }}>{d.title || "Атауы"} · {d.sizes[0].units} дана</b>
          <p className={`t-cap1 ${s.muted}`} style={{ marginTop: 2 }}>{me.venue.name}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <span style={{ width: 170, height: 110, borderRadius: 14, background: "var(--thumb-bg)", display: "grid", placeItems: "center", overflow: "hidden" }}>{d.photos[0] ? <img src={d.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <OfferPic kind={me.venue.kind} size={40} />}</span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, justifyContent: "center" }}>
              <b style={{ fontSize: 24, fontWeight: 700 }}>{money(d.sizes[0].price)}</b>
              <span className={`${s.tag} ${s.tagYellow}`}>{money(Math.round(d.sizes[0].price / d.sizes[0].units))} / дана</span>
              <span className={`${s.tag} ${s.tagGreen}`}>{money(d.sizes[0].units * d.regularUnitPrice - d.sizes[0].price)} үнем</span>
            </span>
          </div>
        </div>
        <h2 className={s.blueHead}>Тексеру тізімі</h2>
        <div className={s.card}>
          <Check ok={d.title.length > 1 && Boolean(d.about) && Boolean(d.photos[0])} t="Атауы, сипаттама, фото" sub={!d.about ? "Сипаттама жазылмаған" : !d.photos[0] ? "Фото қосылмаған" : undefined} />
          <Check ok={!low} t="Көлем мен бағалар" sub={low ? "Жеңілдік 10%-дан аз" : undefined} />
          <Check ok t="Мерзім және ережелер" />
          {d.rules.preorder && <Check warn t="Алдын ала тапсырыс" sub="Тапсырыстар «Мәзір → Алдын ала тапсырыстар» бөлімінде" tag="Ескерту" />}
        </div>
      </>}

      <Buttons main={step < 4 ? { text: "Жалғастыру", onClick: next } : { text: busy ? "Сақталуда…" : status === "draft" ? "Жариялау" : "Сақтау", onClick: () => void save(true), disabled: busy || (Boolean(low) && !locked), shine: true }}
        second={step < 4 ? { text: step === 1 ? "Бас тарту" : "Артқа", onClick: back } : status === "draft" ? { text: "Жоба ретінде", onClick: () => void save(false) } : { text: "Артқа", onClick: back }} />
      {sizeEdit !== null && d.sizes[sizeEdit] && <SizeSheet size={d.sizes[sizeEdit]} reg={d.regularUnitPrice} canDelete={d.sizes.length > 1}
        onClose={() => setSizeEdit(null)} onSave={(x) => { up({ sizes: d.sizes.map((y, i) => (i === sizeEdit ? x : y)).sort((a, b) => a.units - b.units) }); setSizeEdit(null); }}
        onDelete={() => { up({ sizes: d.sizes.filter((_, i) => i !== sizeEdit) }); setSizeEdit(null); }} />}
    </VPage>
  );
}

function Check({ ok, warn, t, sub, tag }: { ok?: boolean; warn?: boolean; t: string; sub?: string; tag?: string }) {
  return (
    <div className={s.row}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: warn ? "#ff9500" : ok ? "#31d158" : "#e53935", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>{warn ? "!" : ok ? "✓" : "×"}</span>
      <span className={s.rowText}><span className={s.rowTitle}>{t}</span>{sub && <span className={s.rowSub}>{sub}</span>}</span>
      {tag && <span className={`${s.tag} ${s.tagYellow}`}>{tag}</span>}
    </div>
  );
}

function NumField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <label className={s.card} style={{ padding: "10px 16px", display: "block" }}>
      <span className="t-cap1" style={{ color: "var(--link)" }}>{label}</span>
      <input inputMode="numeric" value={value ? value.toLocaleString("ru-RU") + suffix : ""} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 19, padding: "4px 0 8px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
    </label>
  );
}

function SizeSheet({ size, reg, canDelete, onClose, onSave, onDelete }: { size: Size; reg: number; canDelete: boolean; onClose: () => void; onSave: (x: Size) => void; onDelete: () => void }) {
  const [x, setX] = useState(size);
  return (
    <Sheet title="Көлем" onClose={onClose}>
      <NumField label="Бірлік саны" value={x.units} suffix=" бірлік" onChange={(units) => setX({ ...x, units })} />
      <NumField label="Пакет бағасы" value={x.price} suffix=" ₸" onChange={(price) => setX({ ...x, price })} />
      {x.units > 0 && x.price > 0 && <div style={{ display: "flex", gap: 8 }}><span className={`${s.tag} ${s.tagGreen}`}>Үнем {saving(x, reg)}%</span><span className={s.tag}>Бірлікке {money(Math.round(x.price / x.units))}</span></div>}
      {canDelete && <button className={`${s.textBtn} ${s.redText}`} style={{ alignSelf: "flex-start" }} onClick={onDelete}>Көлемді өшіру</button>}
      <Buttons main={{ text: "Сақтау", onClick: () => onSave(x), disabled: !x.units || !x.price }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Figma «Сипаттама» (14018:8116): құралдар жолағы — жасыл (артықшылық), көк (маңызды), ақпарат блогы, тізім; 500 таңба */
function AboutEditor({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  const wrap = (a: string, b = a) => {
    if (!el) return; const { selectionStart: x, selectionEnd: y } = el;
    if (x === y) return nativeAlert("Алдымен сөзді белгілеңіз.");
    setV(v.slice(0, x) + a + v.slice(x, y) + b + v.slice(y)); haptic.select();
  };
  const line = (p: string) => { if (!el) return; const x = el.selectionStart; const st = v.lastIndexOf("\n", x - 1) + 1; setV(v.slice(0, st) + (v.startsWith(p, st) ? v.slice(st + p.length) : p + v.slice(st))); haptic.select(); };
  const tool = (key: string, label: ReactNode, on: () => void) => <button key={key} onClick={on} style={{ width: 44, height: 40, borderRadius: 10, background: "var(--surface-white)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 17 }}>{label}</button>;
  return (
    <VPage title="Сипаттама" back>
      <div style={{ display: "flex", gap: 8 }}>
        {tool("g", <i style={{ width: 18, height: 18, borderRadius: 9, background: "#31d158" }} />, () => wrap("*"))}
        {tool("b", <i style={{ width: 18, height: 18, borderRadius: 9, background: "#229af0" }} />, () => wrap("_"))}
        {tool("q", <span style={{ fontSize: 14 }}>ℹ︎</span>, () => line("> "))}
        {tool("l", "☰", () => line("• "))}
      </div>
      <div className={s.card} style={{ padding: "12px 16px" }}>
        <textarea ref={setEl} value={v} maxLength={500} rows={5} onChange={(e) => setV(e.target.value)} placeholder="Лаваш, тауық еті және фирмалық соус…"
          style={{ width: "100%", border: 0, outline: 0, resize: "none", background: "none", font: "inherit", fontSize: 17, lineHeight: "24px", color: "var(--text-strong)" }} />
        <p className={`t-cap1 ${s.muted}`} style={{ textAlign: "right" }}>{v.length} / 500</p>
      </div>
      {v && <div className={s.card} style={{ padding: "12px 16px" }}><span className={`t-cap1 ${s.muted}`}>Алдын ала көрініс</span><div style={{ marginTop: 6 }}><Rich text={v} /></div></div>}
      <Note>Тек екі түс қолданылады: жасыл (артықшылық) және көк (маңызды). Түсті ең негізгі сөздерге ғана қой.</Note>
      <Buttons main={{ text: "Дайын", onClick: () => onDone(v.trim()) }} second={{ text: "Артқа", onClick: () => onDone(value) }} />
    </VPage>
  );
}

export function VOfferReview() {
  const go = useGo();
  return (
    <VPage>
      <div className={s.state} style={{ top: "calc(351px + var(--top-shift))" }}>
        <VSticker name="think" size={120} />
        <h2 className={s.stateTitle}>Ұсыныс тексеруде</h2>
        <p className={s.stateText}>Jazl+ командасы 24 сағат ішінде қарайды. Бекітілген соң ұсыныс клиенттерге көрінеді, нәтижесін Telegram арқылы хабарлаймыз.</p>
      </div>
      <Buttons main={{ text: "Ұсыныстарға өту", onClick: () => go("/v/offers", "fade", { replace: true }) }} />
    </VPage>
  );
}

const statusTag: Record<string, [string, string]> = { active: ["Белсенді", "tagGreen"], paused: ["Тоқтатылған", "tagYellow"], draft: ["Жоба", "tagGray"], review: ["Тексеруде", "tag"], ended: ["Мұрағат", "tagGray"] };
const DOW = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"];

/** Figma «Ұсыныс беті» (14008:7998) */
export function VOfferPage() {
  const go = useGo();
  const me = useCurrent();
  const { id = "" } = useParams();
  const [o, setO] = useState<OfferFull | null>(null);
  const [price, setPrice] = useState(false);
  const load = useCallback(() => { if (me) api<{ offer: OfferFull }>(`/v1/venue/${me.venue.id}/offers/${id}`).then((r) => setO(r.offer)).catch(() => null); }, [me?.venue.id, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const max = useMemo(() => Math.max(1, ...(o?.stats.series.map((x) => x.n) ?? [1])), [o]);
  async function toggle() {
    if (!me || !o) return;
    const stop = o.status === "active";
    const r = await nativePick(stop ? "Ұсынысты тоқтату?" : "Ұсынысты қосу?", stop ? "Жаңа клиенттер сатып ала алмайды. Сатылған пакеттер мерзімі біткенше жарамды." : "Ұсыныс клиенттерге қайта көрінеді.", [{ id: "no", text: "Жоқ" }, { id: "yes", text: stop ? "Тоқтату" : "Қосу" }], "yes");
    if (r !== "yes") return;
    try { await V.offerStatus(me.venue.id, o.id, stop ? "paused" : "active"); haptic.success(); load(); } catch { haptic.error(); }
  }
  async function remove() {
    if (!me || !o) return;
    const r = await nativePick("Жобаны өшіру?", "Бұл жоба толық өшіріледі.", [{ id: "no", text: "Жоқ" }, { id: "yes", text: "Өшіру" }], "yes");
    if (r === "yes") { await api(`/v1/venue/${me.venue.id}/offers/${o.id}/remove`, { method: "POST" }).catch(() => null); go("/v/offers", "back", { replace: true }); }
  }
  if (!o || !me) return <VPage title="Ұсыныс" back tab="offers"><Sk h={80} /><Sk h={160} /></VPage>;
  const [tt, tc] = statusTag[o.status] ?? ["", "tag"];
  const owner = me.role === "owner";
  return (
    <VPage title={o.title} back tab="offers">
      <div className={s.head}>
        <span className={s.ocPic} style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}>{o.photos?.[0] ? <img src={o.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <OfferPic kind={o.kind} size={38} />}</span>
        <span className={s.headText}>
          <span className={s.headName} style={{ fontSize: 22 }}>{o.title}</span>
          <span style={{ display: "flex", gap: 6, marginTop: 6 }}><span className={`${s.tag} ${s[tc]}`}>{tt}</span><span className={`${s.tag} ${s.tagGray}`}>{o.sizes.length} көлем</span></span>
        </span>
      </div>
      <div className={s.stats}>
        <div className={s.stat}><span className={s.statLabel}>Сатылды</span><span className={s.statNum} style={{ fontSize: 22 }}>{o.stats.sold} пакет</span></div>
        <div className={s.stat}><span className={s.statLabel}>Белсенді пакет</span><span className={s.statNum} style={{ fontSize: 22 }}>{o.stats.active}</span></div>
        <div className={s.stat}><span className={s.statLabel}>Қолданылған бірлік</span><span className={s.statNum} style={{ fontSize: 22 }}>{o.stats.used}</span></div>
        <div className={s.stat}><span className={s.statLabel}>Табыс</span><span className={s.statNum} style={{ fontSize: 22, color: "#1f8a3b" }}>{money(o.stats.revenue)}</span></div>
      </div>
      <div className={s.chart}>
        <div className={s.chartHead}><b className={s.lead}>Сатылым · 7 күн</b>{o.stats.growth !== null && <span className={`${s.up} ${o.stats.growth < 0 ? s.down : ""}`}>{o.stats.growth >= 0 ? "▲" : "▼"} {Math.abs(o.stats.growth)}%</span>}</div>
        <div className={s.bars}>
          {o.stats.series.map((x, i) => <div key={x.date} className={s.barCol}><i style={{ height: `${Math.max(14, (x.n / max) * 100)}%`, background: i === 6 ? "#229af0" : "#d6eafb" }} /><span>{DOW[new Date(x.date).getDay()]}</span></div>)}
        </div>
      </div>
      <div className={s.card}>
        {o.sizes.map((x) => (
          <button key={x.units} className={s.row} style={{ ["--inset" as string]: "16px" }} onClick={() => owner && setPrice(true)}>
            <span className={s.rowText}><span className={s.rowTitle} style={{ fontWeight: 600 }}>{x.units} бірлік · {money(x.price)}</span><span className={s.rowSub}>{x.sold} сатылды</span></span>
            <i className={s.arrow} />
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <ActionTile e="✎" t="Өңдеу" onClick={() => go(`/v/offers/${o.id}/edit`)} />
        <ActionTile e="₸" t="Баға" onClick={() => (owner ? setPrice(true) : nativeAlert("Бағаны тек мекеме иесі өзгертеді."))} />
        {o.status === "draft" ? <ActionTile e="×" t="Өшіру" red onClick={() => void remove()} />
          : <ActionTile e={o.status === "active" ? "❚❚" : "▶"} t={o.status === "active" ? "Тоқтату" : "Қосу"} red={o.status === "active"} onClick={() => void toggle()} />}
      </div>
      {price && <PriceSheet o={o} onClose={() => setPrice(false)} onDone={() => { setPrice(false); load(); }} />}
    </VPage>
  );
}

function ActionTile({ e, t, red, onClick }: { e: string; t: string; red?: boolean; onClick: () => void }) {
  return <button onClick={() => { haptic.tap(); onClick(); }} style={{ height: 72, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 15, fontWeight: 600, background: red ? "rgba(229,57,53,0.12)" : "var(--hl-blue-bg)", color: red ? "#e53935" : "var(--hl-blue-text)" }}><span style={{ fontSize: 18 }}>{e}</span>{t}</button>;
}

/** Figma «Бағаны өзгерту» (14008:8135) және «Баға қатты түсірілді» (14018:8391) */
function PriceSheet({ o, onClose, onDone }: { o: OfferFull; onClose: () => void; onDone: () => void }) {
  const me = useCurrent();
  const [u, setU] = useState(o.sizes[0].units);
  const cur = o.sizes.find((x) => x.units === u)!;
  const [p, setP] = useState(cur.price);
  useEffect(() => setP(cur.price), [u]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (confirmDrop = false) => {
    if (!me) return;
    try { await api(`/v1/venue/${me.venue.id}/offers/${o.id}/price`, { method: "POST", body: JSON.stringify({ units: u, price: p, ...(confirmDrop ? { confirmDrop } : {}) }) }); haptic.success(); onDone(); }
    catch (e) {
      const k = err(e);
      if (k === "big_drop") {
        const r = await nativePick("Баға қатты түсірілді", `Жаңа баға ${money(p)} — қазіргіден (${money(cur.price)}) 50%-дан көп төмен. Осы бағамен сатылған барлық пакет бойынша шығынға мекеме жауап береді.`, [{ id: "no", text: "Түзету" }, { id: "yes", text: "Шығынға өзім жауап беремін" }], "no");
        if (r === "yes") void save(true);
      } else { haptic.error(); nativeAlert(k === "low_discount" ? "Жеңілдік 10%-дан аз болмауы керек." : "Сақталмады."); }
    }
  };
  const diff = p - cur.price;
  return (
    <Sheet title="Бағаны өзгерту" onClose={onClose}>
      <div className={s.chips}>{o.sizes.map((x) => <button key={x.units} className={`${s.chip} ${u === x.units ? s.chipOn : ""}`} onClick={() => { haptic.select(); setU(x.units); }}>{x.units} бірлік</button>)}</div>
      <NumField label={`Жаңа баға (${u} бірлік)`} value={p} suffix=" ₸" onChange={setP} />
      <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>Қазіргі баға {money(cur.price)}</p>
      {p > 0 && <div style={{ display: "flex", gap: 8 }}>{diff !== 0 && <span className={`${s.tag} ${diff > 0 ? s.tagYellow : s.tagGreen}`}>{diff > 0 ? "+" : "−"}{money(Math.abs(diff))}</span>}<span className={s.tag}>Бірлікке {money(Math.round(p / u))}</span></div>}
      <Note tone="warn">Жаңа баға тек жаңа пакеттерге қолданылады. Бар пакеттер ескі бағамен жүре береді, ал қайта алғанда клиентке баға өзгергені көрсетіледі.</Note>
      <Buttons main={{ text: "Сақтау", onClick: () => void save(), disabled: !p || p === cur.price }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
