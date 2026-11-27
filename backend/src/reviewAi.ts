// Пікірлердің Gemini тексерісі (Патша, 2026-11-27): сайттағы «Пікірді тек сатып алғандар қалдырады» блогына тек «оң әрі таза»
// (Gemini Decision 1: ok, сенімділік ≥ 0,8), 4–5 жұлдыз, мәтіні бар пікір шығады. Мини апптағы ұсыныс бетінде пікірлер бұрынғыдай
// бәрі көрінеді — бұл сүзгі тек сайтқа (жарнамалық бетке) арналған.
// Тексеріс фонда: баға жазылған соң «түрткі» + жоспарлы жұмыс (/cron/tick) қате кеткендерін қайталайды (ең көбі 5 рет).
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { aiEnabled, moderateReview } from "./ai.js";

export const SITE_MIN_CONFIDENCE = 0.8;
const MAX_ATTEMPTS = 5;

/** Тексеруге тұрған пікірлер: мәтіні жоқ не 1–3 жұлдыз — «skip» (сайтқа бәрібір шықпайды, Gemini-ге жіберілмейді) */
export async function moderatePending(db: Db, cfg: Config, fetchFn: typeof fetch = fetch, limit = 10) {
  await db.execute(sql`update app.ratings set ai_status = 'skip' where ai_status = 'pending' and (stars < 4 or char_length(btrim(coalesce(text, ''))) < 10)`);
  if (!aiEnabled(cfg)) return { checked: 0, off: true };
  const rows = (await db.execute(sql`update app.ratings r set ai_attempts = r.ai_attempts + 1 from (
      select id from app.ratings where ai_status in ('pending', 'error') and ai_attempts < ${MAX_ATTEMPTS} order by created_at limit ${limit} for update skip locked) c
    where r.id = c.id returning r.id, r.stars, r.text`)).rows as { id: string; stars: number; text: string }[];
  let checked = 0;
  for (const r of rows) {
    try {
      const v = await moderateReview(cfg, { stars: r.stars, text: r.text }, fetchFn);
      await db.execute(sql`update app.ratings set ai_status = ${v.verdict}, ai_confidence = ${v.confidence}, ai_checked_at = now() where id = ${r.id}`);
      checked++;
    } catch (e) {
      await db.execute(sql`update app.ratings set ai_status = 'error', ai_checked_at = now() where id = ${r.id}`);
      console.error("review ai", r.id, (e as Error).message);
    }
  }
  return { checked, off: false };
}

/** Баға жазылған соң: жауапты күттірмейді */
export function kickReviewAi(db: Db, cfg: Config) {
  void moderatePending(db, cfg).catch((e) => console.error("review ai kick", (e as Error).message));
}
