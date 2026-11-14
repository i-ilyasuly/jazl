import { useLocation } from "react-router-dom";
import { NavBar } from "../ui/NavBar";
import { TelegramChrome } from "../ui/TelegramChrome";

const names: Record<string, "scan" | "packs" | "profile"> = { "/scan": "scan", "/packs": "packs", "/profile": "profile" };

export function Stub() {
  const { pathname } = useLocation();
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
      <TelegramChrome mode="close" />
      <p className="t-sub2 rise" style={{ color: "var(--text-secondary)" }}>Бұл бет келесі кезеңде жасалады.</p>
      <NavBar active={names[pathname] ?? "home"} />
    </div>
  );
}
