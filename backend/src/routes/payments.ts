// Карта төлемі (src/payments): сақталған карталар, төлем күйі, 3-D Secure (сынақта — мини апптағы банк растауының үлгісі), провайдер вебхугы.
import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { paymentCards, payments } from "../db/schema.js";
import { paymentProvider } from "../payments/index.js";
import { PaymentError } from "../payments/types.js";
import { finalizePurchase, paymentReply, saveCard } from "./purchases.js";

const cardDto = (x: typeof paymentCards.$inferSelect) => ({ id: x.id, brand: x.brand, last4: x.last4, exp: `${String(x.expMonth).padStart(2, "0")}/${String(x.expYear % 100).padStart(2, "0")}`, holder: x.holder });

export function paymentRoutes(cfg: Config, db: Db) {
  const r = new Hono<Env>();

  // Сақталған карталар (Figma «Төлем тәсілі / Тізім»)
  r.get("/cards", async (c) => {
    const rows = await db.select().from(paymentCards).where(and(eq(paymentCards.userId, c.get("user").id), isNull(paymentCards.removedAt))).orderBy(desc(paymentCards.createdAt));
    return c.json({ ok: true, cards: rows.map(cardDto) });
  });
  // Карта қосу (Figma «Карта қосу (Telegram нативті)»): криптограмма → провайдер токені. Ақша алынбайды.
  r.post("/cards", async (c) => {
    const b = z.object({ cryptogram: z.string().min(8).max(4000) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const p = paymentProvider(cfg);
    try {
      const info = await p.tokenize(b.data.cryptogram, { id: c.get("user").id });
      return c.json({ ok: true, card: cardDto(await saveCard(db, p.name, c.get("user").id, info)) });
    } catch (e) { return c.json({ ok: false, error: e instanceof PaymentError ? e.code : "provider_error" }, 422); }
  });
  r.post("/cards/:id/remove", async (c) => {
    await db.update(paymentCards).set({ removedAt: new Date() }).where(and(eq(paymentCards.id, c.req.param("id")), eq(paymentCards.userId, c.get("user").id)));
    return c.json({ ok: true });
  });

  // Төлем күйі: 3-D Secure-ден оралғанда мини апп осыны сұрайды
  r.get("/payments/:id", async (c) => {
    const [pay] = await db.select().from(payments).where(and(eq(payments.id, c.req.param("id")), eq(payments.userId, c.get("user").id))).limit(1);
    if (!pay) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json(...(await paymentReply(db, c.get("user").id, pay)));
  });

  // Сынақ провайдері ғана: мини апптағы «банк растауы» беті (нақты провайдерде — банктің беті, нәтижесі вебхукпен)
  r.post("/payments/:id/test-3ds", async (c) => {
    if (paymentProvider(cfg).name !== "test") return c.json({ ok: false, error: "not_found" }, 404);
    const b = z.object({ approve: z.boolean() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [pay] = await db.select().from(payments).where(and(eq(payments.id, c.req.param("id")), eq(payments.userId, c.get("user").id))).limit(1);
    if (!pay) return c.json({ ok: false, error: "not_found" }, 404);
    if (pay.status === "pending") {
      if (b.data.approve) { const out = await finalizePurchase(db, cfg, pay.id); if ("error" in out) return c.json({ ok: false, error: out.error }, 409); }
      else await db.update(payments).set({ status: "failed", failure: "3ds_failed" }).where(eq(payments.id, pay.id));
    }
    const [fresh] = await db.select().from(payments).where(eq(payments.id, pay.id));
    return c.json(...(await paymentReply(db, c.get("user").id, fresh)));
  });
  return r;
}

/** Ашық маршрут (кірусіз): провайдердің вебхугы. Қолтаңбаны провайдер адаптері тексереді; қайталанса — идемпотентті. */
export function paymentWebhookRoutes(cfg: Config, db: Db) {
  const r = new Hono();
  r.post("/:provider", async (c) => {
    const p = paymentProvider(cfg);
    if (c.req.param("provider") !== p.name) return c.json({ ok: false, error: "not_found" }, 404);
    const raw = await c.req.text();
    const headers: Record<string, string> = {}; c.req.raw.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const ev = await p.webhook({ headers, body: raw });
    if (!ev) return c.json({ ok: false, error: "bad_signature" }, 401);
    const [pay] = ev.paymentId
      ? await db.select().from(payments).where(and(eq(payments.id, ev.paymentId), eq(payments.provider, p.name))).limit(1)
      : await db.select().from(payments).where(and(eq(payments.externalId, ev.externalId), eq(payments.provider, p.name))).limit(1);
    if (!pay) return c.json({ ok: true, ignored: true }); // бізде жоқ төлем — 200, провайдер қайта жібермесін
    if (ev.status === "paid") {
      if (ev.card && pay.userId) await saveCard(db, p.name, pay.userId, ev.card);
      const out = await finalizePurchase(db, cfg, pay.id);
      if ("error" in out) { console.error("webhook finalize", pay.id, out.error); return c.json({ ok: false, error: out.error }, 409); }
    } else if (pay.status !== "paid") await db.update(payments).set({ status: "failed", failure: ev.reason ?? "declined" }).where(eq(payments.id, pay.id));
    return c.json({ ok: true });
  });
  return r;
}
