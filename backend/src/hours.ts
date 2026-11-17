// Филиалдың жұмыс уақыты (Figma «07 · Филиалдар»). Барлық есеп Алматы уақытымен.
// Тәртібі: уақытша жабық → мереке/ерекше күн → 24/7 → апта күні. Жұмыс уақытынан тыс QR төлем қабылданбайды.
// Ескі сид пішімі {daily:[open,close]} тек ақпарат үшін: шектеу мекеме кестені редакторда сақтағаннан кейін ғана қосылады.
export interface Day { on: boolean; open: string; close: string }
export interface Holiday { name: string; from: string; to: string; closed: boolean; open?: string; close?: string }
export interface BranchTime { hours: unknown; is247: boolean; closedUntil: Date | null; closedReason?: string | null; holidays: unknown }

const tz = "Asia/Almaty";
const parts = (d: Date) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d);
  const g = (t: string) => f.find((x) => x.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, min: Number(g("hour")) * 60 + Number(g("minute")), dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(g("weekday")) };
};
const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
export const weekOf = (hours: unknown): Day[] | null => {
  const h = hours as { days?: Day[] } | null;
  return Array.isArray(h?.days) && h!.days.length === 7 ? h!.days : null;
};
/** Уақыт аралығына кіре ме (жабылу ашылудан ерте не тең болса — түн ортасынан асады) */
const inRange = (min: number, open: string, close: string) => { const a = m(open), b = m(close); return b > a ? min >= a && min < b : min >= a || min < b; };

export function branchStatus(b: BranchTime, now = new Date()): { open: boolean; kind: "open" | "temp" | "holiday" | "247" | "closed" | "unknown"; until: string | null; reason?: string | null } {
  const p = parts(now);
  if (b.closedUntil && b.closedUntil.getTime() > now.getTime()) {
    const u = parts(b.closedUntil);
    return { open: false, kind: "temp", until: (u.date === p.date ? "" : u.date + " ") + `${String(Math.floor(u.min / 60)).padStart(2, "0")}:${String(u.min % 60).padStart(2, "0")}`, reason: b.closedReason };
  }
  const hol = ((b.holidays as Holiday[] | null) ?? []).find((x) => x.from <= p.date && p.date <= x.to);
  if (hol) {
    if (hol.closed || !hol.open || !hol.close) return { open: false, kind: "holiday", until: null, reason: hol.name };
    return { open: inRange(p.min, hol.open, hol.close), kind: "holiday", until: hol.close, reason: hol.name };
  }
  if (b.is247) return { open: true, kind: "247", until: null };
  const week = weekOf(b.hours);
  if (!week) return { open: true, kind: "unknown", until: null };
  const d = week[p.dow];
  // Кеше басталып түннен асқан ауысым әлі жүріп жатыр ма
  const y = week[(p.dow + 6) % 7];
  if (y.on && m(y.close) <= m(y.open) && p.min < m(y.close)) return { open: true, kind: "open", until: y.close };
  if (d.on && inRange(p.min, d.open, d.close) && !(m(d.close) <= m(d.open) && p.min < m(d.close))) return { open: true, kind: "open", until: d.close };
  return { open: false, kind: "closed", until: d.on && p.min < m(d.open) ? d.open : null };
}
