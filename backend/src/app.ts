// HTTP API (Hono). Маршруттар: /health — тексеру; /v1/* — тек дұрыс Telegram initData-мен.
import { packCards, setPackCards } from "./bot/packCard.js";
import { tgApi, type TgCall } from "./bot/api.js";
import { botRoutes } from "./bot/handler.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { users, venues } from "./db/schema.js";
import { guidePdf, tentPdf } from "./receipt/guide.js";
import { validateInitData } from "./auth/telegram.js";
import { z } from "zod";
import { catalogRoutes } from "./routes/catalog.js";
import { emojiRoutes } from "./routes/emoji.js";
import { eventRoutes } from "./routes/events.js";
import { fiscalTick } from "./fiscal/index.js";
import { stickerRoutes } from "./routes/sticker.js";
import { purchaseRoutes, receiptFileRoutes } from "./routes/purchases.js";
import { devQrRoutes, usageRoutes } from "./routes/usage.js";
import { b4Routes } from "./routes/b4.js";
import { venueRoutes } from "./routes/venue.js";
import { applyRoutes } from "./routes/apply.js";
import { complaintRoutes } from "./routes/complaints.js";
import { paymentRoutes, paymentWebhookRoutes } from "./routes/payments.js";
import { adminFileRoutes, adminRoutes, adminSigOk, adminWebRoutes } from "./routes/admin.js";
import { safeEqual } from "./secret.js";
import { clientIp, rateLimit, type LimitRule } from "./rateLimit.js";
import { pinGuard, pinRoutes } from "./routes/pin.js";
import { getSettings, refreshFees, setSetting } from "./settings.js";
import { refreshVenueScores } from "./venueScore.js";
import { autoRenewTick } from "./autoRenew.js";
import { snapshot } from "./metrics.js";
import { localMediaRoutes } from "./media.js";
import { makeNotifier, noopSender, telegramSender, type Sender } from "./notify.js";

type User = typeof users.$inferSelect;
export type Env = { Variables: { user: User; auth: { authDate: number; startParam?: string } } };

export function createApp(cfg: Config, db: Db, opts: { send?: Sender; botCall?: TgCall } = {}) {
  const app = new Hono<Env>();
  // Пакет картасы (Bot API 10.4 виджеті): тестте — тек тест өз жасанды Bot API-ін берсе
  const cards = opts.botCall ? packCards(cfg, db, opts.botCall) : cfg.NODE_ENV === "test" ? null : packCards(cfg, db, tgApi(cfg));
  setPackCards(cards);
  // Бот хабарламалары: тестте — ештеңе жібермейді (не тест өз жинағышын береді)
  const notify = makeNotifier(db, opts.send ?? (cfg.NODE_ENV === "test" ? noopSender : telegramSender(cfg)), { adminIds: cfg.ADMIN_IDS, adminUrl: cfg.ADMIN_WEB_URL, feePct: cfg.MEDEO_FEE_PCT });
  const origins = cfg.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  app.use("*", cors({ origin: (o) => (origins.includes(o) ? o : null), allowHeaders: ["Authorization", "Content-Type", "X-Tg-Platform", "X-Tg-Version", "X-App-Version", "X-File-Name", "X-Admin-Token", "X-Pin-Token"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"], maxAge: 600 }));

  // Сұраныс шегі (аудит, 2026-11-21): автосынақтарда өшірулі (RATE_LIMIT=1 болса қосулы)
  const rl = cfg.NODE_ENV !== "test" || process.env.RATE_LIMIT === "1";
  const lim = (rules: LimitRule[]) => rateLimit(rules, rl);
  // IP шектері жоғары: ұялы байланыста көп адам бір IP-мен шығады (CGNAT)
  app.use("/admin-web/*", lim([{ name: "adminweb", max: 10, windowSec: 60, by: "ip" }]));
  app.use("/files/*", lim([{ name: "files", max: 60, windowSec: 60, by: "ip" }]));
  app.use("/v1/*", lim([{ name: "v1ip", max: 3000, windowSec: 60, by: "ip" }]));

  app.get("/health", async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  // Ашық маршруттар (кірусіз): чек PDF (қолтаңбалы сілтеме), каталог
  app.route("/files", receiptFileRoutes(cfg, db));
  app.route("/files", adminFileRoutes(cfg, db));
  app.route("/admin-web", adminWebRoutes(cfg, db));
  app.route("/bot", botRoutes(cfg, db)); // Medeo боты: Telegram вебхугы (құпия тақырыпшамен)
  app.route("/payments/webhook", paymentWebhookRoutes(cfg, db)); // төлем провайдерінің вебхугы (қолтаңбамен) // Басқаруға веб арқылы кіру (Telegram Login Widget + PIN)
  void refreshFees(db).catch(() => null); // мекеме комиссиялары (Medeo Басқару «Комиссия»)
  app.route("/media", localMediaRoutes(cfg)); // тек MEDIA_DIR болғанда (жергілікті)
  // «Кассаға нұсқау» PDF (ашық: ішінде тек мекеме атауы мен мини апп сілтемесі бар)
  app.get("/files/guide/:file", async (c) => {
    const id = c.req.param("file").replace(/\.pdf$/, "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.notFound();
    const [v] = await db.select({ name: venues.name }).from(venues).where(sql`${venues.id} = ${id}`).limit(1);
    if (!v) return c.notFound();
    const pdf = await guidePdf(v.name, `https://t.me/${cfg.MINIAPP_BOT_USERNAME}`);
    return c.body(new Uint8Array(pdf), 200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Medeo-kassa.pdf"` });
  });
  // Клиентке тақтайша (A5): мекеменің ең үлкен нақты жеңілдігі және мекеме бетіне QR (ашық — ішінде тек мекеме атауы)
  app.get("/files/tent/:file", async (c) => {
    const id = c.req.param("file").replace(/\.pdf$/, "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.notFound();
    const [v] = await db.select({ name: venues.name, slug: venues.slug }).from(venues).where(sql`${venues.id} = ${id}`).limit(1);
    if (!v) return c.notFound();
    const [m] = (await db.execute(sql`select coalesce(max(floor(100 - 100.0 * x.price / (x.units * o.regular_unit_price))), 0)::int as pct
      from app.offers o cross join lateral jsonb_to_recordset(coalesce(o.sizes, jsonb_build_array(jsonb_build_object('units', o.units, 'price', o.price)))) as x(units int, price int)
      where o.venue_id = ${id} and o.status = 'active'`)).rows as { pct: number }[];
    const pdf = await tentPdf(v.name, m?.pct ?? 0, `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=venue_${v.slug}`);
    return c.body(new Uint8Array(pdf), 200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Medeo-taqtaisha.pdf"` });
  });
  // Жоспарлы жұмыс: Cloud Scheduler 15 минут сайын шақырады (өтінім нәтижелері, 22:00 қорытынды, мерзім ескертуі)
  app.post("/cron/tick", async (c) => {
    if (!cfg.CRON_KEY || !safeEqual(c.req.header("X-Cron-Key") ?? "", cfg.CRON_KEY)) return c.json({ ok: false, error: "not_found" }, 404);
    const sent = await notify.tick();
    await refreshVenueScores(db, cfg, notify).catch((e) => console.error("venueScore", e)); // сенімділік, комиссия деңгейі
    const renewed = await autoRenewTick(db, cfg, notify).catch((e) => { console.error("autoRenew", e); return 0; }); // автожаңарту
    const cardsDone = await cards?.sweep().catch((e) => { console.error("packCards", e); return null; }); // пакет карталары: жаңалары және өзгерген күйлер
    await snapshot(db).catch((e) => console.error("metrics snapshot", e)); // күндік сурет (метрикалар)
    const fiscal = await fiscalTick(db, cfg).catch((e) => { console.error("fiscal", e); return null; }); // фискалдық чектер (re:Kassa)
    await setSetting(db, "lastTick", new Date().toISOString()).catch(() => null);
    return c.json({ ok: true, sent, renewed, cards: cardsDone ?? null, fiscal });
  });
  // IP тақырыбын тексеру (аудит 2026-11-25): Cloud Run X-Forwarded-For-ды қалай құратынын көру үшін. Тек CRON_KEY-мен.
  app.get("/cron/ip", (c) => {
    if (!cfg.CRON_KEY || !safeEqual(c.req.header("X-Cron-Key") ?? "", cfg.CRON_KEY)) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, xff: c.req.header("x-forwarded-for") ?? null, realIp: c.req.header("x-real-ip") ?? null, chosen: clientIp(c), hops: Number(process.env.IP_HOPS) || 0 });
  });
  app.route("/dev", devQrRoutes(cfg, db)); // тек PAYMENTS_MODE=test
  app.route("/v1/catalog", catalogRoutes(db, { installment: cfg.HALYK_INSTALLMENT === "on" }));
  app.route("/", stickerRoutes(cfg, db)); // мекеме жапсырмасы: /b/<код> → Mini App (кейін қосымша)
  app.route("/v1/emoji", emojiRoutes(cfg)); // Telegram анимациялық эмодзилері (ашық, кіру талап етілмейді)

  // Клиент қайдан келді (0030, метрикалар): тек БІРІНШІ кіргенде жазылады. ad_<код> — жарнама сілтемесі, ref_<код> — шақыру.
  const sourceOf = (sp?: string) => {
    if (!sp) return { source: "direct" };
    const m = sp.match(/^([a-z]{1,10})_([\w-]{1,60})/);
    return m ? { source: m[1], sourceRef: m[2] } : { source: "other", sourceRef: sp.slice(0, 60) };
  };
  // Аутентификация: Authorization: tma <initData>. Пайдаланушы бірінші рет кірсе — жазылады, әйтпесе деректері жаңарады.
  // Техникалық жұмыстар (Figma 13 «Техникалық жұмыстар»): MAINTENANCE=1 болса, API 503 қайтарады — мини апп арнайы бетті көрсетеді
  app.use("/v1/*", async (c, next) => {
    // Medeo Басқару «Техникалық жұмыстар» (дерекқор баптауы) не MAINTENANCE=1. Басқарудың өзі жұмыс істей береді — әйтпесе өшіре алмайды.
    if (c.req.method !== "OPTIONS" && !c.req.path.startsWith("/v1/admin")) {
      const s = await getSettings(db).catch(() => null);
      if (cfg.MAINTENANCE || s?.maintenance) return c.json({ ok: false, error: "maintenance", text: s?.maintenanceText ?? null }, 503);
    }
    await next();
  });
  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "OPTIONS" || c.req.path.startsWith("/v1/catalog") || c.req.path.startsWith("/v1/emoji/")) return next();
    const h = c.req.header("Authorization") ?? "";
    // Басқарудың веб-сеансы: «adm <userId>.<exp>.<sig>» — тек /v1/admin/* үшін
    if (h.startsWith("adm ") && c.req.path.startsWith("/v1/admin")) {
      const [uid, e, sig] = h.slice(4).split(".");
      const exp = Number(e);
      if (!uid || !/^[0-9a-f-]{36}$/.test(uid) || !(exp > Date.now() / 1000) || !adminSigOk(cfg, uid, exp, sig ?? "")) return c.json({ ok: false, error: "admin_session" }, 401);
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
      ...sourceOf(r.startParam),
    }).onConflictDoUpdate({
      target: users.telegramId,
      set: { firstName: u.first_name, lastName: u.last_name ?? null, username: u.username ?? null, photoUrl: u.photo_url ?? null, lastSeenAt: sql`now()` },
    }).returning();
    c.set("user", row);
    c.set("auth", { authDate: r.authDate, startParam: r.startParam });
    await next();
  });

  // Кіргеннен кейін — пайдаланушы бойынша шектер (жалпы + сезімтал әрекеттер)
  app.use("/v1/*", lim([{ name: "v1", max: 240, windowSec: 60, by: "user" }]));
  app.use("/v1/qr/code", lim([{ name: "qrcode", max: 8, windowSec: 60, by: "user" }, { name: "qrcode", max: 120, windowSec: 60, by: "ip" }]));
  app.use("/v1/qr/resolve", lim([{ name: "qrres", max: 30, windowSec: 60, by: "user" }]));
  app.use("/v1/redeem", lim([{ name: "redeem", max: 20, windowSec: 60, by: "user" }]));
  app.use("/v1/purchases", lim([{ name: "buy", max: 15, windowSec: 60, by: "user" }]));
  app.use("/v1/venue/join", lim([{ name: "join", max: 6, windowSec: 60, by: "user" }]));
  app.use("/v1/gifts/*", lim([{ name: "gift", max: 20, windowSec: 60, by: "user" }]));
  app.use("/v1/admin/pin", lim([{ name: "apin", max: 10, windowSec: 60, by: "user" }]));
  app.use("/v1/me/pin", lim([{ name: "upin", max: 10, windowSec: 60, by: "user" }]));
  app.use("/v1/me/pin/*", lim([{ name: "upinv", max: 15, windowSec: 60, by: "user" }]));
  app.use("/v1/events", lim([{ name: "events", max: 30, windowSec: 60, by: "user" }]));
  app.use("/v1/venue/:venueId/offers/suggest-category", lim([{ name: "aicat", max: 20, windowSec: 60, by: "user" }])); // Gemini — ақылы, шектейміз
  app.use("/v1/venue/orders/verify", lim([{ name: "overify", max: 20, windowSec: 60, by: "user" }]));

  // Бірлік жұмсау — PIN қойылған болса, серверде расталған PIN токенімен ғана (аудит 2026-11-21)
  const guard = pinGuard(cfg);
  app.use("/v1/redeem", guard);
  app.use("/v1/orders", guard);
  app.use("/v1/packs/:id/refund", guard);
  app.route("/v1", pinRoutes(cfg, db));

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

  app.route("/v1", eventRoutes(db)); // пилот воронкасы, қолданба қателері
  app.route("/v1", purchaseRoutes(cfg, db));
  app.route("/v1", paymentRoutes(cfg, db));
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
