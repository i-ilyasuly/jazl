// Telegram Mini App initData тексеру (ресми алгоритм: core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// ШЕШІМ (Тұран, 2026-11-16): ескі боттағы API tg_id-ді сұраудан алатын — кез келген адам біреудің атынан әрекет ете алатын.
// Енді әр сұрау «Authorization: tma <initData>» тақырыбымен келеді және қолтаңбасы бот токенімен тексеріледі.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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

/** Telegram Login Widget (веб-сайтқа кіру, core.telegram.org/widgets/login#checking-authorization): кілт — SHA256(бот токені).
 *  Jazl+ Басқару тек веб арқылы ашылады (Патша, 2026-11-17) — сол үшін. */
export type LoginWidgetData = { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string; auth_date: number; hash: string };
export function validateLoginWidget(d: Record<string, unknown>, botToken: string, ttlSec: number, now = Math.floor(Date.now() / 1000)): { ok: true; user: TgUser; authDate: number } | { ok: false; reason: "bad_hash" | "expired" } {
  const hash = String(d.hash ?? "");
  const check = Object.keys(d).filter((k) => k !== "hash" && d[k] !== undefined && d[k] !== null).sort().map((k) => `${k}=${d[k]}`).join("\n");
  const expected = createHmac("sha256", createHash("sha256").update(botToken).digest()).update(check).digest();
  let given: Buffer;
  try { given = Buffer.from(hash, "hex"); } catch { return { ok: false, reason: "bad_hash" }; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_hash" };
  const authDate = Number(d.auth_date ?? 0);
  if (!authDate || now - authDate > ttlSec) return { ok: false, reason: "expired" };
  return { ok: true, authDate, user: { id: Number(d.id), first_name: String(d.first_name ?? ""), last_name: d.last_name as string | undefined, username: d.username as string | undefined, photo_url: d.photo_url as string | undefined } };
}
/** Тесттерге: Login Widget деректеріне қол қою */
export function signLoginWidget(fields: Record<string, string | number>, botToken: string) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  return { ...fields, hash: createHmac("sha256", createHash("sha256").update(botToken).digest()).update(check).digest("hex") };
}
