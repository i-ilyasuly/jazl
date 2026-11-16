// Табтарды саусақпен көлденең сырғытып ауыстыру (Патша, 2026-11-16: «барлық табтар скролл арқылы ауыссын»).
// Пакеттерімдегі тәсілмен бірдей: көлденең қозғалыс анықталса, мазмұн саусақпен бірге жылжиды, 64px не жылдам сілтеу — келесі/алдыңғы таб.
// Сол жақ шеттен (24px) басталған сипау — iOS «артқа» қимылына қалдырылады.
import { useRef, useState, type TouchEvent } from "react";

export function useTabSwipe(tab: number, count: number, pick: (i: number) => void) {
  const [drag, setDrag] = useState(0);
  const st = useRef<{ x: number; y: number; t: number; h: boolean | null } | null>(null);
  const onTouchStart = (e: TouchEvent) => { const p = e.touches[0]; st.current = p.clientX < 24 ? null : { x: p.clientX, y: p.clientY, t: Date.now(), h: null }; };
  const onTouchMove = (e: TouchEvent) => {
    const s = st.current; if (!s) return; const p = e.touches[0]; const dx = p.clientX - s.x, dy = p.clientY - s.y;
    if (s.h === null && Math.abs(dx) + Math.abs(dy) > 10) s.h = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (s.h) setDrag(Math.max(-140, Math.min(140, (tab === 0 && dx > 0) || (tab === count - 1 && dx < 0) ? dx * 0.25 : dx)));
  };
  const onTouchEnd = () => {
    const s = st.current; st.current = null; if (!s?.h) { setDrag(0); return; }
    const fast = Math.abs(drag) > 24 && Date.now() - s.t < 250;
    if ((drag < -64 || (fast && drag < 0)) && tab < count - 1) pick(tab + 1);
    else if ((drag > 64 || (fast && drag > 0)) && tab > 0) pick(tab - 1);
    setDrag(0);
  };
  const style = drag ? { transform: `translateX(${drag}px)`, transition: "none" } : { transition: "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)" };
  return { drag, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }, style };
}
