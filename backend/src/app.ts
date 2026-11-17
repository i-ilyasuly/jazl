// HTTP API (Hono). Маршруттар: /health — тексеру; /v1/* — тек дұрыс Telegram initData-мен.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { users, venues } from "./db/schema.js";
import { guidePdf } from "./receipt/guide.js";
import { validateInitData } from "./auth/telegram.js";
import { z } from "zod";
import { catalogRoutes } from "./routes/catalog.js";
import { purchaseRoutes, receiptFileRoutes } from "./routes/purchases.js";
import { devQrRoutes, usageRoutes } from "./routes/usage.js";
import { b4Routes } from "./routes/b4.js";
import { venueRoutes } from "./routes/venue.js";
import { applyRoutes } from "./routes/apply.js";
import { complaintRoutes } from "./routes/complaints.js";
import { adminFileRoutes, adminRoutes, adminSig, adminWebRoutes } from "./routes/admin.js";
import { getSettings, refreshFees } from "./settings.js";
import { localMediaRoutes } from "./media.js";
import { makeNotifier, noopSender, telegramSender, type Sender } from "./notify.js";

type User = typeof users.$inferSelect;
export type Env = { Variables: { user: User; auth: { authDate: number; startParam?: string } } };

export function createApp(cfg: Config, db: Db, opts: { send?: Sender } = {}) {
  const app = new Hono<Env>();
  // Бот хабарламалары: тестте — ештеңе жібермейді (не тест өз жинағышын береді)
  const notify = makeNotifier(db, opts.send ?? (cfg.NODE_ENV === "test" ? noopSender : telegramSender(cfg)), { adminIds: cfg.ADMIN_IDS, adminUrl: cfg.ADMIN_WEB_URL, feePct: cfg.JAZL_FEE_PCT });
  const origins = cfg.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  app.use("*", cors({ origin: (o) => (origins.includes(o) ? o : null), allowHeaders: ["Authorization", "Content-Type", "X-Tg-Platform", "X-Tg-Version", "X-App-Version", "X-File-Name", "X-Admin-Token"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"], maxAge: 600 }));

  app.get("/health", async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  // Ашық маршруттар (кірусіз): чек PDF (қолтаңбалы сілтеме), каталог
  app.route("/files", receiptFileRoutes(cfg, db));
  app.route("/files", adminFileRoutes(cfg, db));
  app.route("/admin-web", adminWebRoutes(cfg, db)); // Басқаруға веб арқылы кіру (Telegram Login Widget + PIN)
  void refreshFees(db).catch(() => null); // мекеме комиссиялары (Jazl+ Басқару «Комиссия»)
  app.route("/media", localMediaRoutes(cfg)); // тек MEDIA_DIR болғанда (жергілікті)
  // «Кассаға нұсқау» PDF (ашық: ішінде тек мекеме атауы мен мини апп сілтемесі бар)
  app.get("/files/guide/:file", async (c) => {
    const id = c.req.param("file").replace(/\.pdf$/, "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.notFound();
    const [v] = await db.select({ name: venues.name }).from(venues).where(sql`${venues.id} = ${id}`).limit(1);
    if (!v) return c.notFound();
    const pdf = await guidePdf(v.name, `https://t.me/${cfg.MINIAPP_BOT_USERNAME}`);
    return c.body(new Uint8Array(pdf), 200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Jazl-kassa.pdf"` });
  });
  // Жоспарлы жұмыс: Cloud Scheduler 15 минут сайын шақырады (өтінім нәтижелері, 22:00 қорытынды, мерзім ескертуі)
  app.post("/cron/tick", async (c) => {
    if (!cfg.CRON_KEY || c.req.header("X-Cron-Key") !== cfg.CRON_KEY) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, sent: await notify.tick() });
  });
  app.route("/dev", devQrRoutes(cfg, db)); // тек PAYMENTS_MODE=test
  app.route("/v1/catalog", catalogRoutes(db));

  // Аутентификация: Authorization: tma <initData>. Пайдаланушы бірінші рет кірсе — жазылады, әйтпесе деректері жаңарады.
  // Техникалық жұмыстар (Figma 13 «Техникалық жұмыстар»): MAINTENANCE=1 болса, API 503 қайтарады — мини апп арнайы бетті көрсетеді
  app.use("/v1/*", async (c, next) => {
    // Jazl+ Басқару «Техникалық жұмыстар» (дерекқор баптауы) не MAINTENANCE=1. Басқарудың өзі жұмыс істей береді — әйтпесе өшіре алмайды.
    if (c.req.method !== "OPTIONS" && !c.req.path.startsWith("/v1/admin")) {
      const s = await getSettings(db).catch(() => null);
      if (cfg.MAINTENANCE || s?.maintenance) return c.json({ ok: false, error: "maintenance", text: s?.maintenanceText ?? null }, 503);
    }
    await next();
  });
  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "OPTIONS" || c.req.path.startsWith("/v1/catalog")) return next();
    const h = c.req.header("Authorization") ?? "";
    // Басқарудың веб-сеансы: «adm <userId>.<exp>.<sig>» — тек /v1/admin/* үшін
    if (h.startsWith("adm ") && c.req.path.startsWith("/v1/admin")) {
      const [uid, e, sig] = h.slice(4).split(".");
      const exp = Number(e);
      if (!uid || !/^[0-9a-f-]{36}$/.test(uid) || !(exp > Date.now() / 1000) || sig !== adminSig(cfg, uid, exp)) return c.json({ ok: false, error: "admin_session" }, 401);
      const [row] = await db.select().from(users).where(sql`${users.id} = ${uid}`).limit(1);
      if (!row) return c.json({ ok: false, error: "admin_session" }, 401);
      c.set("user", row); c.set("auth", { authDate: Math.floor(Date.now() / 1000) });
      return next();
    }
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

  // notify — клиенттің бот хабарландыру баптаулары (Figma «Хабарландырулар»): мерзім ескертуі т.б.
  const Patch = z.object({ lang: z.enum(["kk", "ru"]).optional(), city: z.string().min(2).max(40).optional(),
    notify: z.object({ expiry: z.boolean(), rating: z.boolean(), offers: z.boolean(), promo: z.boolean() }).partial().strict().optional() }).strict();
  app.patch("/v1/me", async (c) => {
    const body = Patch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const { notify, ...rest } = body.data;
    const [row] = await db.update(users).set({ ...rest, ...(notify ? { notify: sql`coalesce(${users.notify}, '{}'::jsonb) || ${JSON.stringify(notify)}::jsonb` } : {}) }).where(sql`${users.id} = ${c.get("user").id}`).returning();
    return c.json({ ok: true, user: publicUser(row) });
  });

  app.route("/v1", purchaseRoutes(cfg, db));
  app.route("/v1", adminRoutes(cfg, db, notify));
  app.route("/v1", applyRoutes(cfg, db, notify));
  app.route("/v1", complaintRoutes(cfg, db, notify));
  app.route("/v1", venueRoutes(cfg, db, notify));
  app.route("/v1", usageRoutes(cfg, db, notify));
  app.route("/v1", b4Routes(cfg, db, notify));

  app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
  app.onError((err, c) => { console.error(err); return c.json({ ok: false, error: "internal" }, 500); });
  return app;
}
