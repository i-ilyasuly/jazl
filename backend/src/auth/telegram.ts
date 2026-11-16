// Telegram Mini App initData тексеру (ресми алгоритм: core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// ШЕШІМ (Тұран, 2026-11-16): ескі боттағы API tg_id-ді сұраудан алатын — кез келген адам біреудің атынан әрекет ете алатын.
// Енді әр сұрау «Authorization: tma <initData>» тақырыбымен келеді және қолтаңбасы бот токенімен тексеріледі.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TgUser { id: number; first_name: string; last_name?: string; username?: string; language_code?: string; photo_url?: string; is_premium?: boolean }
export type InitDataResult = { ok: true; user: TgUser; authDate: number; startParam?: string } | { ok: false; reason: "missing" | "bad_hash" | "expired" | "no_user" };

export function validateInitData(raw: string, botToken: string, ttlSec: number, now = Math.floor(Date.now() / 1000)): InitDataResult {
  if (!raw) return { ok: false, reason: "missing" };
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "bad_hash" };
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest();
  let given: Buffer;
  try { given = Buffer.from(hash, "hex"); } catch { return { ok: false, reason: "bad_hash" }; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_hash" };
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || now - authDate > ttlSec) return { ok: false, reason: "expired" };
  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "no_user" };
  let user: TgUser;
  try { user = JSON.parse(userRaw) as TgUser; } catch { return { ok: false, reason: "no_user" }; }
  if (!user?.id) return { ok: false, reason: "no_user" };
  return { ok: true, user, authDate, startParam: params.get("start_param") ?? undefined };
}

/** Тесттер мен жергілікті әзірлеу үшін: берілген токенмен қол қойылған initData жасайды. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheck).digest("hex"));
  return params.toString();
}
