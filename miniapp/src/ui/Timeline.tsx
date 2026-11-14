// UI Kit: Timeline (Horizontal) / Android. Нүкте 10, сызық 3, аралық 8.
// Түстер: қалған көк, қолданылған жасыл.
import s from "./Timeline.module.css";

export function Timeline({ total, used = 0, width = 340 }: { total: number; used?: number; width?: number }) {
  return (
    <div className={s.row} style={{ width }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`${s.el} ${i === total - 1 ? s.last : ""} ${i < used ? s.used : ""}`} style={{ ["--i" as string]: i }}>
          <span className={s.dot} />
          {i < total - 1 && <span className={s.line} />}
        </div>
      ))}
    </div>
  );
}
