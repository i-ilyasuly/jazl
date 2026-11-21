// Telegram анимациялық эмодзилері (Патша, 2026-11-21) — ресми жолмен: Bot API арқылы Telegram-ның өз
// «AnimatedEmojies» жиынтығынан (getStickerSet → getFile). Файлдар репоға салынбайды: сервер оларды Telegram-нан
// алып, мини апп жұмыс істеуі үшін ғана береді (Telegram шарттары: деректер тек қызметті іске қосуға қажетті көлемде).
// TGS = gzip-пен сығылған Lottie JSON → ашып, JSON ретінде береміз (мини аппта lottie ойнатқышы бар).
import { gunzipSync } from "node:zlib";
import { Hono } from "hono";
import type { Config } from "../config.js";
import { botToken, tgApi } from "../bot/api.js";

/** Рұқсат етілген эмодзилер ғана (кез келгенін сұратып, серверді жүктемеу үшін) */
/** Әр атауға бір не бірнеше үміткер: жиынтықта біріншісі болмаса — келесісі алынады */
export const EMOJI: Record<string, string[]> = {
  point_right: ["👉"], point_down: ["👇"], point_up: ["👆"], bell: ["🔔"], fire: ["🔥"], phone: ["📱"], star: ["⭐"], money: ["💰"],
  // Патша (2026-11-21): «ТОП» белгісі және басты беттегі сұрыптау батырмалары
  target: ["🎯"], pin: ["📍", "🗺"], cheap: ["🏷", "💸", "🤑"], gem: ["💎", "👍"], sparkles: ["✨", "🆕"],
  // Патша (2026-11-21, 09:32): сұрыптау батырмалары түпкілікті — Жақын 🫵, Арзан 🤑, Тиімді 👍, Жаңа 🥳
  you: ["🫵", "👉"], rich: ["🤑"], thumbs: ["👍"], partyface: ["🥳", "🎉"],
};
const SET = "AnimatedEmojies";
const MAX = 600_000; // ашылған JSON шегі
const plain = (e: string) => e.replace(/️/g, "");

type Sticker = { emoji?: string; file_id: string; is_animated?: boolean };
export function emojiRoutes(cfg: Config, f: typeof fetch = fetch) {
  const app = new Hono();
  const tg = tgApi(cfg, f);
  const cache = new Map<string, string>();
  let set: { at: number; stickers: Sticker[] } | null = null;
  const load = async (slug: string): Promise<string | null> => {
    const want = EMOJI[slug]; if (!want) return null;
    const hit = cache.get(slug); if (hit) return hit;
    if (!set || Date.now() - set.at > 86_400_000) {
      const r = await tg("getStickerSet", { name: SET });
      if (!r.ok) throw new Error("set");
      set = { at: Date.now(), stickers: ((r.result as { stickers?: Sticker[] })?.stickers ?? []) };
    }
    let st: Sticker | undefined;
    for (const w of want) { st = set.stickers.find((s) => s.is_animated !== false && s.emoji && plain(s.emoji) === plain(w)); if (st) break; }
    if (!st) return null;
    const fr = await tg("getFile", { file_id: st.file_id });
    const path = (fr.result as { file_path?: string } | undefined)?.file_path;
    if (!fr.ok || !path) throw new Error("file");
    const res = await f(`https://api.telegram.org/file/bot${botToken(cfg)}/${path}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("download");
    const raw = Buffer.from(await res.arrayBuffer());
    const json = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw, { maxOutputLength: MAX }) : raw).toString("utf8");
    JSON.parse(json); // жарамды Lottie екенін тексеру
    cache.set(slug, json);
    return json;
  };
  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!EMOJI[slug]) return c.json({ ok: false, error: "not_found" }, 404);
    try {
      const j = await load(slug);
      if (!j) return c.json({ ok: false, error: "not_found" }, 404);
      return c.body(j, 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=2592000, immutable" });
    } catch {
      return c.json({ ok: false, error: "unavailable" }, 502);
    }
  });
  return app;
}
