// UI Kit: Timeline (Horizontal) / Android. Нүкте 10, сызық 3, аралық 8.
// Түстер (Патша, 2026-11-21): қолданылған сұр, қалған көк, мерзімі жақын қалдық сары.
// Реті (Патша, 2026-11-21): стандартты прогресс сияқты — қалғаны СОЛ жақта, қолданылғаны оң жақта.
// Бірлік қолданылған сайын көк бөлік оңнан солға қарай қысқарады.
import s from "./Timeline.module.css";

export function Timeline({ total, used = 0, warn = false, width = 340 }: { total: number; used?: number; warn?: boolean; width?: number }) {
  const left = total - used;
  const tone = (i: number) => (i >= left ? s.used : warn ? s.warn : "");
  return (
    <div className={s.row} style={{ width }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`${s.el} ${i === total - 1 ? s.last : ""} ${tone(i)}`} style={{ ["--i" as string]: i }}>
          <span className={s.dot} />
          {i < total - 1 && <span className={`${s.line} ${tone(i + 1)}`} />}
        </div>
      ))}
    </div>
  );
}
