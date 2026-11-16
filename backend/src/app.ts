// HTTP API (Hono). Маршруттар: /health — тексеру; /v1/* — тек дұрыс Telegram initData-мен.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { users } from "./db/schema.js";
import { validateInitData } from "./auth/telegram.js";
import { z } from "zod";
import { catalogRoutes } from "./routes/catalog.js";
import { purchaseRoutes, receiptFileRoutes } from "./routes/purchases.js";
import { usageRoutes } from "./routes/usage.js";

type User = typeof users.$inferSelect;
export type Env = { Variables: { user: User; auth: { authDate: number; startParam?: string } } };

export function createApp(cfg: Config, db: Db) {
  const app = new Hono<Env>();
  const origins = cfg.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  app.use("*", cors({ origin: (o) => (origins.includes(o) ? o : null), allowHeaders: ["Authorization", "Content-Type", "X-Tg-Platform", "X-Tg-Version", "X-App-Version"], allowMethods: ["GET", "POST", "PATCH", "DELETE"], maxAge: 600 }));

  app.get("/health", async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  // Ашық маршруттар (кірусіз): чек PDF (қолтаңбалы сілтеме), каталог
  app.route("/files", receiptFileRoutes(cfg, db));
  app.route("/v1/catalog", catalogRoutes(db));

  // Аутентификация: Authorization: tma <initData>. Пайдаланушы бірінші рет кірсе — жазылады, әйтпесе деректері жаңарады.
  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "OPTIONS" || c.req.path.startsWith("/v1/catalog")) return next();
    const h = c.req.header("Authorization") ?? "";
    const raw = h.startsWith("tma ") ? h.slice(4) : "";
    // Мини апп ашылған ботың токенімен қол қойылады: негізгі бот пен мини апп боты әртүрлі болуы мүмкін
    const tokens = [cfg.MINIAPP_BOT_TOKEN, cfg.BOT_TOKEN].filter((t): t is string => Boolean(t));
    let r = validateInitData(raw, tokens[0], cfg.INIT_DATA_TTL);
    for (const t of tokens.slice(1)) { if (r.ok || r.reason !== "bad_hash") break; r = validateInitData(raw, t, cfg.INIT_DATA_TTL); }
    if (!r.ok) return c.json({ ok: false, error: "unauthorized", reason: r.reason }, 401);
    const u = r.user;
    const [row] = await db.insert(users).values({
      telegramId: u.id, firstName: u.first_name, lastName: u.last_name, username: u.username, photoUrl: u.photo_url,
      lang: u.language_code === "ru" ? "ru" : "kk",
    }).onConflictDoUpdate({
      target: users.telegramId,
      set: { firstName: u.first_name, lastName: u.last_name ?? null, username: u.username ?? null, photoUrl: u.photo_url ?? null, lastSeenAt: sql`now()` },
    }).returning();
    c.set("user", row);
    c.set("auth", { authDate: r.authDate, startParam: r.startParam });
    await next();
  });

  const publicUser = (u: User) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username, photoUrl: u.photoUrl, lang: u.lang, city: u.city, hasPin: Boolean(u.pinHash) });

  app.get("/v1/me", (c) => c.json({ ok: true, user: publicUser(c.get("user")) }));

  const Patch = z.object({ lang: z.enum(["kk", "ru"]).optional(), city: z.string().min(2).max(40).optional() }).strict();
  app.patch("/v1/me", async (c) => {
    const body = Patch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [row] = await db.update(users).set(body.data).where(sql`${users.id} = ${c.get("user").id}`).returning();
    return c.json({ ok: true, user: publicUser(row) });
  });

  app.route("/v1", purchaseRoutes(cfg, db));
  app.route("/v1", usageRoutes(cfg, db));

  app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
  app.onError((err, c) => { console.error(err); return c.json({ ok: false, error: "internal" }, 500); });
  return app;
}
