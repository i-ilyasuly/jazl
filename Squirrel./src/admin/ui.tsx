// Medeo Басқару: ортақ бөлшектер — төменгі мәзір (5 таб), PIN пернетақтасы, қауіпті әрекетті растау парағы, радио жолы, мәтін өрісі.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { Sheet } from "../venue/ui";
import { errOf, setToken } from "./api";
import { DeskShell, useDesk } from "./Desk";
import pulseIcon from "../assets/icons/navPulse.svg";
import storeIcon from "../assets/icons/navStore.svg";
import walletIcon from "../assets/icons/navWallet.svg";
import chatIcon from "../assets/icons/navChat.svg";
import moreIcon from "../assets/icons/navMore.svg";
import nav from "../ui/NavBar.module.css";
import v from "../venue/V.module.css";
import s from "./A.module.css";

export type ATab = "pulse" | "venues" | "money" | "complaints" | "more";
const tabs = [
  { key: "pulse", label: "Пульс", icon: pulseIcon, to: "/a/pulse" },
  { key: "venues", label: "Мекемелер", icon: storeIcon, to: "/a/venues" },
  { key: "money", label: "Ақша", icon: walletIcon, to: "/a/money" },
  { key: "complaints", label: "Шағымдар", icon: chatIcon, to: "/a/complaints" },
  { key: "more", label: "Тағы", icon: moreIcon, to: "/a/more" },
] as const;
export const aTabOf = (path: string): ATab | undefined => tabs.find((t) => t.to === path)?.key;

/** Figma «Пульс» төменгі мәзірі: 5 таб, клиент мәзірімен бір әйнек стилі; Shell-де бір рет салынады (тамшы сырғиды) */
export function ANav({ active, dot }: { active: ATab; dot?: boolean }) {
  const go = useGo();
  const w = 370 / tabs.length;
  const idx = Math.max(0, tabs.findIndex((t) => t.key === active));
  const pill = useRef<HTMLDivElement>(null);
  const prev = useRef(idx);
  useLayoutEffect(() => {
    if (prev.current === idx) return;
    prev.current = idx;
    pill.current?.animate([{ scale: "1 1" }, { scale: "1.16 0.86", offset: 0.4 }, { scale: "0.96 1.04", offset: 0.75 }, { scale: "1 1" }], { duration: 420, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" });
  }, [idx]);
  return (
    <nav className={nav.nav} style={{ touchAction: "auto" }}>
      <div ref={pill} className={nav.activeBg} style={{ width: w - 8, translate: `${idx * w}px 0` }} />
      {tabs.map((t, i) => {
        const on = t.key === active;
        return (
          <button key={t.key} className={nav.tab} style={{ left: 5 + i * w - 4, width: w }} onClick={() => { if (!on) { haptic.select(); go(t.to, "fade"); } }} aria-current={on ? "page" : undefined}>
            <span className={nav.iconBox} style={{ position: "relative" }}>
              <span className={`${nav.icon} ${on ? nav.iconActive : ""}`} style={{ maskImage: `url(${JSON.stringify(t.icon)})`, WebkitMaskImage: `url(${JSON.stringify(t.icon)})` }} />
              {t.key === "complaints" && dot && <i style={{ position: "absolute", top: 0, right: -2, width: 8, height: 8, borderRadius: 4, background: "#ff3a30" }} />}
            </span>
            <span className={`${nav.label} ${on ? nav.labelActive : ""}`} style={{ fontSize: 11 }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
let complaintDot = false;
export const setComplaintDot = (v: boolean) => { complaintDot = v; window.dispatchEvent(new Event("medeo:adot")); };
export function ANavHost({ path }: { path: string }) {
  const [, tick] = useState(0);
  const desk = useDesk();
  useEffect(() => { const f = () => tick((n) => n + 1); window.addEventListener("medeo:adot", f); return () => window.removeEventListener("medeo:adot", f); }, []);
  // Кең экранда — сол жақ мәзір (Figma 22); html[data-desk] бет стильдерін ауыстырады
  const on = desk && !path.startsWith("/a/pin");
  useEffect(() => { if (on) document.documentElement.dataset.desk = "1"; else delete document.documentElement.dataset.desk; return () => { delete document.documentElement.dataset.desk; }; }, [on]);
  if (desk) return <DeskShell path={path} />;
  const t = aTabOf(path);
  return t ? <ANav active={t} dot={complaintDot} /> : null;
}

/** PIN пернетақтасы (Figma «PIN енгізу»): 4 нүкте, дөңгелек пернелер. onDone — қате мәтінін (не null) қайтарады. */
export function PinPad({ onDone, disabled }: { onDone: (pin: string) => Promise<string | null>; disabled?: boolean }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (code.length < 4 || busy.current) return;
    busy.current = true;
    void onDone(code).then((e) => {
      busy.current = false;
      if (e) { haptic.error(); setErr(true); setTimeout(() => { setCode(""); setErr(false); }, 450); }
    });
  }, [code, onDone]);
  const press = (d: string) => { if (disabled || code.length >= 4) return; haptic.tap(); setCode(code + d); };
  const del = () => { if (code) { haptic.soft(); setCode(code.slice(0, -1)); } };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") del(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  return (
    <>
      <div className={`${s.pinDots} ${err ? v.shake : ""}`}>{[0, 1, 2, 3].map((i) => <i key={i} className={err ? s.err : i < code.length ? s.on : ""} />)}</div>
      <div className={s.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} className={s.padKey} onClick={() => press(d)}>{d}</button>)}
        <span />
        <button className={s.padKey} onClick={() => press("0")}>0</button>
        <button className={`${s.padKey} ${s.padGhost}`} onClick={del} aria-label="Өшіру">⌫</button>
      </div>
    </>
  );
}

/** Сервердің PIN қатесін адамға түсінікті мәтінге */
export function pinError(e: unknown): string {
  const b = errOf(e);
  if (b.error === "bad_pin") return `Қате PIN. ${b.left ?? 0} әрекет қалды`;
  if (b.error === "locked") return `PIN бұғатталды: ${b.until ? new Date(b.until).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "15 минут"}-ге дейін күтіңіз`;
  if (b.error === "admin_session") { setToken(""); return "Сеанс бітті"; }
  return "Сақталмады. Қайталап көріңіз";
}

/** Figma «Қауіпті әрекетті растау»: парақ ішінде PIN. run(pin) сәтті болса — жабылады. */
export function PinSheet({ text, run, onClose }: { text: string; run: (pin: string) => Promise<void>; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Sheet title="Әрекетті растаңыз" onClose={onClose}>
      <p className={s.pinText} style={{ textAlign: "left" }}>{`${text} PIN-кодты енгізіңіз.`}</p>
      {msg && <p className={`${s.pinText} ${s.pinErr}`} style={{ textAlign: "left", marginTop: 6 }}>{msg}</p>}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 12 }}>
        <PinPad onDone={async (pin) => { try { await run(pin); haptic.success(); onClose(); return null; } catch (e) { const m = pinError(e); setMsg(m); return m; } }} />
      </div>
    </Sheet>
  );
}

export function RadioRow({ on, title, sub, onClick }: { on: boolean; title: string; sub?: string; onClick: () => void }) {
  return (
    <button className={v.row} onClick={() => { haptic.select(); onClick(); }} style={{ ["--inset" as string]: "16px", minHeight: 52 }}>
      <span className={v.rowText}><span className={v.rowTitle} style={{ whiteSpace: "normal" }}>{title}</span>{sub && <span className={v.rowSub} style={{ whiteSpace: "normal" }}>{sub}</span>}</span>
      <i className={`${s.radio} ${on ? s.radioOn : ""}`} />
    </button>
  );
}

export function Field({ label, value, onChange, placeholder, rows = 1, max = 300 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; max?: number }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      <textarea rows={rows} maxLength={max} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export const Badge = ({ n, tone }: { n: number; tone?: "red" | "orange" }) => (n > 0 ? <span className={`${s.badge} ${tone === "red" ? s.badgeRed : tone === "orange" ? s.badgeOrange : ""}`}>{n}</span> : null);
export const Growth = ({ v: g, white }: { v: number | null | undefined; white?: boolean }) => (g === null || g === undefined ? null
  : white ? <span className={s.pillWhite}>{`${g >= 0 ? "▲" : "▼"} ${Math.abs(g)}% кешеден`}</span> : <span className={g >= 0 ? s.pillUp : s.pillDown}>{g >= 0 ? "▲" : "▼"} {Math.abs(g)}%</span>);
export const Empty = ({ children }: { children: ReactNode }) => <div className={v.card}><div className={v.row}><span className={v.rowSub} style={{ whiteSpace: "normal" }}>{children}</span></div></div>;
