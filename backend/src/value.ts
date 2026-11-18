// Пакет құнын бірліктерге бөлу (Патша, 2026-11-18: «әдемілеп» — бірде-бір тиын жоғалмайды).
// Пакеттің толық құны V (value_total = төленген баға + көшірілген бірліктердің құны), бірлік саны T.
// k-шы бірліктің құны = ⌊V·k/T⌋ − ⌊V·(k−1)/T⌋. Барлық T бірліктің қосындысы дәл V — қалдық тиын өзінен-өзі соңғы бірліктерге түседі.
// Мысал: 10 000 ₸ / 3 → 3 333, 3 333, 3 334 (бұрын 3 333 × 3 = 9 999, 1 ₸ жоғалатын).
// Мысал (қайта алу): латте 900 ₸, 3 кесе қалды → жаңа 12 кесе 10 800 ₸ + 2 700 ₸ = 13 500 ₸ / 15 → әр кесе 900 ₸ (бұрын 720 ₸).
import { sql, type SQL } from "drizzle-orm";

/** Бірлік қолданылғанда: пакетте `left` бірлік тұрғанда `n` бірлік алынса, олардың құны */
export function takeValue(V: number, T: number, left: number, n: number): number {
  if (T <= 0 || n <= 0) return 0;
  const used = T - left;
  return Math.floor((V * (used + n)) / T) - Math.floor((V * used) / T);
}
/** Пакетте қалған бірліктердің құны (бонус, қайта алу, баланс) */
export function leftValue(V: number, T: number, left: number): number {
  if (T <= 0 || left <= 0) return 0;
  return V - Math.floor((V * (T - left)) / T);
}
/** Бір бірліктің көрсетілетін бағасы (чек, мекеме экраны): дөңгелектенген орташа */
export const unitPrice = (V: number, T: number) => (T > 0 ? Math.round(V / T) : 0);

/** SQL нұсқасы (жиынтық есептерге): p — пакеттің бүркеншік аты */
export const leftValueSql = (p = "p"): SQL =>
  sql.raw(`(${p}.value_total - floor(${p}.value_total::numeric * (${p}.units_total - ${p}.units_left) / greatest(${p}.units_total, 1)))::int`);
export const unitPriceSql = (p = "p"): SQL => sql.raw(`round(${p}.value_total::numeric / greatest(${p}.units_total, 1))::int`);
