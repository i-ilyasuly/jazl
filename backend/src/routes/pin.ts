// Клиент PIN-і серверде (Қауіпсіздік аудиті, Алтай, 2026-11-21). Бұрын PIN тек телефонда тексерілетін: Telegram Desktop/Web
// арқылы кірген адам PIN-сіз бірлік жұмсай алатын. Енді: PIN хэші (scrypt) серверде; бірлік жұмсау (redeem, тапсырыс, қайтару)
// алдында X-Pin-Token сұралады (PIN қойған пайдаланушыда ғана). Токен 10 минут жарамды. 5 қате → 15 минут бұғат.
// Биометрия: PIN расталған соң сервер құпия береді, ол Telegram BiometricManager-де сақталады; саусақ ізі/Face ID сол құпияны
// ашады → сервер хэшпен салыстырып, токен береді.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import { hmac, sigOk, signKey } from "../secret.js";

export const PIN_TOKEN_TTL = 10 * 60;
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const hashPin = (pin: string) => { const salt = randomBytes(16); return `s1:${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`; };
function pinOk(pin: string, stored: string) {
  const [v, s, h] = stored.split(":");
  if (v !== "s1" || !s || !h) return false; // ескі пішім жоқ: серверде PIN тек осы нұсқадан басталды
  const a = scryptSync(pin, Buffer.from(s, "hex"), 32); const b = Buffer.from(h, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
const pinToken = (cfg: Config, userId: string) => { const exp = Math.floor(Date.now() / 1000) + PIN_TOKEN_TTL; return `${exp}.${hmac(signKey(cfg), `upin:${userId}:${exp}`)}`; };
export const pinTokenOk = (cfg: Config, userId: string, t: string | undefined) => {
  const [e, s] = (t ?? "").split("."); const exp = Number(e);
  return Boolean(s && exp > Date.now() / 1000 && sigOk(cfg, `upin:${userId}:${exp}`, s));
};
/** Бірлік жұмсайтын маршруттар алдында: PIN қойылған болса — жарамды X-Pin-Token міндетті */
export const pinGuard = (cfg: Config): MiddlewareHandler<Env> => async (c, next) => {
  if (c.req.method === "OPTIONS" || c.req.method === "GET") return next();
  const u = c.get("user");
  if (u?.pinHash && !pinTokenOk(cfg, u.id, c.req.header("X-Pin-Token"))) return c.json({ ok: false, error: "pin_required" }, 403);
  await next();
};

const Pin = z.string().regex(/^\d{4}$/);
export function pinRoutes(cfg: Config, db: Db) {
  const r = new Hono<Env>();
  const fresh = async (id: string) => (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  /** PIN-ді тексеру (санағымен). ok болса — санақ нөлденеді. */
  async function check(c: Context<Env>, pin: string): Promise<{ ok: true } | { ok: false; res: Response }> {
    const u = await fresh(c.get("user").id);
    if (!u?.pinHash) return { ok: false, res: c.json({ ok: false, error: "no_pin" }, 409) };
    if (u.pinLockedUntil && u.pinLockedUntil.getTime() > Date.now()) return { ok: false, res: c.json({ ok: false, error: "locked", until: u.pinLockedUntil }, 423) };
    if (pinOk(pin, u.pinHash)) { if (u.pinFailed) await db.update(users).set({ pinFailed: 0, pinLockedUntil: null }).where(eq(users.id, u.id)); return { ok: true }; }
    const failed = u.pinFailed + 1;
    const lock = failed >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000) : null;
    await db.update(users).set({ pinFailed: lock ? 0 : failed, pinLockedUntil: lock }).where(eq(users.id, u.id));
    return { ok: false, res: lock ? c.json({ ok: false, error: "locked", until: lock }, 423) : c.json({ ok: false, error: "bad_pin", left: MAX_FAILS - failed }, 403) };
  }

  // Орнату не ауыстыру: бұрын қойылған болса — ескісі (old) міндетті
  r.post("/me/pin", async (c) => {
    const b = z.object({ pin: Pin, old: Pin.optional() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const u = await fresh(c.get("user").id);
    if (u.pinHash) {
      if (!b.data.old) return c.json({ ok: false, error: "old_required" }, 409);
      const ok = await check(c, b.data.old); if (!ok.ok) return ok.res;
    }
    await db.update(users).set({ pinHash: hashPin(b.data.pin), pinFailed: 0, pinLockedUntil: null, bioHash: null }).where(eq(users.id, u.id));
    return c.json({ ok: true, pinToken: pinToken(cfg, u.id) });
  });
  // Растау: PIN не биометрия құпиясы → 10 минуттық токен
  r.post("/me/pin/verify", async (c) => {
    const b = z.object({ pin: Pin.optional(), bio: z.string().min(32).max(128).optional() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success || (!b.data.pin && !b.data.bio)) return c.json({ ok: false, error: "bad_request" }, 400);
    const u = await fresh(c.get("user").id);
    if (b.data.bio) {
      if (!u.bioHash || u.pinLockedUntil && u.pinLockedUntil.getTime() > Date.now()) return c.json({ ok: false, error: "bio_off" }, 403);
      const a = Buffer.from(sha(b.data.bio)), h = Buffer.from(u.bioHash);
      if (a.length !== h.length || !timingSafeEqual(a, h)) return c.json({ ok: false, error: "bio_off" }, 403);
      return c.json({ ok: true, pinToken: pinToken(cfg, u.id) });
    }
    const ok = await check(c, b.data.pin!); if (!ok.ok) return ok.res;
    return c.json({ ok: true, pinToken: pinToken(cfg, u.id) });
  });
  // Биометрия құпиясы (жарамды PIN токенімен ғана): мини апп оны BiometricManager-ге жазады
  r.post("/me/pin/bio", async (c) => {
    const u = c.get("user");
    if (!u.pinHash || !pinTokenOk(cfg, u.id, c.req.header("X-Pin-Token"))) return c.json({ ok: false, error: "pin_required" }, 403);
    const secret = randomBytes(32).toString("hex");
    await db.update(users).set({ bioHash: sha(secret) }).where(eq(users.id, u.id));
    return c.json({ ok: true, bio: secret });
  });
  // PIN-ді алып тастау (PIN-мен)
  r.delete("/me/pin", async (c) => {
    const b = z.object({ pin: Pin }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const ok = await check(c, b.data.pin); if (!ok.ok) return ok.res;
    await db.update(users).set({ pinHash: null, bioHash: null, pinFailed: 0, pinLockedUntil: null }).where(eq(users.id, c.get("user").id));
    return c.json({ ok: true });
  });
  return r;
}
