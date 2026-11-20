// iPhone: экранның сол жақ шетінен оңға сипау — «артқа» (Патша, 2026-11-16: «айфонда свайп артқа қайтуы жұмыс істемей тұр»).
// Telegram iOS мини аппқа өз шеттен-сипау қимылын бермейді, сондықтан қимылды өзіміз танимыз:
// саусақ шеттен (24px) басталып, көлденең жүрсе — сол жақта «‹» көпіршігі саусақпен бірге шығады;
// жеткілікті тартылса (≥ 96px не жылдам сілтеу) — беттің өз «артқа» әрекеті (BackButton) шақырылып, бет оңға сырғып жабылады.
// Android-та жүйенің өз «артқа» қимылы бар (Telegram оны BackButton-ға береді), сондықтан тек iOS пен браузерде қосулы.
import { useEffect } from "react";
import { backHandlers, haptic, inTelegram, isIOS } from "../telegram";
import { setDir } from "../nav";
import s from "./EdgeBack.module.css";

const ROOTS = ["/", "/packs", "/profile", "/welcome"];

export function EdgeBack() {
  useEffect(() => {
    if (inTelegram && !isIOS) return;
    const bubble = document.createElement("div");
    bubble.className = s.bubble; bubble.innerHTML = `<i class="${s.chev}"></i>`;
    document.body.appendChild(bubble);
    let st: { x: number; y: number; t: number; on: boolean | null; armed: boolean } | null = null;
    const path = () => (window.location.hash.slice(1).split("?")[0] || "/");
    const can = () => backHandlers.length > 0 || !ROOTS.includes(path());
    const show = (dx: number) => {
      const p = Math.min(1, dx / 96);
      bubble.style.opacity = String(Math.min(1, dx / 40));
      bubble.style.transform = `translate(${Math.min(dx * 0.45, 52) - 44}px, -50%) scale(${0.7 + 0.3 * p})`;
      bubble.classList.toggle(s.ready, p >= 1);
    };
    const hide = () => { bubble.style.opacity = "0"; bubble.style.transform = "translate(-44px, -50%) scale(0.7)"; bubble.classList.remove(s.ready); };
    const start = (e: TouchEvent) => {
      const p = e.touches[0];
      st = p.clientX <= 24 && e.touches.length === 1 && can() ? { x: p.clientX, y: p.clientY, t: Date.now(), on: null, armed: false } : null;
      if (st) bubble.style.top = p.clientY + "px";
    };
    const move = (e: TouchEvent) => {
      if (!st) return;
      const p = e.touches[0]; const dx = p.clientX - st.x, dy = p.clientY - st.y;
      if (st.on === null && Math.abs(dx) + Math.abs(dy) > 8) { st.on = dx > 0 && dx > Math.abs(dy) * 1.2; if (!st.on) { st = null; return; } }
      if (!st.on) return;
      if (e.cancelable) e.preventDefault();
      show(Math.max(0, dx));
      const armed = dx >= 96;
      if (armed !== st.armed) { st.armed = armed; if (armed) haptic.select(); }
    };
    const end = (e: TouchEvent) => {
      const cur = st; st = null; if (!cur?.on) return;
      const dx = (e.changedTouches[0]?.clientX ?? cur.x) - cur.x; const fast = dx > 40 && Date.now() - cur.t < 220;
      hide();
      if (dx < 96 && !fast) return;
      const h = backHandlers[backHandlers.length - 1];
      if (h) h(); else { setDir("back"); window.history.back(); }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end); window.removeEventListener("touchcancel", end); bubble.remove();
    };
  }, []);
  return null;
}
