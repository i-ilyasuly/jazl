// Бос сағат жеңілдігі (Патша, 2026-11-18): мекеме бос уақытын (мысалы, сс–бс 10:00–12:00) қосымша жеңілдікпен сатады.
// Тек «Тек жоспар бойынша» ұсыныста: клиент келу уақытын алдын ала таңдайды, сондықтан уақытты тексеру оңай әрі әділ.
// Терезе пакетке сатып алған сәттегідей жазылады (packs.off_peak) — мекеме кейін өзгертсе де, алған клиенттің шарты өзгермейді.
import { z } from "zod";

export const OffPeak = z.object({
  /** Апта күндері: 1 — дүйсенбі … 7 — жексенбі */
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  to: z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/),
  /** Қосымша жеңілдік, % (пакет бағасынан) */
  pct: z.number().int().min(5).max(30),
}).strict().refine((x) => x.from < x.to, { message: "bad_window" });
export type OffPeakT = z.infer<typeof OffPeak>;

/** Бос сағаттағы баға: пакет бағасынан pct% шегеріледі, 10 ₸-ге дейін дөңгелектенеді */
export const offPeakPrice = (price: number, pct: number) => Math.round((price * (100 - pct)) / 100 / 10) * 10;

/** Уақыт терезенің ішінде ме (Алматы уақытымен) */
export function inOffPeak(w: Pick<OffPeakT, "days" | "from" | "to">, at: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1;
  const hm = `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`.replace(/^24/, "00");
  return w.days.includes(day) && hm >= w.from && hm < w.to;
}
