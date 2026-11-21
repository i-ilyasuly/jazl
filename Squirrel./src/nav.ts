// Беттер арасындағы ауысу анимациясы: View Transitions API.
// Алға өткенде жаңа бет оңнан кіреді, артқа қайтқанда кері бағытта.
import { useCallback } from "react";
import { useNavigate, type NavigateOptions } from "react-router-dom";
import { haptic } from "./telegram";

export type Dir = "forward" | "back" | "fade" | "up";

export function setDir(dir: Dir) {
  document.documentElement.dataset.dir = dir;
}
// Артқа қайту (браузер/жүйе тарихы арқылы да) — әрқашан «артқа» бағытымен (Патша, 2026-11-21: бет «ортасына секіріп» кететін)
if (typeof window !== "undefined") addEventListener("popstate", () => setDir("back"));

export function useGo() {
  const navigate = useNavigate();
  return useCallback(
    (to: string | number, dir: Dir = "forward", opts: NavigateOptions = {}) => {
      haptic.tap();
      setDir(dir);
      if (typeof to === "number") navigate(to);
      else navigate(to, { viewTransition: true, ...opts });
    },
    [navigate],
  );
}

// ШЕШІМ (Патша, «бір басамын — ештеңе болмайды»): бет ауысу анимациясы жүріп тұрғанда (~0.35 с) Chrome барлық басуды
// <html>-ге жібереді, яғни басу жоғалады. Ауысу кезінде басылса — анимацияны бірден аяқтап, басуды сол нүктедегі элементке береміз.
if (typeof document !== "undefined" && document.startViewTransition) {
  const start = document.startViewTransition.bind(document);
  let active: ViewTransition | null = null;
  let tap: { x: number; y: number } | null = null;
  document.startViewTransition = ((arg?: unknown) => {
    const vt = start(arg as never);
    active = vt;
    const clear = () => { if (active === vt) active = null; };
    vt.finished.then(clear, clear);
    vt.ready.catch(() => {}); // келесі ауысу алдыңғысын тоқтатса — қалыпты жағдай, қате емес
    return vt;
  }) as typeof document.startViewTransition;
  const root = document.documentElement;
  addEventListener("pointerdown", (e) => {
    if (!active || e.target !== root) return;
    tap = { x: e.clientX, y: e.clientY };
    active.skipTransition();
  }, true);
  addEventListener("click", (e) => {
    if (!tap || e.target !== root) return;
    const { x, y } = tap;
    tap = null;
    const done = active?.finished ?? Promise.resolve();
    void done.catch(() => {}).then(() => requestAnimationFrame(() => {
      const el = document.elementFromPoint(x, y);
      if (el && el !== root && el instanceof HTMLElement) el.click();
      else if (el instanceof SVGElement) (el.closest("button,a") as HTMLElement | null)?.click();
    }));
  }, true);
}
