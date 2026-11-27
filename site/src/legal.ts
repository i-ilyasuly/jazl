// Заңды құжаттар (оферта, пайдалану шарттары, құпиялылық, қайтару, мекеме шарты) — мини апптағы мәтіннің ӨЗІ:
// miniapp/src/legal/texts.ts (қазақша) және miniapp/i18n/ru.json (орысша аударма, кілті — қазақша мәтін).
// Бір мәтін екі жерде көшірілмейді: құжат мини аппта өзгерсе, сайт келесі жариялауда өзі жаңарады.
// Сайтқа шығарда: заңгерге арналған ескертпелер (note) көрсетілмейді; «жоба» белгісі сақталады; [толтырылатын орындар] белгіленеді.
import { COMPANY, LEGAL, LEGAL_UPDATED, type LegalDoc } from "../../miniapp/src/legal/texts";
import RU_DICT from "../../miniapp/i18n/ru.json";

const dict = RU_DICT as Record<string, string>;
const re = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// {0}, {1} орындары бар кілттер (мини апп `...${x}...` мәтіндерін осылай сақтайды) → үлгі
// Орынға алдымен деректеме мәндері толық сәйкестендіріледі (мекенжайдың ішіндегі үтір сөйлемді қате бөлмеуі үшін)
const KNOWN = Object.values(COMPANY).sort((a, b) => b.length - a.length).map(re).join("|");
const templated = Object.keys(dict).filter((k) => /\{\d+\}/.test(k)).map((k) => {
  const order: number[] = [];
  const src = re(k).replace(/\\\{(\d+)\\\}/g, (_, n) => { order.push(Number(n)); return `(${KNOWN}|[\\s\\S]+?)`; });
  return { rx: new RegExp(`^${src}$`), order, ru: dict[k] };
});

// Мини апп деректемелеріндегі [толтырылатын орындар] — орыс мәтінінде орысша белгі
const BLANKS_RU: Record<string, string> = {
  "[Компанияның толық атауы]": "[Полное наименование компании]", "[БСН]": "[БИН]", "[Заңды мекенжай: қала, көше, үй, кеңсе]": "[Юридический адрес: город, улица, дом, офис]",
  "[Директордың аты-жөні]": "[ФИО директора]", "[ИИК / IBAN]": "[ИИК / IBAN]", "[БИК]": "[БИК]", "[support@…]": "[support@…]",
  "[+7 (7__) ___-__-__]": "[+7 (7__) ___-__-__]", "[ҚҚС төлеушісі ме: иә/жоқ]": "[Плательщик НДС: да/нет]",
};
const blanksRu = (s: string) => s.replace(/\[[^\]]{1,80}\]/g, (m) => BLANKS_RU[m] ?? m).replace(/\bЖШС\b/g, "ТОО");

/** Қазақша мәтіннің орысшасы (мини апп сөздігінен). Табылмаса — қазақшасы қалады (тексерісте санап шығамыз). */
export function toRu(kk: string): string {
  const s = kk.trim();
  if (dict[s]) return blanksRu(dict[s]);
  for (const t of templated) {
    const m = t.rx.exec(s);
    if (!m) continue;
    const vals: Record<number, string> = {};
    t.order.forEach((n, i) => { vals[n] = m[i + 1]; });
    return blanksRu(t.ru.replace(/\{(\d+)\}/g, (_, n) => toRu(vals[Number(n)] ?? "")));
  }
  return blanksRu(kk);
}

export type SiteLegal = { id: string; title: string; short: string; parts: { h: string; p: string[] }[] };
export const LEGAL_IDS = ["offer", "terms", "privacy", "refund", "venue"] as const;
export type LegalId = (typeof LEGAL_IDS)[number];

export function legalDocs(lang: "kk" | "ru"): SiteLegal[] {
  const tr = (s: string) => (lang === "ru" ? toRu(s) : s);
  return LEGAL_IDS.map((id) => LEGAL.find((d) => d.id === id)!).map((d: LegalDoc) => ({
    id: d.id, title: tr(d.title), short: tr(d.short),
    parts: d.parts.map((x) => ({ h: tr(x.h), p: x.p.map(tr) })),
  }));
}
export const legalUpdated = (lang: "kk" | "ru") => (lang === "ru" ? toRu(LEGAL_UPDATED) : LEGAL_UPDATED);

/** Аударылмай қалған жолдар (құрастыру кезінде ескерту үшін) */
export function untranslated(): string[] {
  const out: string[] = [];
  for (const d of legalDocs("ru")) for (const s of [d.title, d.short, ...d.parts.flatMap((x) => [x.h, ...x.p])]) if (/[әғқңөұүһі]/i.test(s)) out.push(s.slice(0, 80));
  return out;
}
