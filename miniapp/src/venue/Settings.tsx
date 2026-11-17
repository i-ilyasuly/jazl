// Figma «12 · Мәзір, профиль, қолдау»: Мекеме профилі (14012:9193; мұқаба/логотип күйлері 14024:*), Баптаулар (14012:9260),
// Қолдау (14012:9333), Кассаға нұсқау (14012:9387).
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useGo } from "../nav";
import { askWriteAccess, biometricAuth, botCanWrite, downloadFile, haptic, nativeAlert, openChat, openExternal, saveFile } from "../telegram";
import { Switch } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { api, API_URL } from "../api";
import { SUPPORT_BOT, BOT_APP_LINK } from "../config";
import { hasPin, markPinOk, pinFresh, setSettings } from "../store";
import { err, loadStaff, useCurrent } from "./api";
import { pickImage, uploadImage } from "./media";
import { Buttons, Note, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

interface Profile { name: string; about: string; logoUrl: string | null; coverUrl: string | null; gallery: string[]; tags: string[] }
export interface Prefs { newOrder: boolean; daily: boolean; newReview: boolean; paymentSent: boolean; orderFailed: boolean; offerEnding: boolean; pin: boolean }
const TAGS = { food: ["Тағам", "Донер", "Бургер", "Фастфуд", "Ұлттық"], coffee: ["Кофе", "Десерт", "Таңғы ас", "Шай"], hair: ["Шаштараз", "Барбер", "Балалар", "Әйелдер"] };

let prefsCache: Record<string, Prefs> = {};
export async function venuePrefs(venueId: string): Promise<Prefs | null> {
  if (prefsCache[venueId]) return prefsCache[venueId];
  try { const r = await api<{ prefs: Prefs }>(`/v1/venue/${venueId}/prefs`); prefsCache[venueId] = r.prefs; return r.prefs; } catch { return null; }
}
/** «PIN-код: кассир режимін ашу үшін» қосулы болса — QR шығарар алдында биометрия не PIN (5 минут жарамды). true — жалғастыруға болады. */
export async function cashierUnlock(venueId: string, go: (to: string, dir?: "up") => void): Promise<boolean> {
  const p = await venuePrefs(venueId);
  if (!p?.pin || pinFresh()) return true;
  if ((await biometricAuth("Кассир режимін ашу")) === "ok") { markPinOk(); return true; }
  go(hasPin() ? "/profile/pin/confirm" : "/profile/pin/create", "up");
  return false;
}

function ImageRow({ label, url, hint, round, busy, error, onPick, onClear }: { label: string; url: string | null; hint: string; round?: boolean; busy: boolean; error: boolean; onPick: () => void; onClear: () => void }) {
  return (
    <>
      <h2 className={s.blueHead}>{label}</h2>
      <div className={s.card} style={{ boxShadow: error ? "inset 0 0 0 1.5px #e53935" : undefined }}>
        <button className={s.row} onClick={onPick}>
          <span style={{ width: 52, height: 52, borderRadius: round ? 26 : 12, overflow: "hidden", background: "var(--thumb-bg)", display: "grid", placeItems: "center", flex: "none" }}>
            {busy ? <span className={s.sk} style={{ width: 52, height: 52 }} /> : url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22, color: "var(--link)" }}>+</span>}
          </span>
          <span className={s.rowText}><span className={s.rowTitle}>{busy ? "Жүктелуде…" : error ? "Жүктелмеді" : url ? "Ауыстыру" : "Жүктеу"}</span><span className={s.rowSub} style={error ? { color: "#e53935" } : undefined}>{error ? "Желіні тексеріп, қайта басыңыз" : "WebP · сығылып сақталады"}</span></span>
          {url && !busy && <span role="button" onClick={(e) => { e.stopPropagation(); onClear(); }} style={{ fontSize: 22, color: "#b0b5ba", padding: 6 }}>×</span>}
        </button>
      </div>
      <p className={`t-cap1 ${s.muted}`} style={{ marginTop: -6 }}>{hint}</p>
    </>
  );
}

export function VProfile() {
  const go = useGo();
  const me = useCurrent();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [bad, setBad] = useState<string>("");
  useEffect(() => { if (me) api<{ profile: Profile }>(`/v1/venue/${me.venue.id}/profile`).then((r) => setP(r.profile)).catch(() => null); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = (x: Partial<Profile>) => setP((v) => (v ? { ...v, ...x } : v));
  async function pick(kind: "logo" | "cover" | "gallery") {
    if (!me) return;
    const f = await pickImage(); if (!f) return;
    setBusy(kind); setBad("");
    try {
      const url = await uploadImage(me.venue.id, f, kind === "gallery" ? "offer" : kind);
      if (kind === "logo") up({ logoUrl: url }); else if (kind === "cover") up({ coverUrl: url }); else setP((v) => (v ? { ...v, gallery: [...v.gallery, url].slice(0, 9) } : v));
      haptic.success();
    } catch (e) { setBad(kind); haptic.error(); if (err(e) === "too_large") nativeAlert("Сурет 5 МБ-тан үлкен."); }
    finally { setBusy(""); }
  }
  const save = useCallback(async () => {
    if (!me || !p) return;
    try { await api(`/v1/venue/${me.venue.id}/profile`, { method: "PUT", body: JSON.stringify({ about: p.about, logoUrl: p.logoUrl, coverUrl: p.coverUrl, gallery: p.gallery, tags: p.tags }) }); haptic.success(); await loadStaff(); go(-1, "back"); }
    catch { haptic.error(); nativeAlert("Сақталмады."); }
  }, [me, p, go]);
  if (!me || !p) return <VPage title="Мекеме профилі" back><Sk h={90} /><Sk h={90} /></VPage>;
  if (me.role !== "owner") return <VPage title="Мекеме профилі" back><Note>Профильді тек мекеме иесі өзгерте алады.</Note></VPage>;
  return (
    <VPage title="Мекеме профилі" back>
      <ImageRow label="Мұқаба" url={p.coverUrl} hint="4:3, кемінде 1200 px. Ауыстыру үшін ұяшықты бас" busy={busy === "cover"} error={bad === "cover"} onPick={() => void pick("cover")} onClear={() => up({ coverUrl: null })} />
      <ImageRow label="Логотип" url={p.logoUrl} round hint="Шаршы, кемінде 512×512. Клиенттерге дөңгелек болып көрінеді" busy={busy === "logo"} error={bad === "logo"} onPick={() => void pick("logo")} onClear={() => up({ logoUrl: null })} />
      <label className={s.card} style={{ padding: "10px 16px", display: "block" }}>
        <span className={`t-cap1 ${s.muted}`}>Сипаттама</span>
        <textarea rows={2} maxLength={300} value={p.about} onChange={(e) => up({ about: e.target.value })} placeholder="Үй донері, лаваш, фирмалық соустар"
          style={{ display: "block", width: "100%", border: 0, outline: 0, resize: "none", background: "none", font: "inherit", fontSize: 17, lineHeight: "22px", paddingTop: 4, color: "var(--text-strong)" }} />
      </label>
      <h2 className={s.blueHead}>Санат</h2>
      <div className={s.chips} style={{ flexWrap: "wrap" }}>
        {TAGS[me.venue.kind].map((t) => { const on = p.tags.includes(t); return <button key={t} className={`${s.chip} ${on ? s.chipOn : ""}`} onClick={() => { haptic.select(); up({ tags: on ? p.tags.filter((x) => x !== t) : [...p.tags, t].slice(0, 6) }); }}>{t}</button>; })}
      </div>
      <h2 className={s.blueHead}>Фото галерея</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {p.gallery.map((g, i) => (
          <button key={g} onClick={() => up({ gallery: p.gallery.filter((_, k) => k !== i) })} style={{ aspectRatio: "1", borderRadius: 14, overflow: "hidden", position: "relative" }}>
            <img src={g} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><span style={{ position: "absolute", right: 4, top: 2, color: "#fff", fontSize: 18, textShadow: "0 1px 3px #0008" }}>×</span>
          </button>
        ))}
        {p.gallery.length < 9 && <button onClick={() => void pick("gallery")} style={{ aspectRatio: "1", borderRadius: 14, border: "1.5px dashed #229af0", color: "var(--link)", fontSize: 26 }}>{busy === "gallery" ? "…" : "+"}</button>}
      </div>
      <Buttons main={{ text: "Сақтау", onClick: () => void save(), disabled: Boolean(busy) }} second={{ text: "Бас тарту", onClick: () => go(-1, "back") }} />
    </VPage>
  );
}

export function VSettings() {
  const go = useGo();
  const me = useCurrent();
  const [p, setP] = useState<Prefs | null>(null);
  const [lang, setLang] = useState<"kk" | "ru">("kk");
  useEffect(() => { if (me) { delete prefsCache[me.venue.id]; void venuePrefs(me.venue.id).then(setP); } api<{ user: { lang: "kk" | "ru" } }>("/v1/me").then((r) => setLang(r.user.lang)).catch(() => null); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = async (k: keyof Prefs, v: boolean) => {
    if (!me || !p) return;
    if (k === "pin" && v && !hasPin()) { go("/profile/pin/create", "up"); return; } // алдымен PIN орнату
    const n = { ...p, [k]: v }; setP(n); prefsCache[me.venue.id] = n;
    await api(`/v1/venue/${me.venue.id}/prefs`, { method: "PUT", body: JSON.stringify(n) }).catch(() => haptic.error());
  };
  const setL = async (l: "kk" | "ru") => { haptic.select(); setLang(l); setSettings({ lang: l }); await api("/v1/me", { method: "PATCH", body: JSON.stringify({ lang: l }) }).catch(() => null); };
  // Хабар Medeo ботына келеді (backend/src/notify.ts). Шағымдар әрқашан келеді (24 сағат ішінде жауап міндетті), сондықтан ауыстырғышы жоқ.
  const owner = me?.role === "owner";
  const rows: [keyof Prefs, string][] = ([["newOrder", "Жаңа тапсырыс"], ["newReview", "Жаңа пікір"], ["daily", "Күндік қорытынды (22:00)"], ["paymentSent", "Төлем жіберілді"], ["orderFailed", "Тапсырыс жетпеді"], ["offerEnding", "Ұсыныс мерзімі аяқталуда"]] as [keyof Prefs, string][])
    .filter(([k]) => owner || k === "newOrder" || (me?.role === "manager" && k === "newReview"));
  const [bot, setBot] = useState(botCanWrite());
  const allowBot = async () => { haptic.medium(); const ok = await askWriteAccess(); if (ok) { haptic.success(); setBot(true); } else openChat(BOT_APP_LINK.split("/").pop() ?? "Mmedeo_bot"); };
  return (
    <VPage title="Баптаулар" back>
      <h2 className={s.blueHead}>Хабарландырулар</h2>
      {bot === false && <div className="infoBox infoWarn" style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="t-sub2" style={{ flex: 1 }}>Хабарлама алу үшін Medeo ботына рұқсат беріңіз</span><button className={s.link} onClick={() => void allowBot()}>Рұқсат беру</button></div>}
      <div className={s.card}>{p ? rows.map(([k, t]) => <div key={k} className={s.row} style={{ ["--inset" as string]: "16px", minHeight: 52 }}><span className={s.rowText}><span className={s.rowTitle}>{t}</span></span><Switch on={p[k]} onChange={(v) => void set(k, v)} /></div>) : <div className={s.row}><Sk h={30} /></div>}</div>
      <h2 className={s.blueHead}>Тіл</h2>
      <div className={s.seg}><button className={`${s.segBtn} ${lang === "kk" ? s.segOn : ""}`} onClick={() => void setL("kk")}>Қазақша</button><button className={`${s.segBtn} ${lang === "ru" ? s.segOn : ""}`} onClick={() => void setL("ru")}>Русский</button></div>
      <h2 className={s.blueHead}>Қауіпсіздік</h2>
      <div className={s.card}><div className={s.row}><Tile e="v:pin" size={36} /><span className={s.rowText}><span className={s.rowTitle}>PIN-код</span><span className={s.rowSub}>Кассир режимін ашу үшін</span></span>{p && <Switch on={p.pin} onChange={(v) => void set("pin", v)} />}</div></div>
      <div className={s.card}><button className={s.row} style={{ ["--inset" as string]: "16px" }} onClick={() => go("/", "fade")}><span className={s.rowText}><span className={s.rowTitle}>Жүйеден шығу</span><span className={s.rowSub}>Клиент режиміне оралу</span></span></button></div>
      <Note>Хабарландырулар Medeo ботына келеді. Жаңа шағым туралы хабар әрқашан жіберіледі — оған 24 сағат ішінде жауап беру керек.</Note>
    </VPage>
  );
}

export function VSupport() {
  const go = useGo();
  return (
    <VPage title="Қолдау" back>
      <div className={s.result} style={{ marginTop: 2 }}>
        <VSticker name="headset" size={110} />
        <h1 className={s.resultTitle} style={{ fontSize: 22 }}>Көмек керек пе?</h1>
        <p className={s.stateText}>Қолдау мекеме иелеріне күн сайын 09:00–21:00</p>
      </div>
      <div className={s.card}>
        <button className={s.row} onClick={() => openChat(SUPPORT_BOT)}><Tile e="v:support" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Қолдауға жазу</span><span className={s.rowSub}>Telegram, жауап 10 минутта</span></span><i className={s.arrow} /></button>
        <button className={s.row} onClick={() => go("/profile/faq")}><Tile e="v:guide" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Жиі қойылатын сұрақтар</span></span><i className={s.arrow} /></button>
        <button className={s.row} onClick={() => go("/v/history")}><Tile e="v:complaint" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Төлем туралы шағым</span><span className={s.rowSub}>Чекті таңдап, жаз</span></span><i className={s.arrow} /></button>
      </div>
      <Note>Төлем шағымында чекті таңдасаң, біз бірден банк деректерін көреміз.</Note>
    </VPage>
  );
}

export function VGuide() {
  const me = useCurrent();
  const [qr, setQr] = useState("");
  const app = BOT_APP_LINK;
  useEffect(() => { void QRCode.toString(app, { type: "svg", margin: 0, color: { dark: "#111a26", light: "#0000" } }).then(setQr); }, [app]);
  const pdf = me ? `${API_URL}/files/guide/${me.venue.id}.pdf` : "";
  const download = useCallback(async () => { if (!pdf) return; const r = await downloadFile(pdf, "Medeo-kassa.pdf"); if (r === null) saveFile(pdf, "Medeo-kassa.pdf"); }, [pdf]);
  const steps = ["Клиент «Medeo бойынша» дейді", "Пакетті таңда, QR шығар", "Клиент сканерлейді, төлем өтті", "Қосымша тауарды бөлек төлет (қолма-қол / басқа банк)"];
  return (
    <VPage title="Кассаға нұсқау" back>
      <VSticker name="reader" size={78} at={[298, 125]} />
      <div className={s.card} style={{ padding: 18 }}>
        <h1 className={s.h1} style={{ fontSize: 24, lineHeight: "30px", maxWidth: 220 }}>Medeo бойынша төлем</h1>
        <p className={s.muted} style={{ marginTop: 2 }}>Кассир үшін 3 қадам</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {steps.map((t, i) => <span key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 17, lineHeight: "22px" }}><i style={{ flex: "none", width: 26, height: 26, borderRadius: 13, background: "#229af0", color: "#fff", display: "grid", placeItems: "center", fontStyle: "normal", fontWeight: 700, fontSize: 14 }}>{i < 3 ? i + 1 : "+"}</i>{t}</span>)}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 16 }}>
          <span style={{ width: 96, height: 96 }} dangerouslySetInnerHTML={{ __html: qr }} />
          <span className={`t-cap1 ${s.muted}`}>Клиент қолданбаны осы QR-мен жүктей алады</span>
        </div>
      </div>
      <Buttons main={{ text: "PDF жүктеу", onClick: () => void download() }} second={{ text: "Басып шығару", onClick: () => (pdf ? openExternal(pdf) : undefined) }} />
    </VPage>
  );
}
