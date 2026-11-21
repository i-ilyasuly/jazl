// UI Kit: Timeline (Horizontal) / Android. Нүкте 10, сызық 3, аралық 8.
// Пайда болу бағыты (Патша, 2026-11-21): оңнан солға қарай — соңғы нүктеден басталады.
// Түстер (Патша, 2026-11-21): қолданылған сұр, қалған көк, мерзімі жақын қалдық сары.
import s from "./Timeline.module.css";

export function Timeline({ total, used = 0, warn = false, width = 340 }: { total: number; used?: number; warn?: boolean; width?: number }) {
  return (
    <div className={s.row} style={{ width }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`${s.el} ${i === total - 1 ? s.last : ""} ${i < used ? s.used : warn ? s.warn : ""}`} style={{ ["--r" as string]: total - 1 - i }}>
          <span className={s.dot} />
          {i < total - 1 && <span className={s.line} />}
        </div>
      ))}
    </div>
  );
}
