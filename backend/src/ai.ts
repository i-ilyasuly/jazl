// Gemini Decision 1 (Google, 2026-11): мәтін жазбайды — берілген нұсқаларға ықтималдық береді. Бізде: ұсыныстың санатын ұсыну.
// REST: POST https://generativelanguage.googleapis.com/v1beta/decisions, тақырып x-goog-api-key (google-genai SDK 3.6, _gaos/decisions.py).
// Кілт — GEMINI_API_KEY (Secret Manager: medeo-gemini-api-key). Жоқ болса мүмкіндік өшірулі.
import type { Config } from "./config.js";
import { CATEGORIES, type Category, type Kind } from "./categories.js";

const URL = "https://generativelanguage.googleapis.com/v1beta/decisions";
export const aiEnabled = (cfg: Config) => Boolean(cfg.GEMINI_API_KEY);

export class AiError extends Error { constructor(public code: "ai_off" | "ai_error" | "ai_timeout") { super(code); } }

type ChoiceAnswer = { type: "choice"; choice: string; confidence: number; probabilities?: Record<string, number> };

/** Ұсыныстың санатын ұсыну: ең ықтимал 3 нұсқа (ықтималдығымен). Мекеменің өз тексі ғана жіберіледі — клиент деректері емес. */
export async function suggestCategory(cfg: Config, kind: Kind, offer: { title: string; packName?: string; composition?: string; about?: string },
  fetchFn: typeof fetch = fetch): Promise<{ best: Category; confidence: number; top: { category: Category; p: number }[] }> {
  if (!cfg.GEMINI_API_KEY) throw new AiError("ai_off");
  const list = CATEGORIES[kind];
  const criteria = Object.fromEntries(list.map((c) => [c.id, `${c.ru} (${c.kk}): ${c.hint}`]));
  const input = JSON.stringify({ business: kind, product: offer.title, package_name: offer.packName || undefined, composition: offer.composition || undefined, description: offer.about?.slice(0, 300) || undefined });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  let res: Response;
  try {
    res = await fetchFn(URL, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.GEMINI_API_KEY },
      body: JSON.stringify({ model: "gemini-decision-1", input, questions: { category: { type: "choice", instructions: "Which menu category does this prepaid package belong to? The text may be in Kazakh or Russian.", criteria } } }) });
  } catch (e) { throw new AiError((e as Error).name === "AbortError" ? "ai_timeout" : "ai_error"); } finally { clearTimeout(t); }
  if (!res.ok) { console.error("gemini decisions", res.status, (await res.text().catch(() => "")).slice(0, 300)); throw new AiError("ai_error"); }
  const a = ((await res.json()) as { answers?: Record<string, ChoiceAnswer> }).answers?.category;
  const best = a && list.find((c) => c.id === a.choice);
  if (!a || !best) throw new AiError("ai_error");
  const probs = a.probabilities ?? { [a.choice]: a.confidence };
  const top = Object.entries(probs).map(([id, p]) => ({ category: list.find((c) => c.id === id), p })).filter((x): x is { category: Category; p: number } => Boolean(x.category))
    .sort((x, y) => y.p - x.p).slice(0, 3);
  return { best, confidence: a.confidence, top };
}

/** Пікірді сайтқа жариялауға бола ма (Патша, 2026-11-27; 28-құжат «оң әрі таза, сенімділік ≥ 0,8»).
 *  Тек пікір мәтіні мен жұлдыз саны жіберіледі — клиенттің аты, телефоны, ID-і жіберілмейді. */
export type ReviewVerdict = "ok" | "negative" | "unsafe";
export async function moderateReview(cfg: Config, review: { stars: number; text: string }, fetchFn: typeof fetch = fetch): Promise<{ verdict: ReviewVerdict; confidence: number }> {
  if (!cfg.GEMINI_API_KEY) throw new AiError("ai_off");
  const criteria: Record<ReviewVerdict, string> = {
    ok: "Positive or mostly positive about the venue, its food, drinks or service; polite; a small remark is fine. Suitable to publish on the website.",
    negative: "Mainly a complaint, criticism, disappointment or mixed review where the negative part dominates.",
    unsafe: "Contains profanity, insults, threats, discrimination, personal data (phone, address, full name of staff), links, advertising, spam, gibberish or text unrelated to the venue.",
  };
  const input = JSON.stringify({ stars: review.stars, review: review.text.slice(0, 500) });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  let res: Response;
  try {
    res = await fetchFn(URL, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.GEMINI_API_KEY },
      body: JSON.stringify({ model: "gemini-decision-1", input, questions: { verdict: { type: "choice", instructions: "A customer left this review of a cafe, restaurant or barbershop in a prepaid-package app. The text may be in Kazakh or Russian. Can it be shown on the public website as a positive, clean testimonial?", criteria } } }) });
  } catch (e) { throw new AiError((e as Error).name === "AbortError" ? "ai_timeout" : "ai_error"); } finally { clearTimeout(t); }
  if (!res.ok) { console.error("gemini review", res.status, (await res.text().catch(() => "")).slice(0, 300)); throw new AiError("ai_error"); }
  const a = ((await res.json()) as { answers?: Record<string, ChoiceAnswer> }).answers?.verdict;
  if (!a || !(a.choice in criteria)) throw new AiError("ai_error");
  return { verdict: a.choice as ReviewVerdict, confidence: a.confidence };
}
