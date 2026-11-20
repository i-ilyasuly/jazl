import { useCallback } from "react";
import { useGo } from "../nav";
import { useBackButton } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";

export function Stub() {
  const go = useGo();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  return (
    <div style={{ minHeight: "var(--app-h, 100vh)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
      <TelegramChrome mode="back" onBack={back} />
      <p className="t-sub2 rise" style={{ color: "var(--text-secondary)" }}>Бұл бет келесі кезеңде жасалады.</p>
    </div>
  );
}
