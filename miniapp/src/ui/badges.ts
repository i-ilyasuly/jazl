// Карточка белгілері (Патша, 2026-11-21). Ақылы: 🔥 Ыстық, 🔝 ТОП (мекеме сатып алады).
// Жүйелік — тек нақты деректен: ⏳ аяқталуға жақын, ⚡ аз қалды, 🚀 хит, 🆕 жаңа, ⭐ жоғары рейтинг.
// Қанша шарт орындалса, сонша белгі көрсетіледі (шектеу жоқ). Рет — маңыздылығы бойынша.
import { offers, isEnded, type Offer } from "../mocks/offers";
import type { TgEmojiName } from "./TgEmoji";

export type Badge = { emo: TgEmojiName; label: string; paid?: boolean };

const H48 = 48 * 3600_000;
/** Рейтинг белгісінің ең төменгі шегі (Патша, 2026-11-28) */
export const STAR_MIN = 4.6;
/** Сатылым соңы (Алматы уақытымен сол күн қоса) — қалған мс */
const leftMs = (until: string) => Date.parse(until + "T23:59:59+05:00") - Date.now();

/** Санат бойынша ең көп сатылған 3 ұсыныс (кемінде 5 сатып алушы) */
function hits(kind: Offer["kind"]) {
  return new Set(offers.filter((o) => o.kind === kind && !isEnded(o.id) && o.buyers >= 5).sort((a, b) => b.buyers - a.buyers).slice(0, 3).map((o) => o.id));
}

// УАҚЫТША КӨРСЕТУ (Патша, 2026-11-21: «эмодзилерді карточкалардан көре алуым үшін»). Әр белгі кемінде бір карточкада
// шығуы үшін кейбір ұсыныстарға шарт «орындалған» деп белгіленеді. Пилот іске қосылмай тұрып DEMO = {} етіп өшіру керек.
const DEMO: Record<string, Badge["emo"][]> = {
  americano: ["hourglass", "new"], doner: ["zap"], cappuccino: ["new", "star"], latte: ["hourglass", "zap", "star"],
  "doner-drink": ["new"], "burger-combo": ["zap", "hourglass"], haircut: ["star", "new"], pizza: ["hourglass"],
};
const LABEL: Record<string, string> = { hourglass: "Аяқталуға жақын", zap: "Аз қалды", rocket: "Хит", new: "Жаңа", star: "Жоғары рейтинг" };

export function badgesOf(o: Offer): Badge[] {
  const out = realBadges(o);
  for (const e of DEMO[o.id] ?? []) if (!out.some((b) => b.emo === e) && (e !== "star" || o.rating >= STAR_MIN)) out.push({ emo: e, label: LABEL[e] });
  // Реті тұрақты: ақылылар, сосын маңыздылығы бойынша
  const order: Badge["emo"][] = ["fire", "top", "hourglass", "zap", "rocket", "new", "star"];
  return out.sort((a, b) => order.indexOf(a.emo) - order.indexOf(b.emo));
}

function realBadges(o: Offer): Badge[] {
  const out: Badge[] = [];
  if (o.promo === "hot") out.push({ emo: "fire", label: "Ыстық", paid: true });
  if (o.promo === "top") out.push({ emo: "top", label: "ТОП", paid: true });
  if (o.saleUntil) { const l = leftMs(o.saleUntil); if (l > 0 && l <= H48) out.push({ emo: "hourglass", label: "Аяқталуға жақын" }); }
  if (o.limit?.monthly != null && o.limit.left != null && o.limit.left > 0 && o.limit.left < 10) out.push({ emo: "zap", label: "Аз қалды" });
  if (hits(o.kind).has(o.id)) out.push({ emo: "rocket", label: "Хит" });
  if (o.createdAt && Date.now() - Date.parse(o.createdAt) < 7 * 86400_000) out.push({ emo: "new", label: "Жаңа" });
  // Патша (2026-11-28): рейтинг белгісі тек 4,6★ және одан жоғары болса; төмен болса — ештеңе көрсетілмейді
  if (o.rating >= STAR_MIN && o.ratingCount >= 20) out.push({ emo: "star", label: "Жоғары рейтинг" });
  return out;
}
