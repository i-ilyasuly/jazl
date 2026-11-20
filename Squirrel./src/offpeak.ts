// Бос сағат жеңілдігі (Патша, 2026-11-18; сервер: backend/src/offpeak.ts): мекеме бос уақытын қосымша жеңілдікпен сатады.
// Тек «Тек жоспар бойынша» ұсыныста — клиент келу уақытын терезеден таңдайды.
/** days: 1 — дүйсенбі … 7 — жексенбі; from/to — «10:00»; pct — қосымша жеңілдік, % */
export interface OffPeak { days: number[]; from: string; to: string; pct: number }
export const WEEK_SHORT = ["ДС", "СС", "СР", "БС", "ЖМ", "СБ", "ЖС"];
/** «ДС–ЖМ 10:00–12:00» (қатар күндер — сызықшамен, әйтпесе үтірмен) */
export const winLabel = (w: Pick<OffPeak, "days" | "from" | "to">) => {
  const d = [...w.days].sort((a, b) => a - b);
  const run = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const days = d.length === 7 ? "Күн сайын" : run ? `${WEEK_SHORT[d[0] - 1]}–${WEEK_SHORT[d[d.length - 1] - 1]}` : d.map((x) => WEEK_SHORT[x - 1]).join(", ");
  return `${days} ${w.from}–${w.to}`;
};
/** Сервермен бірдей: pct% шегеріледі, 10 ₸-ге дөңгелектенеді */
export const offPeakPrice = (price: number, pct: number) => Math.round((price * (100 - pct)) / 100 / 10) * 10;
