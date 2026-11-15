// Қалқымалы навигация. Telegram Mini App-та нативті таб-жолақ API жоқ (құжатта тек
// Main/Secondary/Back/Settings батырмалары бар), сондықтан жолақты өзіміз саламыз:
// әйнек (glass) фон, сырғитын «тамшы», басқанда ойнайтын белгіше анимациясы.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { haptic, kv, tg } from "../telegram";
import { useGo } from "../nav";
import { useUnread } from "../store";
import homeIcon from "../assets/icons/navHome.svg";
import qrIcon from "../assets/icons/navQr.svg";
import packsIcon from "../assets/icons/navPacks.svg";
import s from "./NavBar.module.css";

const tabs = [
  { key: "home", label: "Басты", icon: homeIcon, to: "/" },
  { key: "scan", label: "Сканер", icon: qrIcon, to: "/scan" },
  { key: "packs", label: "Пакеттерім", icon: packsIcon, to: "/packs" },
  { key: "profile", label: "Профиль", icon: "", to: "/profile" },
] as const;
export type TabKey = (typeof tabs)[number]["key"];

// Алғаш ашқандағы көрсеткіштер (Figma «10»: «Сканерді алғаш ашу көрсеткіші» 13918:8108, «Пакеттерім табы» 13930:8285,
// «Профиль табы» 13930:8422). Басты бетте бір рет, кезекпен көрсетіледі. Демо: ?tips=1
const tips = [
  { tab: 1, left: 11, text: "Кассада төлеу үшін осы батырманы бас: кассирдің QR-ын сканерле" },
  { tab: 2, left: 107, text: "Пакеттерің мен қалған бірліктер осында" },
  { tab: 3, left: 119, text: "Үнем, төлем тәсілдері және сақталған бірліктер осында" },
];

export function NavBar({ active }: { active: TabKey }) {
  const go = useGo();
  const unread = useUnread() > 0;
  const user = tg?.initDataUnsafe?.user;
  const idx = tabs.findIndex((t) => t.key === active);
  const pill = useRef<HTMLDivElement>(null);
  const prev = useRef(idx);
  const first = useRef(true);
  // «Сұйық» эффект: тамшы жылжығанда созылып, орнына жеткенде серпіледі
  useLayoutEffect(() => {
    if (prev.current === idx) return;
    const d = Math.abs(idx - prev.current);
    prev.current = idx;
    pill.current?.animate(
      [{ scale: "1 1" }, { scale: `${1 + 0.16 * d} 0.86`, offset: 0.4 }, { scale: "0.96 1.04", offset: 0.75 }, { scale: "1 1" }],
      { duration: 420, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" },
    );
  }, [idx]);
  useEffect(() => { first.current = false; }, []);
  const [tip, setTip] = useState(-1);
  useEffect(() => {
    if (/[?&]tips=1/.test(window.location.hash)) { setTip(0); return; }
    let live = true;
    void kv.get("jazl_nav_hints").then((v) => { if (live && !v) setTip(0); });
    return () => { live = false; };
  }, []);
  const nextTip = () => { haptic.tap(); if (tip + 1 < tips.length) setTip(tip + 1); else { setTip(-1); kv.set("jazl_nav_hints", "1"); } };
  const shown = active === "home" && tip >= 0 ? tips[tip] : null;
  return (
    <nav className={s.nav}>
      <div ref={pill} className={s.activeBg} style={{ translate: `${idx * 93}px 0` }} />
      {tabs.map((t, i) => {
        const on = t.key === active;
        return (
          <button key={t.key} className={s.tab} style={{ left: 3 + i * 93 }} onClick={() => { if (!on) { haptic.select(); go(t.to, "fade"); } }}>
            <span className={`${s.iconBox} ${on && !first.current ? s["play_" + t.key] : ""}`}>
              {t.key === "profile" ? (
                <span className={s.avatar}>
                  {user?.photo_url ? <img src={user.photo_url} alt="" /> : <span>{(user?.first_name ?? "Сіз").slice(0, 1)}</span>}
                </span>
              ) : (
                <span className={`${s.icon} ${on ? s.iconActive : ""}`} style={{ maskImage: `url(${JSON.stringify(t.icon)})`, WebkitMaskImage: `url(${JSON.stringify(t.icon)})` }} />
              )}
            </span>
            <span className={`${s.label} ${on ? s.labelActive : ""}`}>{t.label}</span>
          </button>
        );
      })}
      {unread && <span className={s.unread} />}
      {shown && (
        <div key={tip} className={s.tip} role="note" style={{ left: shown.left, ["--caret" as string]: `${50 + shown.tab * 93 - shown.left - 6}px` }}>
          <p>{shown.text}</p>
          <button onClick={nextTip}>Түсінікті</button>
        </div>
      )}
    </nav>
  );
}
