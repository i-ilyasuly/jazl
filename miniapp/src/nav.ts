// Беттер арасындағы ауысу анимациясы: View Transitions API.
// Алға өткенде жаңа бет оңнан кіреді, артқа қайтқанда кері бағытта.
import { useCallback } from "react";
import { useNavigate, type NavigateOptions } from "react-router-dom";
import { haptic } from "./telegram";

export type Dir = "forward" | "back" | "fade" | "up";

export function setDir(dir: Dir) {
  document.documentElement.dataset.dir = dir;
}

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
