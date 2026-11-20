// Қолтаңба кілті (Қауіпсіздік аудиті, Алтай, 2026-11-21). Бұрын барлық қолтаңба (админ сеансы, касса QR-ы, чек/құжат сілтемесі,
// Halyk hash, сынақ вебхугы) бот токенімен қойылатын — бот токені тараса, бәрі бірге ашылатын. Енді: APP_SECRET (Secret Manager).
// Өтпелі кезең: LEGACY_SIG_UNTIL уақытына дейін ескі (бот токенімен) қолтаңбалар да қабылданады — қолдағы QR/сілтемелер бұзылмайды.
// APP_SECRET берілмесе — бұрынғыдай бот токені (жергілікті әзірлеу/тест).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "./config.js";

/** Жаңа қолтаңба қоятын кілт */
export const signKey = (cfg: Config) => cfg.APP_SECRET ?? cfg.BOT_TOKEN;
/** Тексеруде қабылданатын кілттер: жаңасы + (өтпелі кезеңде) ескісі */
export function verifyKeys(cfg: Config, now = Date.now()): string[] {
  if (!cfg.APP_SECRET) return [cfg.BOT_TOKEN];
  const until = cfg.LEGACY_SIG_UNTIL ? Date.parse(cfg.LEGACY_SIG_UNTIL) : NaN;
  return Number.isFinite(until) && now < until ? [cfg.APP_SECRET, cfg.BOT_TOKEN] : [cfg.APP_SECRET];
}
/** Уақыт бойынша ақпарат бермейтін салыстыру */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** HMAC-SHA256 hex, ұзындығы len */
export const hmac = (key: string, data: string, len = 32) => createHmac("sha256", key).update(data).digest("hex").slice(0, len);
/** Берілген қолтаңба кез келген қабылданатын кілтпен сәйкес пе */
export const sigOk = (cfg: Config, data: string, sig: string, len = 32) => verifyKeys(cfg).some((k) => safeEqual(hmac(k, data, len), sig));
