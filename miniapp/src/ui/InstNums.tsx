// Бөліп төлеу белгісінің мәтіні (Патша, 2026-11-24): «0 • 0 • 12» — нүкте символ емес, әріп өлшеміне сай салынған дөңгелек,
// сандардан тең қашықтықта. Ай саны — мекеме қосқан ең ұзақ мерзім.
import s from "./InstNums.module.css";

export function InstNums({ months }: { months?: number[] }) {
  if (!months?.length) return null;
  const max = Math.max(...months);
  return <span className={s.nums} aria-label={`Бөліп төлеу 0-0-${max}`}>0<i className={s.dot} aria-hidden />0<i className={s.dot} aria-hidden />{max}</span>;
}
