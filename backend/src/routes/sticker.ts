// Мекеме жапсырмасы (Патша, 2026-11-22). QR ішінде — біздің сервердің тұрақты сілтемесі <API>/b/<код>.
// Сервер әр сканерлеуді санайды да, клиентті бағыттайды: қазір — Telegram Mini App (startapp=b_<код>),
// қосымша шыққанда — STICKER_TARGET=app арқылы қосымшаға (Universal Links / App Links). Жапсырма ешқашан ауыстырылмайды.
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { branches, stickerScans } from "../db/schema.js";
import type { Config } from "../config.js";

const DEFAULT_BASE = "https://medeo-api-595435045772.europe-west3.run.app";
/** Басып шығаратын QR мазмұны: домен жоқ кезде — Cloud Run мекенжайы (тұрақты, сервер өзгерсе де жұмыс істейді) */
export const stickerUrl = (cfg: Config, code: string) => `${(cfg.STICKER_BASE_URL ?? cfg.PUBLIC_URL ?? DEFAULT_BASE).replace(/\/$/, "")}/b/${code}`;
export const stickerTelegram = (cfg: Config, code: string) => `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=b_${code}`;

export function stickerRoutes(cfg: Config, db: Db) {
  const r = new Hono();
  r.get("/b/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    const bot = `https://t.me/${cfg.MINIAPP_BOT_USERNAME}`;
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return c.redirect(bot, 302);
    const [br] = await db.select({ id: branches.id, active: branches.active }).from(branches).where(eq(branches.stickerCode, code)).limit(1);
    if (!br) return c.redirect(bot, 302);
    // Сканерлеу санағы — бағыттауды кідіртпейміз
    void db.insert(stickerScans).values({ branchId: br.id }).catch(() => null);
    c.header("Cache-Control", "no-store");
    return c.redirect(stickerTelegram(cfg, code), 302);
  });
  return r;
}
