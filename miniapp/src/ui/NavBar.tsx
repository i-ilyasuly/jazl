// Қалқымалы навигация. Telegram Mini App-та нативті таб-жолақ API жоқ (құжатта тек
// Main/Secondary/Back/Settings батырмалары бар), сондықтан жолақты өзіміз саламыз:
// әйнек (glass) фон, сырғитын «тамшы», басқанда ойнайтын белгіше анимациясы.
import { useEffect, useLayoutEffect, useRef } from "react";
import { tg } from "../telegram";
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
  return (
    <nav className={s.nav}>
      <div ref={pill} className={s.activeBg} style={{ translate: `${idx * 93}px 0` }} />
      {tabs.map((t, i) => {
        const on = t.key === active;
        return (
          <button key={t.key} className={s.tab} style={{ left: 3 + i * 93 }} onClick={() => { if (!on) go(t.to, "fade"); }}>
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
    </nav>
  );
}
