// Medeo тілі (Патша, 2026-11-18): қазақша (негізгі) және орысша. Бастапқы мәтін — қазақша, ол сөздік кілті.
// Барлық қазақша жолды құрастыру кезінде i18n/plugin.mjs __t/__tt шақыруына орайды; орыс сөздігі — ru.ts.
// Тіл қосымша ашылғанда бір рет анықталады (модуль деңгейіндегі тізімдер де дұрыс тілде болуы үшін), ауыстырғанда бет қайта жүктеледі.
export type Lang = "kk" | "ru";
export type LangPref = "tg" | "kk" | "ru";
const PREF_KEY = "medeo_lang";

let lang: Lang = "kk";
let dict: Record<string, string> = {};

const tgCode = () => { try { return (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? navigator.language ?? ""; } catch { return ""; } };
/** Telegram тілі орысша (ru, be, uk) болса — орыс, әйтпесе қазақ */
export const tgLang = (): Lang => (/^(ru|be|uk)/i.test(tgCode()) ? "ru" : "kk");
export const resolveLang = (p: LangPref): Lang => (p === "tg" ? tgLang() : p);
export const getPref = (): LangPref => { try { const v = localStorage.getItem(PREF_KEY); return v === "kk" || v === "ru" || v === "tg" ? v : "tg"; } catch { return "tg"; } };
export const getLang = () => lang;

/** Қосымша басталмас бұрын: тілді анықтап, орыс сөздігін жүктейді */
export async function initLang() {
  const q = /[?&#]lang=(kk|ru)\b/.exec(location.href)?.[1] as Lang | undefined; // сынақ: #/…?lang=ru
  lang = q ?? resolveLang(getPref());
  document.documentElement.lang = lang;
  if (lang === "ru") dict = (await import("./ru")).RU;
}
/** Тілді ауыстыру: баптау сақталады, бет қайта жүктеледі (барлық мәтін жаңа тілде қайта құрылады) */
export function applyLangPref(p: LangPref, reload = true) {
  try { localStorage.setItem(PREF_KEY, p); } catch { /* жеке терезе */ }
  if (reload && resolveLang(p) !== lang) setTimeout(() => location.reload(), 150);
}

export function __t(s: string): string { return lang === "ru" ? dict[s] ?? s : s; }
export function __tt(key: string, vals: unknown[]): string {
  const tpl = lang === "ru" ? dict[key] ?? key : key;
  // Орыс тіліндегі көпше түр: {0|день|дня|дней} — санға қарай сөз таңдалады (1 день, 2 дня, 5 дней)
  return tpl.replace(/\{(\d+)\|([^|}]*)\|([^|}]*)\|([^}]*)\}|\{(\d+)\}|\{\{|\}\}/g, (m, pi, one, few, many, i) => {
    if (pi !== undefined) return plural(Number(vals[Number(pi)]), one, few, many);
    return i !== undefined ? String(vals[Number(i)]) : m[0];
  });
}
/** Орыс тіліндегі көпше түр: 1 → one, 2–4 → few, 5–20 → many (21 → one, 22 → few…) */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}
// Серверден келетін ұсыныс атауының соңы («Тауық донері · 4 дана»): атауды мекеме өзі жазады (аударылмайды),
// ал «· 4 дана» бөлігін сервер қосады — оны орысшаға айналдырамыз: «· 4 шт.», «· 12 чашек»
const UNIT_RU: Record<string, [string, string, string]> = {
  дана: ["шт.", "шт.", "шт."], рет: ["раз", "раза", "раз"], кесе: ["чашка", "чашки", "чашек"], стақан: ["стакан", "стакана", "стаканов"], стакан: ["стакан", "стакана", "стаканов"],
  донер: ["донер", "донера", "донеров"], пицца: ["пицца", "пиццы", "пицц"], комбо: ["комбо", "комбо", "комбо"], бургер: ["бургер", "бургера", "бургеров"], қию: ["стрижка", "стрижки", "стрижек"], бірлік: ["ед.", "ед.", "ед."],
};
export const locUnit = (w: string, n = 1) => { if (lang !== "ru") return w; const f = UNIT_RU[w.toLowerCase()]; return f ? plural(n, ...f) : dict[w] ?? w; };
export const locTitle = (t: string) => (lang !== "ru" ? t : t.replace(/ · (\d+) (\S+)$/, (_m, n: string, w: string) => ` · ${n} ${locUnit(w, Number(n))}`));
/** Серверден келген мәтін (i18n/server.ts тізімі): сөздікте болса аударылады, «3 бірлік пайдаланылды» сияқты үлгілер де */
export function trs(s?: string | null): string {
  if (!s || lang !== "ru") return s ?? "";
  const m = /^(\d+) бірлік пайдаланылды$/.exec(s);
  if (m) return `Использовано ${m[1]} ед.`;
  return dict[s] ?? s;
}
/** Аударылмайтын мәтін (плагин орамайды) */
export const kk = (s: string) => s;
