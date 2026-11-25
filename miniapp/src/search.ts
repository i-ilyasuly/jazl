// Іздеу (Патша, 2026-11-25, 1-кезең): пакет атауы (мекеменің бренді, мыс. «Тойымды»), тауар атауы, санат, құрам, мекеме —
// екі тілде де. Қазақ әріптері мен регистр бірдейленеді («қ»→«к», «ә»→«а»…), сондықтан «тойымды», «ТОЙЫМДЫ» бірдей табылады.
// Нәтиже маңыздылық бойынша: атау дәл сәйкес → атау сөзі басталады → тауар/санат → құрам → мекеме.
// Бір сұрауда бірнеше сөз болса — әр сөз әйтеуір бір өрісте табылуы керек («суши алматы» → екеуі де).
import type { Offer } from "./mocks/offers";
import { kk } from "./i18n";
// kk(…) — құрастыру кезінде аударылмайтын мәтін (іздеу кілттері екі тілде бірдей болуы керек)

// Әріп → әріп (ұзындық сақталады — ерекшелеу үшін түпнұсқадағы орын дәл табылады)
const MAP: Record<string, string> = Object.fromEntries(kk("әа қк ғг ңн өо ұу үу һх іи ёе йи").split(" ").map((p) => [p[0], p[1]]));
export function norm(s: string) {
  let out = "";
  for (const ch of s.toLowerCase()) { const m = MAP[ch] ?? ch; out += /[\p{L}\p{N}]/u.test(m) ? m : " "; }
  return out;
}
const words = (q: string) => norm(q).split(" ").filter(Boolean);

/** Іздеу өрістері (екі тілде, каталогтан). Үлгі деректерде жоқ болса — карточкадағы мәтіндерден. */
export interface SearchIndex { name: string; title: string; cat: string; comp: string; venue: string }
// Тек жалпы сөздер: «тағам» деп іздегенде барлық тағам шығады, бірақ «суши» — тек сушиі барлар (бұрын «бургер» барлық тағамды шығаратын)
const KIND_WORDS: Record<string, string> = { food: kk("тағам тамақ еда"), coffee: kk("кофе кофехана coffee"), hair: kk("шаштараз шаш барбер стрижка парикмахерская") };
export const indexOf = (o: Offer): SearchIndex => o.idx ?? { name: o.packName ?? "", title: o.title, cat: KIND_WORDS[o.kind] ?? "", comp: o.composition ?? "", venue: o.venue };

// Өрістің салмағы: атау ең маңызды
const W = { name: 100, title: 50, cat: 35, comp: 15, venue: 25 } as const;
/** 0 — сәйкес емес; одан көп — соғұрлым маңызды */
export function score(o: Offer, q: string): number {
  const ws = words(q); if (!ws.length) return 0;
  const ix = indexOf(o);
  const f = { name: norm(ix.name), title: norm(ix.title), cat: norm(ix.cat + " " + (KIND_WORDS[o.kind] ?? "")), comp: norm(ix.comp), venue: norm(ix.venue) };
  let total = 0;
  for (const w of ws) {
    let best = 0;
    for (const k of Object.keys(W) as (keyof typeof W)[]) {
      const t = f[k]; if (!t.includes(w)) continue;
      const toks = t.split(" ").filter(Boolean);
      const exact = toks.includes(w), prefix = toks.some((x) => x.startsWith(w));
      best = Math.max(best, W[k] * (exact ? 1 : prefix ? 0.8 : 0.5));
    }
    if (!best) return 0; // сөздердің бірі ешқайда жоқ — сәйкес емес
    total += best;
  }
  // Бүкіл сұрау атаудың өзі болса («Тойымды») — ең жоғарыда
  const nq = ws.join(" "), nn = norm(ix.name).split(" ").filter(Boolean).join(" ");
  if (nn && nn === nq) total += 1000;
  return total;
}

/** Мәтіндегі сұрау сөздерін табу: [басы, соңы] жұптары (ерекшелеу үшін) */
export function hits(text: string, q: string): [number, number][] {
  const t = norm(text), out: [number, number][] = [];
  for (const w of words(q)) { if (w.length < 2) continue; let i = t.indexOf(w); while (i >= 0) { out.push([i, i + w.length]); i = t.indexOf(w, i + w.length); } }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push([...r]); }
  return merged;
}
