// Figma «06 · Ұсыныстар»: Ұсыныс құру 1–4 қадам (14007:8123, 8230, 8290, 8379), Сипаттама (14018:8116), Ұсыныс тексеруде (14071:15167),
// Ұсыныс беті (14008:7998), Бағаны өзгерту (14008:8135), Ұсынысты тоқтату (14008:8304), Баға қатты түсірілді (14018:8391).
// Фото — Google Cloud Storage (venue/media.ts). Біздің жолмен келіспейтін жерлері: «Алдын ала тапсырыс» ескертуі POS емес,
// біздің тапсырыс бөлімі туралы; сипаттамадағы «дәйексөз» — дәйексөз белгісіз ақпарат блогы (04/38).
import { Rich } from "../ui/Rich";
import { __t, getLang, kk } from "../i18n";
import { kkOf, ruOf, suggest } from "../i18n/products";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, kv, nativeAlert, nativePick } from "../telegram";
import { Switch } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { api } from "../api";
import { err, money, useCurrent, V } from "./api";
import { Buttons, Note, OfferPic, Sheet, Sk, VPage, VSticker } from "./ui";
import { pickImage, uploadImage } from "./media";
import { offPeakPrice, winLabel, WEEK_SHORT, type OffPeak } from "../offpeak";
import { CATEGORIES, catLabel } from "../categories";
import s from "./V.module.css";

type Size = { units: number; price: number };
type PortionUnit = "g" | "kg" | "ml" | "l" | "cm" | "pcs" | "min";
interface Draft { keywords: string[]; title: string; titleRu: string; packName: string; packNameRu: string; bonus: string; bonusRu: string; perk: string; perkRu: string; category: string; about: string; aboutRu: string; composition: string; compositionRu: string; portion: { value: number; unit: PortionUnit } | null; photos: string[]; sizes: Size[]; regularUnitPrice: number; validDays: number;
  rules: { carry: boolean; extend: boolean; preorder: boolean; planOnly?: boolean; offPeak?: OffPeak | null; installment?: number[] | null; branches: string[] | null; monthlyLimit?: number | null; perUserLimit?: number | null; saleUntil?: string | null } }
interface OfferFull extends Omit<Draft, "keywords" | "titleRu" | "aboutRu" | "composition" | "compositionRu" | "portion" | "packName" | "packNameRu" | "bonus" | "bonusRu" | "perk" | "perkRu"> { keywords?: string[]; packName?: string; packNameRu?: string; bonus?: string; bonusRu?: string; perk?: string; perkRu?: string; titleRu?: string | null; aboutRu?: string | null; composition?: string; compositionRu?: string; portion?: Draft["portion"]; soldMonth?: number; id: string; slug: string; kind: "food" | "coffee" | "hair"; status: string; reviewNote?: { text: string; field?: string; at?: string } | null; sizes: (Size & { sold: number })[]; stats: { sold: number; active: number; used: number; revenue: number; series: { date: string; n: number }[]; growth: number | null } }

// Санат серверге қазақша сақталады (тілге тәуелсіз мән), ал экранда таңдалған тілде көрінеді: __t(c)
const DAYS = [7, 14, 30, 60, 90];
const saving = (x: Size, reg: number) => Math.max(0, Math.round((1 - x.price / (x.units * reg)) * 100));

/** Сипаттама белгілері: *жасыл* — артықшылық, _көк_ — маңызды, «> » жолы — ақпарат блогы, «• » — тізім */
/** Жеңілдік шегі (Medeo ережесі, әдепкі 30%): тым арзан пакет мекемеге де, клиентке де зиян */
const bigText = (e: unknown) => `Жеңілдік ${(e as { body?: { max?: number } }).body?.max ?? 30}%-дан аспауы керек. Тым арзан пакетте әр клиентке қызмет көрсету мекемеге шығын болады. Бағаны сәл көтеріңіз.`;


/** Бөліп төлеу (Патша, 2026-11-24, 11.4-құжат): мекеме қосады және мерзімін таңдайды; банк комиссиясын мекеме біліп тұрып қосады */
const INST = [3, 6, 12, 24] as const;
function InstallmentRow({ months, price, onChange }: { months: number[] | null; price: number; onChange: (m: number[] | null) => void }) {
  const on = Boolean(months?.length);
  const cur = months?.length ? months : [3, 6];
  const max = Math.max(...cur);
  return (
    <>
      <div className={s.row}>
        <Tile e="v:bank" size={36} />
        <span className={s.rowText}><span className={s.rowTitle}>Бөліп төлеу</span><span className={s.rowSub} style={{ whiteSpace: "normal" }}>Клиент пакетті банк арқылы бірінші жарнасыз және үстемесіз бөліп төлейді. Ақшаны банк бірден толық береді, банк комиссиясы мекемеден ұсталады.</span></span>
        <Switch on={on} onChange={(v) => { haptic.select(); onChange(v ? cur : null); }} />
      </div>
      {on && <div className={s.row} style={{ flexDirection: "column", alignItems: "stretch", gap: 10, paddingTop: 4, paddingBottom: 14 }}>
        <div className={s.chips} style={{ flexWrap: "wrap" }}>
          {INST.map((m) => {
            const sel = cur.includes(m);
            return <button key={m} className={`${s.chip} ${sel ? s.chipOn : ""}`} onClick={() => { const n = sel ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => a - b); if (!n.length) { haptic.warning(); return; } haptic.select(); onChange(n); }}>{`${m} ай`}</button>;
          })}
        </div>
        <span className={`t-cap1 ${s.muted}`}>{`Карточкада: «0-0-${max}» · айына ${money(Math.ceil(price / max))}-ден. Банк қосқанда ғана клиентке көрінеді.`}</span>
      </div>}
    </>
  );
}

/** Бос сағат: күндер, уақыт аралығы, қосымша жеңілдік (5–30%). Бағасы клиентке сатып алу парағында көрінеді. */
function OffPeakRow({ w, sizes, onChange }: { w: OffPeak | null; sizes: Size[]; onChange: (w: OffPeak | null) => void }) {
  const on = Boolean(w);
  const cur: OffPeak = w ?? { days: [1, 2, 3, 4, 5], from: "10:00", to: "12:00", pct: 10 };
  const HOURS = Array.from({ length: 17 }, (_, i) => `${String(7 + i).padStart(2, "0")}:00`); // 07:00–23:00
  const shift = (k: "from" | "to", dir: 1 | -1) => {
    const i = HOURS.indexOf(cur[k]); const n = HOURS[Math.min(HOURS.length - 1, Math.max(0, i + dir))];
    const next = { ...cur, [k]: n };
    if (next.from < next.to) { haptic.select(); onChange(next); } else haptic.warning();
  };
  return (
    <>
      <div className={s.row}>
        <Tile e="v:extend" size={36} />
        <span className={s.rowText}><span className={s.rowTitle}>Бос сағат жеңілдігі</span><span className={s.rowSub} style={{ whiteSpace: "normal" }}>Бос уақытыңызды толтырыңыз: осы сағаттарда келетін клиентке пакет арзанырақ. Жалпы жеңілдік 40%-дан аспайды.</span></span>
        <Switch on={on} onChange={(v) => { haptic.select(); onChange(v ? cur : null); }} />
      </div>
      {on && <div className={s.row} style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingTop: 4, paddingBottom: 14 }}>
        <div className={s.chips} style={{ flexWrap: "wrap" }}>
          {WEEK_SHORT.map((x, i) => {
            const d = i + 1; const sel = cur.days.includes(d);
            return <button key={x} className={`${s.chip} ${sel ? s.chipOn : ""}`} onClick={() => { const days = sel ? cur.days.filter((y) => y !== d) : [...cur.days, d].sort(); if (!days.length) { haptic.warning(); return; } haptic.select(); onChange({ ...cur, days }); }}>{__t(x)}</button>;
          })}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          {(["from", "to"] as const).map((k) => (
            <div key={k} className={s.stepper}>
              <button className={s.stepBtn} onClick={() => shift(k, -1)}>−</button>
              <span className={s.stepVal} style={{ width: 64, fontSize: 16 }}>{cur[k]}</span>
              <button className={s.stepBtn} onClick={() => shift(k, 1)}>+</button>
            </div>
          ))}
          <div className={s.stepper}>
            <button className={s.stepBtn} disabled={cur.pct <= 5} onClick={() => { haptic.select(); onChange({ ...cur, pct: cur.pct - 5 }); }}>−</button>
            <span className={s.stepVal} style={{ width: 52, fontSize: 16 }}>{`−${cur.pct}%`}</span>
            <button className={s.stepBtn} disabled={cur.pct >= 30} onClick={() => { haptic.select(); onChange({ ...cur, pct: cur.pct + 5 }); }}>+</button>
          </div>
        </div>
        <span className={`t-cap1 ${s.muted}`}>{`${winLabel(cur)} · ${sizes.map((x) => `${x.units} → ${money(offPeakPrice(x.price, cur.pct))}`).join(", ")}`}</span>
      </div>}
    </>
  );
}

function Steps({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: -4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>{[1, 2, 3, 4].map((i) => <i key={i} style={{ height: 4, borderRadius: 2, background: i <= n ? "#229af0" : "var(--separator)" }} />)}</div>
      <span className={`t-cap1 ${s.muted}`}>{`Қадам ${n} / 4 · ${label}`}</span>
    </div>
  );
}

/** Ұсыныс құру/өңдеу шебері (/v/offers/new, /v/offers/:id/edit) */
export function VOfferWizard() {
  const go = useGo();
  const me = useCurrent();
  const { id } = useParams();
  const [step, setStep] = useState(1);
  const [editAbout, setEditAbout] = useState<false | "kk" | "ru">(false);
  const [sizeEdit, setSizeEdit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("draft");
  const [photoState, setPhotoState] = useState<"" | "loading" | "error">("");
  const [d, setD] = useState<Draft>({ keywords: [], title: "", titleRu: "", packName: "", packNameRu: "", bonus: "", bonusRu: "", perk: "", perkRu: "", category: "", about: "", aboutRu: "", composition: "", compositionRu: "", portion: null, photos: [], sizes: [{ units: 4, price: 6000 }], regularUnitPrice: 2000, validDays: 30, rules: { carry: true, extend: true, preorder: true, branches: null } });
  // Іздеу сөздері мен санат ұсынысы (2-кезең)
  const [kw, setKw] = useState("");
  const addKw = () => { const v = kw.trim().toLowerCase().replace(/,$/, ""); if (v.length >= 2 && !d.keywords.includes(v) && d.keywords.length < 8) { haptic.select(); setD((x) => ({ ...x, keywords: [...x.keywords, v] })); } setKw(""); };
  const [aiCat, setAiCat] = useState<"idle" | "busy" | "off">("idle");
  const [aiNote, setAiNote] = useState("");
  const suggestCat = async () => {
    if (!me) return; setAiCat("busy"); setAiNote("");
    try {
      const r = await api<{ category: string; confidence: number; top: { category: string; p: number }[] }>(`/v1/venue/${me.venue.id}/offers/suggest-category`, { method: "POST", body: JSON.stringify({ title: d.title.trim(), packName: d.packName.trim() || undefined, composition: d.composition.trim() || undefined, about: d.about.slice(0, 500) || undefined }) });
      // Сенімділік 70%-дан төмен болса — өзі таңдамаймыз, екі нұсқаны ұсынамыз (сынақ: «Таңғы ас» → 55%, 2026-11-25)
      if (r.confidence >= 0.7) { haptic.success(); setD((x) => ({ ...x, category: r.category })); setAiNote(`${catLabel(r.category, getLang())} · ${Math.round(r.confidence * 100)}%`); }
      else { haptic.select(); setAiNote(`Нақты емес: ${r.top.slice(0, 2).map((t) => `${catLabel(t.category, getLang())} ${Math.round(t.p * 100)}%`).join(" не ")} — өзіңіз таңдаңыз`); }
      setAiCat("idle");
    } catch (e) { const code = (e as { body?: { error?: string } }).body?.error; if (code === "ai_off") setAiCat("off"); else { haptic.error(); setAiNote("Қазір ұсына алмадым — өзіңіз таңдаңыз"); setAiCat("idle"); } }
  };
  const hadExtra = useRef(false);
  useEffect(() => { if (id && me) api<{ offer: OfferFull }>(`/v1/venue/${me.venue.id}/offers/${id}`).then(({ offer: o }) => { setStatus(o.status); hadExtra.current = Boolean(o.composition || o.compositionRu || o.portion || o.packName || o.packNameRu || o.bonus || o.bonusRu || o.perk || o.perkRu); setD({ keywords: o.keywords ?? [], title: o.title, titleRu: o.titleRu ?? ruOf(o.title) ?? "", packName: o.packName ?? "", packNameRu: o.packNameRu ?? "", bonus: o.bonus ?? "", bonusRu: o.bonusRu ?? "", perk: o.perk ?? "", perkRu: o.perkRu ?? "", category: o.category ?? "", about: o.about, aboutRu: o.aboutRu ?? "", composition: o.composition ?? "", compositionRu: o.compositionRu ?? "", portion: o.portion ?? null, photos: o.photos ?? [], sizes: o.sizes.map(({ units, price }) => ({ units, price })), regularUnitPrice: o.regularUnitPrice, validDays: o.validDays, rules: o.rules }); }).catch(() => null); }, [id, me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  // Бір тілде жазса, екіншісі сөздіктен өзі толады (бос не бұрын өзі толтырылған болса ғана — мекеме жазғанын баспаймыз)
  const setTitle = (v: string) => setD((x) => { const auto = !x.titleRu || x.titleRu === ruOf(x.title); return { ...x, title: v, titleRu: auto ? ruOf(v) ?? (auto && x.titleRu ? "" : x.titleRu) : x.titleRu }; });
  const setTitleRu = (v: string) => setD((x) => { const auto = !x.title || x.title === kkOf(x.titleRu); return { ...x, titleRu: v, title: auto ? kkOf(v) ?? x.title : x.title }; });
  const sugg = me ? suggest(me.venue.kind, getLang() === "ru" ? d.titleRu : d.title).filter(([a]) => a !== d.title) : [];
  async function addPhoto() {
    if (!me || photoState === "loading") return;
    const f = await pickImage(); if (!f) return;
    setPhotoState("loading");
    try { const url = await uploadImage(me.venue.id, f, "offer"); up({ photos: [url] }); setPhotoState(""); haptic.success(); }
    catch (e) { setPhotoState("error"); haptic.error(); if (err(e) === "storage_disabled") nativeAlert("Сурет сақтау орны әлі қосылмаған (Cloud Storage)."); else if (err(e) === "too_large") nativeAlert("Сурет 5 МБ-тан үлкен."); }
  }
  const low = d.sizes.find((x) => saving(x, d.regularUnitPrice) < 10);
  const locked = Boolean(id) && status !== "draft"; // жарияланған ұсыныстың бағасы — тек «Бағаны өзгерту» арқылы

  const [terms, setTerms] = useState(false);
  const save = useCallback(async (publish: boolean, accepted = false) => {
    if (!me || busy) return;
    if (publish && status === "draft" && !accepted && !(await kv.get("medeo_offer_terms"))) { setTerms(true); return; }
    setBusy(true); haptic.medium();
    // Құрамы/порция тек толтырылса не бұрын сақталған болса жіберіледі (бос болса — кілт жоқ: ескі сервер нұсқасы да қабылдайды)
    const { composition, compositionRu, portion, packName, packNameRu, bonus, bonusRu, perk, perkRu, ...rest } = d;
    const texts = { composition, compositionRu, packName, packNameRu, bonus, bonusRu, perk, perkRu };
    const extra = Object.values(texts).some((x) => x.trim()) || portion || hadExtra.current
      ? { ...Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, v.trim()])), portion: portion && portion.value > 0 ? portion : null } : {};
    const body = { ...rest, ...extra, titleRu: d.titleRu.trim() || undefined, aboutRu: d.aboutRu.trim() || undefined, category: d.category || undefined, publish };
    try {
      const st = id ? (await api<{ status: string }>(`/v1/venue/${me.venue.id}/offers/${id}`, { method: "PUT", body: JSON.stringify(body) })).status
        : (await api<{ offer: { status: string } }>(`/v1/venue/${me.venue.id}/offers`, { method: "POST", body: JSON.stringify(body) })).offer.status;
      haptic.success();
      // «Ұсыныс тексеруде» — тек Medeo тексеруіне кеткенде (нақты режим); сынақ режимінде бірден жарияланады
      go(st === "review" ? "/v/offers/review" : "/v/offers", "forward", { replace: true });
    } catch (e) { haptic.error(); nativeAlert(err(e) === "low_discount" ? "Жеңілдік кемінде 10% болуы керек: көлем бағасын азайтыңыз." : err(e) === "big_discount" ? bigText(e) : err(e) === "title_ru_required" ? "Атауын орысша да жазыңыз: клиенттер орыс тілінде де көреді." : err(e) === "about_ru_required" ? "Сипаттаманы орысша да жазыңыз." : err(e) === "composition_ru_required" ? "Құрамын орысша да жазыңыз." : err(e) === "pack_name_ru_required" ? "Пакет атауын орысша да жазыңыз." : err(e) === "extras_ru_required" ? "Сыйлық пен артықшылықты орысша да жазыңыз." : err(e) === "sale_until_past" ? "Сатылым соңы өткен күн бола алмайды." : err(e) === "big_off_peak" ? `Бос сағат бағасымен жалпы жеңілдік ${(e as { body?: { max?: number } }).body?.max ?? 40}%-дан аспауы керек. Бос сағат жеңілдігін азайтыңыз.` : "Сақталмады. Қайталап көріңіз."); }
    finally { setBusy(false); }
  }, [me, busy, d, id, status, go]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => {
    // Атау да, сипаттама да екі тілде міндетті (Патша, 2026-11-18): әр клиент өз тілінде оқиды, бір тіл екіншісін алмастырмайды
    if (step === 1 && d.title.trim().length < 2) { haptic.error(); return nativeAlert("Атауын қазақша жазыңыз."); }
    if (step === 1 && d.titleRu.trim().length < 2) { haptic.error(); return nativeAlert("Атауын орысша да жазыңыз: клиенттер орыс тілінде де көреді."); }
    if (step === 1 && d.about.trim() && !d.aboutRu.trim()) { haptic.error(); return nativeAlert("Сипаттаманы орысша да жазыңыз."); }
    if (step === 1 && d.aboutRu.trim() && !d.about.trim()) { haptic.error(); return nativeAlert("Сипаттаманы қазақша да жазыңыз."); }
    if (step === 1 && d.packName.trim() && !d.packNameRu.trim()) { haptic.error(); return nativeAlert("Пакет атауын орысша да жазыңыз."); }
    if (step === 1 && d.packNameRu.trim() && !d.packName.trim()) { haptic.error(); return nativeAlert("Пакет атауын қазақша да жазыңыз."); }
    if (step === 1 && ([["bonus", "bonusRu"], ["perk", "perkRu"]] as const).some(([a, b]) => Boolean(d[a].trim()) !== Boolean(d[b].trim()))) { haptic.error(); return nativeAlert("Сыйлық пен артықшылықты екі тілде де жазыңыз (не екеуін де бос қалдырыңыз)."); }
    if (step === 1 && d.composition.trim() && !d.compositionRu.trim()) { haptic.error(); return nativeAlert("Құрамын орысша да жазыңыз."); }
    if (step === 1 && d.compositionRu.trim() && !d.composition.trim()) { haptic.error(); return nativeAlert("Құрамын қазақша да жазыңыз."); }
    if (step === 2 && low && !locked) { haptic.error(); return nativeAlert(`Жеңілдік 10%-дан аз: ${low.units} бірлік. Бағаны азайтыңыз не қалыпты бағаны тексеріңіз.`); }
    haptic.tap(); setStep((x) => Math.min(4, x + 1));
  }, [step, d, low, locked]);
  const back = useCallback(() => { if (step === 1) go(-1, "back"); else setStep((x) => x - 1); }, [step, go]);

  if (!me) return <VPage back><Sk h={200} /></VPage>;
  if (terms) return <OfferTerms onBack={() => setTerms(false)} onAccept={() => { kv.set("medeo_offer_terms", "1"); setTerms(false); void save(true, true); }} />;
  if (editAbout) return <AboutEditor ru={editAbout === "ru"} value={editAbout === "ru" ? d.aboutRu : d.about} onDone={(v) => { up(editAbout === "ru" ? { aboutRu: v } : { about: v }); setEditAbout(false); }} />;
  const label = ["Негізгі", "Көлем және баға", "Мерзім және ережелер", "Алдын ала қарау"][step - 1];
  const branches = me.branches;
  return (
    <VPage title={id ? "Ұсынысты өңдеу" : "Ұсыныс құру"} back>
      <Steps n={step} label={label} />
      {step === 1 && <>
        <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
          <span className="t-cap1" style={{ color: "var(--link)" }}>Атауы (қазақша)</span>
          <input value={d.title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Мысалы: Тауық донері"
            style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        </label>
        {/* Атау екі тілде (Патша, 2026-11-18): клиент таңдаған тілде көреді. Сөздіктегі атау болса — екіншісі өзі толады */}
        <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
          <span className="t-cap1" style={{ color: "var(--link)" }}>Атауы (орысша)</span>
          <input value={d.titleRu} maxLength={60} onChange={(e) => setTitleRu(e.target.value)} placeholder="Например: Куриный донер" lang="ru"
            style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        </label>
        {sugg.length > 0 && <div className={s.chips} style={{ flexWrap: "wrap" }}>
          {sugg.map(([a, b]) => <button key={a} className={`${s.chip} ${d.title === a ? s.chipOn : ""}`} onClick={() => { haptic.select(); up({ title: a, titleRu: b }); }}>{getLang() === "ru" ? b : a}</button>)}
        </div>}
        {/* Пакет атауы (Патша, 2026-11-18): міндетті емес. Берілсе — клиент карточкасында басты орында, тауар атауы астында */}
        <h2 className={s.blueHead}>Пакет атауы · міндетті емес</h2>
        <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
          <span className="t-cap1" style={{ color: "var(--link)" }}>Пакет атауы (қазақша)</span>
          <input value={d.packName} maxLength={40} onChange={(e) => up({ packName: e.target.value })} placeholder="Мысалы: Түскі ас абонементі"
            style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        </label>
        <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
          <span className="t-cap1" style={{ color: "var(--link)" }}>Пакет атауы (орысша)</span>
          <input value={d.packNameRu} maxLength={40} onChange={(e) => up({ packNameRu: e.target.value })} placeholder="Например: Абонемент на обед" lang="ru"
            style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        </label>
        <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>Клиент карточкада алдымен осы атауды, астында тауар атауын көреді. Бос қалса — тауар атауы шығады.</p>
        {/* Атау үлгілері (Хормози, MAGIC: себеп + кімге + нәтиже + мерзім + пішін) — басса, екі тілде толады, кейін өзгертуге болады */}
        <div className={s.chips} style={{ flexWrap: "wrap" }}>
          {NAME_TEMPLATES[me.venue.kind].map(([a, b]) => <button key={a} className={`${s.chip} ${d.packName === a ? s.chipOn : ""}`} onClick={() => { haptic.select(); up({ packName: a, packNameRu: b }); }}>{getLang() === "ru" ? b : a}</button>)}
        </div>
        {/* Санат тізімнен (Патша, 2026-11-25): іздеу мен сүзгі дұрыс жұмыс істеуі үшін. «Ұсыну» — Gemini Decision 1 (сервер кілті болса) */}
        <h2 className={s.blueHead}>Санат</h2>
        <div className={s.chips} style={{ flexWrap: "wrap" }}>
          {CATEGORIES[me.venue.kind].map((c) => <button key={c.kk} className={`${s.chip} ${d.category === c.kk ? s.chipOn : ""}`} onClick={() => { haptic.select(); up({ category: c.kk }); }}>{catLabel(c.kk, getLang())}</button>)}
        </div>
        {aiCat !== "off" && <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "-4px 0 4px" }}>
          <button className={s.link} disabled={aiCat === "busy" || d.title.trim().length < 2} onClick={suggestCat}>{aiCat === "busy" ? "Ойланып жатыр…" : "✨ Санатты ұсыну"}</button>
          {aiNote && <span className={`t-cap1 ${s.muted}`}>{aiNote}</span>}
        </div>}
        {/* Іздеу сөздері (Патша, 2026-11-25): клиент осы сөздермен де табады — «ролл», «сет», «жапон» */}
        <h2 className={s.blueHead}>Іздеу сөздері · міндетті емес</h2>
        <div className={s.card} style={{ padding: "10px 16px" }}>
          <div className={s.chips} style={{ flexWrap: "wrap", padding: 0, margin: d.keywords.length ? "0 0 8px" : 0 }}>
            {d.keywords.map((k) => <button key={k} className={`${s.chip} ${s.chipOn}`} onClick={() => { haptic.tap(); up({ keywords: d.keywords.filter((x) => x !== k) }); }} aria-label={`${k} — өшіру`}>{k} ✕</button>)}
          </div>
          {d.keywords.length < 8 && <input value={kw} maxLength={24} onChange={(e) => setKw(e.target.value)} enterKeyHint="done" placeholder="Мысалы: ролл, сет — Enter"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKw(); } }} onBlur={addKw}
            style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 6px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />}
        </div>
        <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>Клиент іздеуде осы сөздерді жазса да ұсынысыңызды көреді. 8-ге дейін, екі тілде араласа береді.</p>
        {/* Сипаттама екі тілде (Патша, 2026-11-18): клиент өз тілінде оқиды */}
        <div className={s.card} style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span className={`t-cap1 ${s.muted}`}>Сипаттама (қазақша)</span><button className={s.link} onClick={() => setEditAbout("kk")}>Өңдеу</button></div>
          {d.about ? <Rich text={d.about} /> : <button className={s.muted} style={{ textAlign: "left" }} onClick={() => setEditAbout("kk")}>Пакетке не кіреді, қалай беріледі — қысқаша жазыңыз</button>}
        </div>
        <div className={s.card} style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span className={`t-cap1 ${s.muted}`}>Сипаттама (орысша)</span><button className={s.link} onClick={() => setEditAbout("ru")}>Өңдеу</button></div>
          {d.aboutRu ? <Rich text={d.aboutRu} /> : <button className={s.muted} style={{ textAlign: "left" }} onClick={() => setEditAbout("ru")}>Сол сипаттаманы орысша жазыңыз</button>}
        </div>
        {/* Құрамы мен порциясы (Патша, 2026-11-18): клиент өнім бетінде «Құрамы» мен «Порция» деп көреді */}
        <TextBox label={me.venue.kind === "hair" ? "Қызметке не кіреді (қазақша)" : "Құрамы (қазақша)"} value={d.composition} onChange={(v) => up({ composition: v })}
          placeholder={me.venue.kind === "hair" ? "Мысалы: шаш қию, жуу, сәндеу" : me.venue.kind === "coffee" ? "Мысалы: эспрессо, сүт, көбік" : "Мысалы: лаваш, тауық еті, қияр, қызанақ, үй соусы"} />
        <TextBox ru label={me.venue.kind === "hair" ? "Қызметке не кіреді (орысша)" : "Құрамы (орысша)"} value={d.compositionRu} onChange={(v) => up({ compositionRu: v })}
          placeholder={me.venue.kind === "hair" ? "Например: стрижка, мытьё, укладка" : me.venue.kind === "coffee" ? "Например: эспрессо, молоко, пенка" : "Например: лаваш, курица, огурец, помидор, домашний соус"} />
        <PortionField kind={me.venue.kind} value={d.portion} onChange={(v) => up({ portion: v })} />
        {/* Мекеменің өз еркімен (Патша, 2026-11-19): Medeo есебінен емес — мекеменің өзі береді. Міндетті емес */}
        <h2 className={s.blueHead}>Мекемеден қосымша · міндетті емес</h2>
        <PairBox label="Пакетке қоса (сыйлық)" kk={d.bonus} ru={d.bonusRu} onKk={(v) => up({ bonus: v })} onRu={(v) => up({ bonusRu: v })} phKk="Мысалы: әр донерге тегін шай" phRu="Например: бесплатный чай к каждому донеру" />
        <PairBox label="Пакет иесіне артықшылық" kk={d.perk} ru={d.perkRu} onKk={(v) => up({ perk: v })} onRu={(v) => up({ perkRu: v })} phKk="Мысалы: сусынға 20% жеңілдік" phRu="Например: скидка 20% на напитки" />
        <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>Бұларды Medeo емес, мекеменің өзі береді. Кассада пакет иесі айтқанда орындалуы керек.</p>
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
              <b className={s.lead} style={{ fontSize: 19 }}>{`${x.units} бірлік`}</b><span className={`${s.tag} ${s.tagGreen}`}>{`Үнем ${saving(x, d.regularUnitPrice)}%`}</span>
              <b className={s.lead} style={{ marginLeft: "auto", fontSize: 19 }}>{money(x.price)}</b>
            </span>
            <span className={s.rowSub} style={{ display: "block", marginTop: 8 }}>Бірлікке {money(Math.round(x.price / x.units))}   <span style={{ color: "var(--link)" }}>{`Сізге төленеді: ${money(Math.round((x.price / x.units) * 0.9))} / бірлік`}</span></span>
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
        {low && !locked ? <Note tone="warn">{`Жеңілдік 10%-дан аз (${low.units} бірлік). Medeo ұсыныстарында жеңілдік кемінде 10% болуы керек.`}</Note>
          : <Note tone="warn">{locked ? "Жарияланған ұсыныстың бағасы «Бағаны өзгерту» арқылы ғана өзгереді (тек иесі)." : "Бірлік бағасы кассирдің пакет тізімінде көрінеді, ол QR-ды бірлікпен шығарады."}</Note>}
      </>}

      {step === 3 && <>
        <div className={s.card}>
          <div className={s.row}>
            <Tile e="v:clock" size={36} />
            <span className={s.rowText}><span className={s.rowTitle}>Пакет мерзімі</span><span className={s.rowSub}>Сатып алған сәттен</span></span>
            <div className={s.stepper}>
              <button className={s.stepBtn} disabled={d.validDays <= DAYS[0]} onClick={() => { haptic.select(); up({ validDays: [...DAYS].reverse().find((x) => x < d.validDays) ?? DAYS[0] }); }}>−</button>
              <span className={s.stepVal} style={{ width: 64, fontSize: 16 }}>{`${d.validDays} күн`}</span>
              <button className={s.stepBtn} disabled={d.validDays >= DAYS[DAYS.length - 1]} onClick={() => { haptic.select(); up({ validDays: DAYS.find((x) => x > d.validDays) ?? d.validDays }); }}>+</button>
            </div>
          </div>
          {([["carry", "v:carry", "Қалғанын көшіру", "Қайта алғанда қалған бірлік қосылады"], ["extend", "v:extend", "Мерзімді ұзарту", "1 рет тегін +7 күн"], ["preorder", "v:preorder", "Алдын ала тапсырыс", "Клиент тапсырыс беріп, өзі алып кетеді"]] as const).map(([k, e, t, sub]) => (
            <div key={k} className={s.row}>
              <Tile e={e} size={36} />
              <span className={s.rowText}><span className={s.rowTitle}>{t}</span><span className={s.rowSub}>{sub}</span></span>
              <Switch on={Boolean(d.rules[k])} onChange={(v) => up({ rules: { ...d.rules, [k]: v, ...(k === "preorder" && !v ? { planOnly: false } : {}) } })} />
            </div>
          ))}
          {/* «Тек жоспар бойынша» (Патша, 2026-11-18): клиент әр қолдануды күн мен уақытқа алдын ала жоспарлайды; QR мен «қазір» тапсырыс жабық */}
          <div className={s.row}>
            <Tile e="v:clock" size={36} />
            <span className={s.rowText}><span className={s.rowTitle}>Тек жоспар бойынша</span><span className={s.rowSub} style={{ whiteSpace: "normal" }}>Клиент әр келуін күн мен уақытқа алдын ала жоспарлайды. Кассада QR-мен және «қазір» тапсырыспен қолданылмайды.</span></span>
            <Switch on={Boolean(d.rules.planOnly)} onChange={(v) => up({ rules: { ...d.rules, planOnly: v, ...(v ? { preorder: true } : { offPeak: null }) } })} />
          </div>
          {/* Бос сағат жеңілдігі (Патша, 2026-11-18): тек «Тек жоспар бойынша» қосулы болса — бос уақытты қосымша жеңілдікпен толтыру */}
          {d.rules.planOnly && <OffPeakRow w={d.rules.offPeak ?? null} sizes={d.sizes} onChange={(w) => up({ rules: { ...d.rules, offPeak: w } })} />}
          <InstallmentRow months={d.rules.installment ?? null} price={d.sizes[0]?.price ?? 0} onChange={(m) => up({ rules: { ...d.rules, installment: m } })} />
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
        {/* Сату лимиті (Патша, 2026-11-18): айына неше пакет сатылады (1-інде қайта ашылады) және бір адам айына неше пакет ала алады */}
        <h2 className={s.blueHead}>Сату лимиті</h2>
        <div className={s.card}>
          <LimitRow title="Айлық лимит" sub="Айына осынша пакет сатылады. Таусылса — «Таусылды» деп тұрады, әр айдың 1-інде қайта ашылады." def={50} min={1} max={100000} unit="Айына неше пакет"
            value={d.rules.monthlyLimit ?? null} onChange={(v) => up({ rules: { ...d.rules, monthlyLimit: v } })} />
          <LimitRow title="Бір адамға шек" sub="Бір клиент айына осыдан артық пакет ала алмайды (өзіне де, сыйлыққа да)." def={1} min={1} max={100} unit="Бір адам айына неше пакет"
            value={d.rules.perUserLimit ?? null} onChange={(v) => up({ rules: { ...d.rules, perUserLimit: v } })} />
        </div>
        {/* Сатылым соңы (Патша, 2026-11-19): шынайы мерзім — сол күн қоса сатылады, кейін ұсыныс «аяқталды». Сатылған пакеттер жұмыс істей береді */}
        <div className={s.card}>
          <div className={s.row}>
            <span className={s.rowText}><span className={s.rowTitle}>Сатылым соңы</span><span className={s.rowSub} style={{ whiteSpace: "normal" }}>Осы күнге дейін ғана сатылады (мыс. «Қараша пакеті»). Соңғы 7 күнде клиент «N күн қалды» деп көреді. Сатылған пакеттер өз мерзімімен жұмыс істей береді.</span></span>
            <Switch on={Boolean(d.rules.saleUntil)} onChange={(on) => { haptic.select(); up({ rules: { ...d.rules, saleUntil: on ? monthEnd() : null } }); }} />
          </div>
          {d.rules.saleUntil && (
            <div className={s.row} style={{ paddingTop: 0 }}>
              <span className={s.rowText}><span className={s.rowSub}>Соңғы күн</span></span>
              <input type="date" value={d.rules.saleUntil} min={todayStr()} onChange={(e) => up({ rules: { ...d.rules, saleUntil: e.target.value || null } })}
                style={{ border: 0, outline: 0, background: "none", font: "inherit", fontSize: 16, color: "var(--text-strong)" }} />
            </div>
          )}
        </div>
        {d.rules.monthlyLimit ? <Note>{`Клиент карточкада «Қалды ${d.rules.monthlyLimit} / ${d.rules.monthlyLimit}» деп көреді. Лимитті кез келген уақытта көбейте аласыз — күтіп тұрғандарға бот хабарлайды.`}</Note> : null}
      </>}

      {step === 4 && <>
        <h2 className={s.blueHead}>Клиент осылай көреді</h2>
        <div className={s.card} style={{ padding: 16 }}>
          <b className={s.lead} style={{ fontSize: 19 }}>{d.packName.trim() || `${d.title || "Атауы"} · ${d.sizes[0].units} дана`}</b>
          <p className={`t-cap1 ${s.muted}`} style={{ marginTop: 2 }}>{d.packName.trim() ? `${d.title || "Атауы"} · ${d.sizes[0].units} дана · ${me.venue.name}` : me.venue.name}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <span style={{ width: 170, height: 110, borderRadius: 14, background: "var(--thumb-bg)", display: "grid", placeItems: "center", overflow: "hidden" }}>{d.photos[0] ? <img src={d.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <OfferPic kind={me.venue.kind} size={40} />}</span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, justifyContent: "center" }}>
              <b style={{ fontSize: 24, fontWeight: 700 }}>{money(d.sizes[0].price)}</b>
              <span className={`${s.tag} ${s.tagYellow}`}>{`${money(Math.round(d.sizes[0].price / d.sizes[0].units))} / дана`}</span>
              <span className={`${s.tag} ${s.tagGreen}`}>{`${money(d.sizes[0].units * d.regularUnitPrice - d.sizes[0].price)} үнем`}</span>
            </span>
          </div>
        </div>
        <h2 className={s.blueHead}>Тексеру тізімі</h2>
        <div className={s.card}>
          <Check ok={d.title.length > 1 && d.titleRu.length > 1 && Boolean(d.about) && Boolean(d.aboutRu) && Boolean(d.photos[0])} t="Атауы, сипаттама, фото" sub={!d.about ? "Сипаттама жазылмаған" : !d.aboutRu ? "Орысша сипаттама жазылмаған" : !d.photos[0] ? "Фото қосылмаған" : undefined} />
          <Check ok={!low} t="Көлем мен бағалар" sub={low ? "Жеңілдік 10%-дан аз" : undefined} />
          {d.composition.trim() && d.portion ? <Check ok t="Құрамы мен порциясы" /> : <Check warn t="Құрамы мен порциясы" sub={!d.composition.trim() ? "Құрамы жазылмаған — клиент не алатынын білмейді" : "Порциясы көрсетілмеген"} tag="Ұсыныс" />}
          {(d.rules.monthlyLimit || d.rules.perUserLimit) && <Check ok t="Сату лимиті" sub={[d.rules.monthlyLimit ? `айына ${d.rules.monthlyLimit} пакет` : "", d.rules.perUserLimit ? `бір адамға ${d.rules.perUserLimit}` : ""].filter(Boolean).join(" · ")} />}
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

const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
/** Осы айдың соңғы күні (Алматы): «Қараша пакеті» үшін әдепкі сатылым соңы */
const monthEnd = () => { const [y, m] = todayStr().split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const MONTH_KK = [kk("Қаңтар"), kk("Ақпан"), kk("Наурыз"), kk("Сәуір"), kk("Мамыр"), kk("Маусым"), kk("Шілде"), kk("Тамыз"), kk("Қыркүйек"), kk("Қазан"), kk("Қараша"), kk("Желтоқсан")];
const MONTH_RU = [kk("январский"), kk("февральский"), kk("мартовский"), kk("апрельский"), kk("майский"), kk("июньский"), kk("июльский"), kk("августовский"), kk("сентябрьский"), kk("октябрьский"), kk("ноябрьский"), kk("декабрьский")];
const mi = () => Number(todayStr().slice(5, 7)) - 1;
/** Пакет атауының үлгілері (MAGIC): кімге + нәтиже + мерзім + пішін */
const NAME_TEMPLATES: Record<"food" | "coffee" | "hair", [string, string][]> = {
  food: [[kk("Түскі ас абонементі"), kk("Абонемент на обед")], [kk("Студенттің түскі асы"), kk("Студенческий обед")], [kk(`${MONTH_KK[mi()]} пакеті`), kk(`${MONTH_RU[mi()]} пакет`).replace(/^./, (c) => c.toUpperCase())], [kk("Аптасына бір донер"), kk("Донер раз в неделю")]],
  coffee: [[kk("Таңғы кофе абонементі"), kk("Утренний кофе-абонемент")], [kk("Кеңседегі кофе"), kk("Кофе для офиса")], [kk(`${MONTH_KK[mi()]} пакеті`), kk(`${MONTH_RU[mi()]} пакет`).replace(/^./, (c) => c.toUpperCase())], [kk("Күнделікті латте"), kk("Латте каждый день")]],
  hair: [[kk("Ай сайынғы күтім"), kk("Ежемесячный уход")], [kk("Ұқыпты шаш · 2 ай"), kk("Аккуратная стрижка · 2 месяца")], [kk(`${MONTH_KK[mi()]} пакеті`), kk(`${MONTH_RU[mi()]} пакет`).replace(/^./, (c) => c.toUpperCase())], [kk("Сақал мен шаш"), kk("Борода и стрижка")]],
};

/** Екі тілдегі қысқа өріс (сыйлық, артықшылық) */
function PairBox({ label, kk, ru, onKk, onRu, phKk, phRu }: { label: string; kk: string; ru: string; onKk: (v: string) => void; onRu: (v: string) => void; phKk: string; phRu: string }) {
  const inp = { display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" } as const;
  return (
    <div className={s.card} style={{ padding: "10px 16px 4px" }}>
      <span className="t-cap1" style={{ color: "var(--link)" }}>{`${label} · қазақша`}</span>
      <input value={kk} maxLength={80} onChange={(e) => onKk(e.target.value)} placeholder={phKk} style={inp} />
      <span className="t-cap1" style={{ color: "var(--link)", display: "block", marginTop: 8 }}>{`${label} · орысша`}</span>
      <input value={ru} maxLength={80} lang="ru" onChange={(e) => onRu(e.target.value)} placeholder={phRu} style={inp} />
    </div>
  );
}

/** Көп жолды мәтін өрісі (құрамы): атау өрістерімен бір стильде */
function TextBox({ label, value, onChange, placeholder, ru }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; ru?: boolean }) {
  return (
    <label className={s.card} style={{ padding: "10px 16px 0", display: "block" }}>
      <span className="t-cap1" style={{ color: "var(--link)" }}>{label}</span>
      <textarea value={value} maxLength={300} rows={2} lang={ru ? "ru" : undefined} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ display: "block", width: "100%", border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, lineHeight: "22px", padding: "4px 0 10px", color: "var(--text-strong)", borderBottom: "2px solid #229af0", resize: "none", fieldSizing: "content", minHeight: 52 } as React.CSSProperties} />
    </label>
  );
}

const UNITS: Record<"food" | "coffee" | "hair", [PortionUnit, string][]> = {
  food: [["g", "г"], ["kg", "кг"], ["ml", "мл"], ["l", "л"], ["cm", "см"], ["pcs", "дана"]],
  coffee: [["ml", "мл"], ["l", "л"], ["g", "г"]],
  hair: [["min", "мин"]],
};
/** Порция: сан + өлшем (донер — 350 г, кофе — 350 мл, пицца — 30 см, шаш қию — 45 мин) */
function PortionField({ kind, value, onChange }: { kind: "food" | "coffee" | "hair"; value: Draft["portion"]; onChange: (v: Draft["portion"]) => void }) {
  const units = UNITS[kind] ?? UNITS.food;
  const unit = value?.unit ?? units[0][0];
  return (
    <div className={s.card} style={{ padding: "10px 16px 12px" }}>
      <span className="t-cap1" style={{ color: "var(--link)" }}>{kind === "hair" ? "Ұзақтығы (бір келу)" : "Порция (бір бірлік)"}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <input inputMode="decimal" value={value ? String(value.value).replace(".", ",") : ""} placeholder={kind === "hair" ? "45" : kind === "coffee" ? "350" : "350"}
          onChange={(e) => { const n = Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")); onChange(n > 0 ? { value: Math.min(100000, n), unit } : null); }}
          style={{ width: 96, border: 0, outline: 0, background: "none", font: "inherit", fontSize: 17, padding: "4px 0 6px", color: "var(--text-strong)", borderBottom: "2px solid #229af0" }} />
        <div className={s.chips} style={{ flexWrap: "wrap", margin: 0 }}>
          {units.map(([u, t]) => <button key={u} className={`${s.chip} ${unit === u ? s.chipOn : ""}`} onClick={() => { haptic.select(); onChange({ value: value?.value ?? 0, unit: u }); }}>{t}</button>)}
        </div>
      </div>
    </div>
  );
}

/** Лимит жолы: қосқыш, қосулы болса астында сан (− / +) */
function LimitRow({ title, sub, value, onChange, def, min, max, unit }: { title: string; sub: string; value: number | null; onChange: (v: number | null) => void; def: number; min: number; max: number; unit: string }) {
  const step = (v: number) => (v >= 100 ? 10 : 1);
  return (
    <>
      <div className={s.row}>
        <span className={s.rowText}><span className={s.rowTitle}>{title}</span><span className={s.rowSub} style={{ whiteSpace: "normal" }}>{sub}</span></span>
        <Switch on={value != null} onChange={(on) => { haptic.select(); onChange(on ? def : null); }} />
      </div>
      {value != null && (
        <div className={s.row} style={{ paddingTop: 0 }}>
          <span className={s.rowText}><span className={s.rowSub}>{unit}</span></span>
          <div className={s.stepper}>
            <button className={s.stepBtn} disabled={value <= min} onClick={() => { haptic.select(); onChange(Math.max(min, value - step(value - 1))); }}>−</button>
            <input inputMode="numeric" className={s.stepVal} value={value} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); onChange(Math.min(max, Math.max(min, n || min))); }}
              style={{ width: 72, fontSize: 16, border: 0, outline: 0, background: "none", textAlign: "center", color: "var(--text-strong)", font: "inherit" }} />
            <button className={s.stepBtn} disabled={value >= max} onClick={() => { haptic.select(); onChange(Math.min(max, value + step(value))); }}>+</button>
          </div>
        </div>
      )}
    </>
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
      {x.units > 0 && x.price > 0 && <div style={{ display: "flex", gap: 8 }}><span className={`${s.tag} ${s.tagGreen}`}>{`Үнем ${saving(x, reg)}%`}</span><span className={s.tag}>{`Бірлікке ${money(Math.round(x.price / x.units))}`}</span></div>}
      {canDelete && <button className={`${s.textBtn} ${s.redText}`} style={{ alignSelf: "flex-start" }} onClick={onDelete}>Көлемді өшіру</button>}
      <Buttons main={{ text: "Сақтау", onClick: () => onSave(x), disabled: !x.units || !x.price }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Figma «Сипаттама» (14018:8116): құралдар жолағы — жасыл (артықшылық), көк (маңызды), ақпарат блогы, тізім; 500 таңба */
function AboutEditor({ value, onDone, ru }: { value: string; onDone: (v: string) => void; ru?: boolean }) {
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
    <VPage title={ru ? "Сипаттама (орысша)" : "Сипаттама (қазақша)"} back>
      <div style={{ display: "flex", gap: 8 }}>
        {tool("g", <i style={{ width: 18, height: 18, borderRadius: 9, background: "#31d158" }} />, () => wrap("*"))}
        {tool("b", <i style={{ width: 18, height: 18, borderRadius: 9, background: "#229af0" }} />, () => wrap("_"))}
        {tool("q", <span style={{ fontSize: 14 }}>ℹ︎</span>, () => line("> "))}
        {tool("l", "☰", () => line("• "))}
      </div>
      <div className={s.card} style={{ padding: "12px 16px" }}>
        <textarea ref={setEl} value={v} maxLength={500} rows={5} onChange={(e) => setV(e.target.value)} placeholder={ru ? kk("Лаваш, курица и фирменный соус…") : "Лаваш, тауық еті және фирмалық соус…"} lang={ru ? "ru" : "kk"}
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
        <p className={s.stateText}>Medeo командасы 24 сағат ішінде қарайды. Бекітілген соң ұсыныс клиенттерге көрінеді, нәтижесін Telegram арқылы хабарлаймыз.</p>
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
      {o.reviewNote?.text && <>
        <p className="t-sub2 infoBox infoWarn" style={{ margin: 0 }}>{`Medeo түзету сұрады: «${o.reviewNote.text}». Түзеткен соң ұсыныс қайта тексеріледі.`}</p>
        <button className={s.btn} style={{ flex: "none" }} onClick={() => go(`/v/offers/${o.id}/edit`)}>Түзету</button>
      </>}
      <div className={s.head}>
        <span className={s.ocPic} style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}>{o.photos?.[0] ? <img src={o.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <OfferPic kind={o.kind} size={38} />}</span>
        <span className={s.headText}>
          <span className={s.headName} style={{ fontSize: 22 }}>{o.title}</span>
          <span style={{ display: "flex", gap: 6, marginTop: 6 }}><span className={`${s.tag} ${s[tc]}`}>{tt}</span><span className={`${s.tag} ${s.tagGray}`}>{`${o.sizes.length} көлем`}</span></span>
        </span>
      </div>
      <div className={s.stats}>
        <div className={s.stat}><span className={s.statLabel}>Сатылды</span><span className={s.statNum} style={{ fontSize: 22 }}>{`${o.stats.sold} пакет`}</span></div>
        {o.rules.monthlyLimit ? <div className={s.stat}><span className={s.statLabel}>Осы айдың лимиті</span><span className={s.statNum} style={{ fontSize: 22, color: (o.soldMonth ?? 0) >= o.rules.monthlyLimit ? "#e53935" : undefined }}>{`${o.soldMonth ?? 0} / ${o.rules.monthlyLimit}`}</span></div> : null}
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
            <span className={s.rowText}><span className={s.rowTitle} style={{ fontWeight: 600 }}>{`${x.units} бірлік · ${money(x.price)}`}</span><span className={s.rowSub}>{`${x.sold} сатылды`}</span></span>
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
      } else { haptic.error(); nativeAlert(k === "low_discount" ? "Жеңілдік 10%-дан аз болмауы керек." : k === "big_discount" ? bigText(e) : "Сақталмады."); }
    }
  };
  const diff = p - cur.price;
  return (
    <Sheet title="Бағаны өзгерту" onClose={onClose}>
      <div className={s.chips}>{o.sizes.map((x) => <button key={x.units} className={`${s.chip} ${u === x.units ? s.chipOn : ""}`} onClick={() => { haptic.select(); setU(x.units); }}>{`${x.units} бірлік`}</button>)}</div>
      <NumField label={`Жаңа баға (${u} бірлік)`} value={p} suffix=" ₸" onChange={setP} />
      <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>{`Қазіргі баға ${money(cur.price)}`}</p>
      {p > 0 && <div style={{ display: "flex", gap: 8 }}>{diff !== 0 && <span className={`${s.tag} ${diff > 0 ? s.tagYellow : s.tagGreen}`}>{diff > 0 ? "+" : "−"}{money(Math.abs(diff))}</span>}<span className={s.tag}>{`Бірлікке ${money(Math.round(p / u))}`}</span></div>}
      <Note tone="warn">Жаңа баға тек жаңа пакеттерге қолданылады. Бар пакеттер ескі бағамен жүре береді, ал қайта алғанда клиентке баға өзгергені көрсетіледі.</Note>
      <Buttons main={{ text: "Сақтау", onClick: () => void save(), disabled: !p || p === cur.price }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Figma «Шарттар: баға және комиссия» (14045:10669) — бірінші ұсынысты жарияламас бұрын бір рет */
function OfferTerms({ onBack, onAccept }: { onBack: () => void; onAccept: () => void }) {
  const [ok, setOk] = useState(false);
  const blocks: [string, string][] = [
    ["Баға бойынша міндеттеме", "Пакетті сатып алған клиентке көрсетілген бағамен қызмет көрсетуге міндеттенесіз. Баға кейін өзгерсе, бұрын сатылған пакетке әсер етпейді."],
    ["Комиссия", "Әр қолданудан 10%. Рейтинг 4,7★ және 20+ пікір болса — 9%, 4,9★ және 50+ пікір — 8%. Комиссия қолданылған сәтте жазылады: кейін өзгерсе де өткен есеп өзгермейді. Клиентке көрсетілмейді."],
    ["Мерзімі өткен пакет", "Мерзім мен күту кезеңі біткен соң қолданылмаған дананың сомасы клиентке Medeo бонусы болып қайтады, мекемеге есептелмейді."],
    ["Қайтару және шағым", "Қате қолдану расталса, дана клиентке қайтарылады, төлем есепте түзетіледі."],
  ];
  return (
    <VPage title="Ұсыныс шарттары" back>
      {blocks.map(([t, x]) => <div key={t} className={s.card} style={{ padding: "12px 16px" }}><h3 className={s.blueHead} style={{ padding: 0 }}>{t}</h3><p style={{ marginTop: 6, fontSize: 16, lineHeight: "22px" }}>{x}</p></div>)}
      <button onClick={() => { haptic.select(); setOk(!ok); }} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 16 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: ok ? "#229af0" : "none", boxShadow: ok ? "none" : "inset 0 0 0 2px #b0b5ba", color: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700 }}>{ok ? "✓" : ""}</span>Шарттармен таныстым
      </button>
      <Buttons main={{ text: "Қабылдау", onClick: onAccept, disabled: !ok }} second={{ text: "Артқа", onClick: onBack }} />
    </VPage>
  );
}
