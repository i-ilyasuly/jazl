// Figma «22 · Кең экран (десктоп)» (14068:9930): Jazl+ Басқару тек веб арқылы ашылады (Патша, 2026-11-17) — компьютерде
// сол жақта мәзір (240), жоғарыда ортақ іздеу мен қоңырау, ортада тізім, оң жақта таңдалған жазбаның панелі.
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, inTelegram } from "../telegram";
import { PageMode, VSticker } from "../venue/ui";
import { useCached } from "../venue/api";
import { A, logout } from "./api";
import type { Attention } from "./Pulse";
import v from "../venue/V.module.css";
import s from "./A.module.css";

const Q = "(min-width: 1024px)";
/** Кең экран: Telegram-нан тыс, ені ≥ 1024 */
export function useDesk() {
  const [d, setD] = useState(() => !inTelegram && typeof matchMedia !== "undefined" && matchMedia(Q).matches);
  useEffect(() => { const m = matchMedia(Q); const f = () => setD(!inTelegram && m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return d;
}

/** Тізім + оң жақ панель. detail жоқ болса — «таңдаңыз» */
export function Split({ list, detail, empty = "Тізімнен біреуін таңдаңыз" }: { list: ReactNode; detail?: ReactNode; empty?: string }) {
  return (
    <div className={s.split}>
      <PageMode.Provider value="col">{list}</PageMode.Provider>
      <div className={s.splitSide}>
        {detail ? <PageMode.Provider value="panel">{detail}</PageMode.Provider>
          : <div className={v.deskPanel} style={{ alignItems: "center", textAlign: "center", padding: "48px 24px" }}><VSticker name="search" size={96} /><p className={v.stateText}>{empty}</p></div>}
      </div>
    </div>
  );
}

const items: { t: string; to: string; g: string; m: string[]; b?: string }[] = [
  { t: "Пульс", to: "/a/pulse", g: "activity", m: ["/a/pulse", "/a/attention"] },
  { t: "Мекемелер", to: "/a/venues", g: "store", m: ["/a/venues", "/a/apps"], b: "apps" },
  { t: "Ұсыныстар", to: "/a/offers", g: "tag", m: ["/a/offers"], b: "offers" },
  { t: "Пакеттер", to: "/a/packs", g: "package", m: ["/a/packs"] },
  { t: "Ақша", to: "/a/money", g: "wallet", m: ["/a/money"] },
  { t: "Шағымдар", to: "/a/complaints", g: "message", m: ["/a/complaints"], b: "complaints" },
  { t: "Хабарламалар", to: "/a/notifications", g: "bell", m: ["/a/notifications"] },
  { t: "Баптаулар", to: "/a/more", g: "sun", m: ["/a/more", "/a/rules", "/a/log"] },
];
const glyphs = import.meta.glob("../assets/glyphs/*.svg", { eager: true, import: "default" }) as Record<string, string>;

/** Сол жақ мәзір + жоғарғы іздеу (Figma 14068:9931) */
export function DeskShell({ path }: { path: string }) {
  const go = useGo();
  const [a] = useCached<{ attention: Attention }>("a:attention", () => A("/attention"));
  const [q, setQ] = useState(useLocation().search.match(/q=([^&]*)/)?.[1] ?? "");
  const badge = { apps: a?.attention.apps ?? 0, offers: (a?.attention.offers_new ?? 0) + (a?.attention.offers_changed ?? 0), complaints: a?.attention.complaints ?? 0 } as Record<string, number>;
  const name = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name ?? (() => { try { return localStorage.getItem("jazl_adm_name") ?? "Иесі"; } catch { return "Иесі"; } })();
  const search = () => { const x = q.trim(); if (!x) return; go(/^(jz-?)?\d{4,}$/i.test(x) ? `/a/packs?q=${encodeURIComponent(x)}` : `/a/venues?q=${encodeURIComponent(x)}`); };
  if (path === "/a" || path.startsWith("/a/pin")) return null;
  return (
    <>
      <aside className={s.side}>
        <div className={s.logo}>Jazl+ <span>Басқару</span></div>
        {items.map((it) => {
          const on = it.m.some((m) => path === m || path.startsWith(m + "/"));
          const n = it.b ? badge[it.b] : 0;
          return (
            <button key={it.to} className={`${s.sideItem} ${on ? s.sideOn : ""}`} onClick={() => { haptic.select(); go(it.to, "fade"); }}>
              <i style={{ maskImage: `url("${glyphs[`../assets/glyphs/${it.g}.svg`]}")`, WebkitMaskImage: `url("${glyphs[`../assets/glyphs/${it.g}.svg`]}")` }} />
              <span>{it.t}</span>
              {n > 0 && <b className={`${s.badge} ${it.b === "complaints" ? s.badgeRed : ""}`}>{n}</b>}
            </button>
          );
        })}
        <div className={s.sideUser}>
          <span className={s.sideAvatar}>{name.slice(0, 1)}</span>
          <span style={{ flex: 1, minWidth: 0 }}><b>{name}</b><small>Иесі</small></span>
          <button aria-label="Шығу" title="Шығу" onClick={() => { logout(); window.location.hash = "#/a"; window.location.reload(); }}>🔒</button>
        </div>
      </aside>
      <div className={s.topbar}>
        <label className={s.search} style={{ width: 280 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Іздеу: мекеме, клиент, пакет ID" />
        </label>
        <button className={s.bell} aria-label="Хабарламалар" onClick={() => go("/a/notifications")}>
          <i style={{ maskImage: `url("${glyphs["../assets/glyphs/bell.svg"]}")`, WebkitMaskImage: `url("${glyphs["../assets/glyphs/bell.svg"]}")` }} />
          {badge.complaints > 0 && <span />}
        </button>
      </div>
    </>
  );
}
