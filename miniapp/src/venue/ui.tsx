// Мекеме бөлімінің ортақ бөлшектері: бет қаңқасы, төменгі мәзір (Figma «Қалқымалы навигация»), екі батырма,
// ескерту блогы, төменгі парақ, ұсыныс суреті, адам аватары.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGo } from "../nav";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Emo } from "../ui/Emo";
import { Sticker, type StickerName } from "../ui/Sticker";
import type { OfferKind } from "../mocks/offers";
import { useCurrent, type Role } from "./api";
import { NewOrderBanner, SysScreen, useSys } from "./States";
import homeIcon from "../assets/icons/navHome.svg";
import qrIcon from "../assets/icons/navQr.svg";
import packsIcon from "../assets/icons/navPacks.svg";
import reportIcon from "../assets/icons/navReport.svg";
import historyIcon from "../assets/icons/navHistory.svg";
import nav from "../ui/NavBar.module.css";
import s from "./V.module.css";

/** Бет режимі: page — толық бет; col — десктоптағы тізім бағаны; panel — десктоптағы оң жақ панель (Jazl+ Басқару, Figma «22 · Кең экран») */
export const PageMode = createContext<"page" | "col" | "panel">("page");

/** Бет: Telegram жүйелік батырмалары (браузерде), тақырып, мазмұн. back — «Артқа» (әйтпесе «Жабу» → клиент бөлімі). */
export function VPage({ title, back, children, tab, className, nav }: { title?: string; back?: boolean; children: ReactNode; tab?: VTab; className?: string; nav?: boolean }) {
  const go = useGo();
  const onBack = useCallback(() => (back ? go(-1, "back") : go("/profile", "fade")), [back, go]);
  const mode = useContext(PageMode);
  useBackButton(onBack, Boolean(back) && mode === "page");
  const [sys, retry] = useSys();
  if (mode !== "page") return <div className={mode === "col" ? s.deskCol : s.deskPanel}>{title && <h1 className={mode === "col" ? s.h1 : s.deskPanelTitle}>{title}</h1>}{children}</div>;
  if (sys) return <SysScreen sys={sys} retry={retry} />; // Figma 13: желі жоқ, сессия аяқталды, техникалық жұмыстар
  return (
    <div className={`${s.page} ${title ? s.sub : ""} ${tab || nav ? "" : s.navless} ${className ?? ""}`}>
      <TelegramChrome mode={back ? "back" : "close"} onBack={onBack} />
      {title && <h1 className={s.pageTitle}>{title}</h1>}
      {children}
      {tab && <NewOrderBanner />}
    </div>
  );
}

export type VTab = "home" | "cashier" | "offers" | "report" | "history";
const ownerTabs = [
  { key: "home", label: "Басты", icon: homeIcon, to: "/v/home" }, // «/v» емес: ол VGate арқылы қайта бағыттайды (жыпылықтау)
  { key: "cashier", label: "Кассир", icon: qrIcon, to: "/v/cashier" },
  { key: "offers", label: "Ұсыныстар", icon: packsIcon, to: "/v/offers" },
  { key: "report", label: "Есеп", icon: reportIcon, to: "/v/report" },
] as const;
const managerTabs = [ownerTabs[0], ownerTabs[1], ownerTabs[2], { key: "history", label: "Тарих", icon: historyIcon, to: "/v/history" }] as const;
const cashierTabs = [{ key: "cashier", label: "Кассир", icon: qrIcon, to: "/v/cashier" }, { key: "history", label: "Тарих", icon: historyIcon, to: "/v/history" }] as const;
export const tabsOf = (role: Role) => (role === "owner" ? ownerTabs : role === "manager" ? managerTabs : cashierTabs);

/** Мекеме мәзірі бет ауысқанда қайта салынбайды (Shell-де бір рет, клиент мәзірі сияқты): тамшы табтан табқа сырғиды.
 *  Қай бетте көрінетіні — жолдан: VPage-ке берілетін tab-пен бірдей. */
export function vTabOf(path: string, role: Role | undefined): VTab | undefined {
  if (path === "/v/home") return "home";
  if (path === "/v/cashier") return "cashier";
  if (path === "/v/offers" || (/^\/v\/offers\/[^/]+$/.test(path) && !/\/(new|review)$/.test(path))) return "offers";
  if (path === "/v/report") return "report";
  if (path === "/v/history" && role && role !== "owner") return "history";
  return undefined;
}
export function VNavHost({ path }: { path: string }) {
  const me = useCurrent();
  const [sys] = useSys();
  const t = vTabOf(path, me?.role);
  const tab = t && me && tabsOf(me.role).some((x) => x.key === t) ? t : undefined;
  return tab && !sys ? <VNav active={tab} /> : null;
}

/** Figma «Басты (иесі)» / «Кассир: басты (кассир рөлі)» төменгі мәзірі: клиент мәзірімен бір әйнек стилі, таб саны рөлге қарай. */
export function VNav({ active }: { active: VTab }) {
  const go = useGo();
  const me = useCurrent();
  const tabs = tabsOf(me?.role ?? "cashier");
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
            <span className={nav.iconBox}><span className={`${nav.icon} ${on ? nav.iconActive : ""}`} style={{ maskImage: `url(${JSON.stringify(t.icon)})`, WebkitMaskImage: `url(${JSON.stringify(t.icon)})` }} /></span>
            <span className={`${nav.label} ${on ? nav.labelActive : ""}`}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export interface Btn { text: string; onClick: () => void; disabled?: boolean; shine?: boolean; danger?: boolean }
/** Төменгі батырмалар: Telegram-да нативті MainButton (оң) + SecondaryButton (сол), браузерде Figma-дағы жолақ. */
export function Buttons({ main, second, enabled = true }: { main: Btn; second?: Btn; enabled?: boolean }) {
  const m = useMemo(() => ({ text: main.text, onClick: main.onClick, disabled: main.disabled, shine: main.shine }), [main.text, main.onClick, main.disabled, main.shine]);
  const sc = useMemo(() => (second ? { text: second.text, onClick: second.onClick, position: "left" as const } : undefined), [second?.text, second?.onClick]); // eslint-disable-line react-hooks/exhaustive-deps
  useBottomButtons(m, sc, enabled);
  if (inTelegram || !enabled) return null;
  return (
    <div className={s.btnBar}>
      {second && <button className={`${s.btn} ${s.btnSoft}`} onClick={second.onClick}>{second.text}</button>}
      <button className={`${s.btn} ${main.danger ? s.btnRed : ""}`} disabled={main.disabled} onClick={main.onClick}>{main.text}</button>
    </div>
  );
}

/** Ескерту блогы — клиент бөліміндегі жалпы стиль (base.css .infoBox): дәйексөз белгісі мен сол жақ сызығы жоқ (Патша, 2026-11-17). */
export function Note({ children, tone }: { children: ReactNode; tone?: "warn" | "ok" }) {
  return <p className={`t-sub2 infoBox ${tone === "warn" ? "infoWarn" : tone === "ok" ? "infoOk" : ""}`} style={{ textAlign: "left" }}>{children}</p>;
}

// Стикерлер — Figma-дағы «Стикер орны (duck TGS)» бойынша: түрі, орны (x, y — 412×917 кадрдағы), өлшемі дәл сол. Барлығы анимациялы (Lottie).
export type VStickerName = StickerName;
export function VSticker({ name, size, at }: { name: VStickerName; size: number; at?: [number, number] }) {
  const pos = at ? { position: "absolute" as const, left: `calc(50% - 206px + ${at[0]}px)`, top: `calc(${at[1]}px + var(--top-shift))`, zIndex: 2 } : undefined;
  return (
    <span className={s.vstk} style={{ width: size, height: size, ...pos }} aria-hidden>
      <Sticker name={name} size={size} />
    </span>
  );
}

/** Төменгі парақ (Figma: «Рөлдер мен рұқсаттар», «Соңғы қолдануды қайтару», «Қосымша тауар бағасы») */
export function Sheet({ title, children, onClose, grab = true }: { title?: string; children: ReactNode; onClose: () => void; grab?: boolean }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => { haptic.soft(); setClosing(true); setTimeout(onClose, 200); }, [onClose]);
  useBackButton(close);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  return (
    <div className={`${s.sheetRoot} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet} role="dialog">
        {grab && <span className={s.grab} />}
        {title && <h2 className={s.sheetTitle}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export const OfferPic = ({ kind, size = 28 }: { kind: OfferKind; size?: number }) => <Emo kind={kind} size={size} />;

const tones = ["#ff9500", "#8e7cf3", "#31d158", "#2aabee", "#ff6482", "#4378ff"];
export function Person({ name, photo, online, size = 40 }: { name: string; photo?: string | null; online?: boolean; size?: number }) {
  const c = tones[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % tones.length];
  return (
    <span className={s.person} style={{ width: size, height: size, background: c, fontSize: size * 0.42 }}>
      {photo ? <img src={photo} alt="" /> : name.slice(0, 1).toUpperCase()}
      {online && <i className={s.dotOnline} />}
    </span>
  );
}

/** Жүктелу қаңқасы */
export const Sk = ({ w = "100%", h = 16 }: { w?: number | string; h?: number }) => <span className={s.sk} style={{ width: w, height: h }} />;
