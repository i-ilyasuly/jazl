import { tg } from "../telegram";
import { useGo } from "../nav";
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

export function NavBar({ active, unread = true }: { active: (typeof tabs)[number]["key"]; unread?: boolean }) {
  const go = useGo();
  const user = tg?.initDataUnsafe?.user;
  const idx = tabs.findIndex((t) => t.key === active);
  return (
    <nav className={s.nav}>
      <div className={s.activeBg} style={{ transform: `translateX(${idx * 93}px)` }} />
      {tabs.map((t, i) => (
        <button key={t.key} className={s.tab} style={{ left: 3 + i * 93 }} onClick={() => { if (t.key !== active) go(t.to, "fade"); }}>
          <span className={s.iconBox}>
            {t.key === "profile" ? (
              <span className={s.avatar}>
                {user?.photo_url ? <img src={user.photo_url} alt="" /> : <span>{(user?.first_name ?? "Сіз").slice(0, 1)}</span>}
              </span>
            ) : (
              <img src={t.icon} width={24} height={24} alt="" className={t.key === active ? s.iconActive : s.icon} />
            )}
          </span>
          <span className={`${s.label} ${t.key === active ? s.labelActive : ""}`}>{t.label}</span>
        </button>
      ))}
      {unread && <span className={s.unread} />}
    </nav>
  );
}
