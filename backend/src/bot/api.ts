// Telegram Bot API шақыру (токен журналға ешқашан жазылмайды). Бот — @Mmedeo_bot: хабарламалармен бірдей ереже (MINIAPP_BOT_TOKEN, жоқ болса BOT_TOKEN).
import { createHmac } from "node:crypto";
import type { Config } from "../config.js";

export const botToken = (cfg: Config) => cfg.MINIAPP_BOT_TOKEN || cfg.BOT_TOKEN;
/** Вебхук құпиясы (X-Telegram-Bot-Api-Secret-Token): токеннен шығарылады, бөлек сақтаудың қажеті жоқ */
export const webhookSecret = (cfg: Config) => createHmac("sha256", botToken(cfg)).update("medeo-bot-webhook").digest("hex").slice(0, 48);

export type TgCall = (method: string, body?: unknown) => Promise<{ ok: boolean; result?: unknown; description?: string; error_code?: number }>;
export function tgApi(cfg: Config, f: typeof fetch = fetch): TgCall {
  const base = `https://api.telegram.org/bot${botToken(cfg)}/`;
  return async (method, body) => {
    try {
      const r = await f(base + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(8000) });
      return (await r.json()) as { ok: boolean; result?: unknown; description?: string };
    } catch (e) { return { ok: false, description: (e as Error).message }; }
  };
}
