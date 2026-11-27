// Карта төлемі (src/payments): сақталған карталар, төлем күйі, 3-D Secure (сынақта — мини апптағы банк растауының үлгісі), провайдер вебхугы.
import { releaseBonus } from "../bonus.js";
import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { paymentCards, payments } from "../db/schema.js";
import { hostedProviders, paymentProvider, providerByName, type PaymentProvider, type WebhookEvent } from "../payments/index.js";
import { PaymentError } from "../payments/types.js";
import { finalizePurchase, paymentReply, saveCard } from "./purchases.js";
import { finalizeExtend } from "./b4.js";
import { kickFiscal } from "../fiscal/index.js";

/** Төлем түріне қарай аяқтау: сатып алу (пакет, сыйлық, қайта алу) не мерзімді ұзарту */
const finalizePayment = async (db: Db, cfg: Config, pay: typeof payments.$inferSelect) =>
  (pay.meta as { kind?: string } | null)?.kind === "extend" ? finalizeExtend(db, cfg, pay.id) : finalizePurchase(db, cfg, pay.id);

// Мерзімі белгісіз карта (банк беті айтпайды, мысалы Halyk) — expMonth = 0: мини апп мерзімді көрсетпейді
const cardDto = (x: typeof paymentCards.$inferSelect) => ({ id: x.id, brand: x.brand, last4: x.last4, exp: x.expMonth ? `${String(x.expMonth).padStart(2, "0")}/${String(x.expYear % 100).padStart(2, "0")}` : "", holder: x.holder });

/** Провайдер оқиғасын төлемге қолдану (вебхук та, күту бетіндегі тексеру де осы арқылы): сома тексеріледі, карта сақталады, пакет беріледі. */
async function applyEvent(db: Db, cfg: Config, p: PaymentProvider, pay: typeof payments.$inferSelect, ev: WebhookEvent): Promise<{ ok: true } | { ok: false; error: string; status: 409 }> {
  if (ev.status === "pending") return { ok: true };
  // Банктегі транзакция басқа клиенттікі (нөмір сәйкес келіп қалса) — бұл төлемге қолданбаймыз
  if (ev.accountId && pay.userId && ev.accountId !== pay.userId) { console.error("payment account mismatch", pay.id); return { ok: false, error: "account_mismatch", status: 409 }; }
  // Сома сәйкес келмесе — төлемді растамаймыз (қате не алаяқтық): Басқару қолмен қарайды
  if (ev.status === "paid" && ev.amount !== undefined && Number(ev.amount) !== Number(pay.amount)) {
    console.error("payment amount mismatch", pay.id, ev.amount, pay.amount);
    await db.update(payments).set({ meta: sql`coalesce(${payments.meta}, '{}'::jsonb) || ${JSON.stringify({ amountMismatch: ev.amount })}::jsonb` }).where(eq(payments.id, pay.id));
    return { ok: false, error: "amount_mismatch", status: 409 };
  }
  // Біз «өтпеді» деп белгілеген төлемге кейін банктен «төленді» келсе: пакет берілмейді (бонус босатылған) — ақшаны клиентке
  // автоматты қайтарамыз, Басқару көруі үшін белгі қоямыз. Ақша алынып, пакетсіз қалмауы тиіс.
  if (ev.status === "paid" && pay.status === "failed") {
    let refunded = false;
    try { refunded = Boolean(pay.externalId && p.refund && (await p.refund(pay.externalId, Number(ev.amount ?? pay.amount))).ok); } catch (e) { console.error("late paid refund", pay.id, (e as Error).message); }
    console.error("payment paid after failed", pay.id, refunded ? "refunded" : "REFUND NEEDED");
    await db.update(payments).set({ meta: sql`coalesce(${payments.meta}, '{}'::jsonb) || ${JSON.stringify({ paidAfterFail: true, autoRefunded: refunded })}::jsonb` }).where(eq(payments.id, pay.id));
    return { ok: true };
  }
  if (ev.status === "paid") {
    if (ev.card && pay.userId) await saveCard(db, p.name, pay.userId, ev.card);
    const out = await finalizePayment(db, cfg, pay);
    if ("error" in out) { console.error("payment finalize", pay.id, out.error); return { ok: false, error: out.error, status: 409 }; }
    kickFiscal(db, cfg); // фискалдық чек (re:Kassa қосулы болса)
  } else if (pay.status !== "paid") { await db.update(payments).set({ status: "failed", failure: ev.reason ?? "declined" }).where(eq(payments.id, pay.id)); await releaseBonus(db, pay.id); }
  return { ok: true };
}

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

  // Банк бетіндегі төлем тәсілдері (кілттері бапталған провайдерлер): мини апп «Банк картасы · Halyk» тәсілін осыдан біледі
  r.get("/payments/config", (c) => c.json({ ok: true, hosted: hostedProviders(cfg).map((p) => ({ id: p.name, test: Boolean(p.testMode), qr: Boolean(p.qr) })) }));

  // «Halyk арқылы төлеу»: компьютерде көрсетілген QR-ды клиент телефондағы мини апп сканерімен оқыса — сол клиенттің
  // күтудегі төлемін QR мәтіні бойынша табамыз, мини апп Homebank-ті ашады (2026-11-24, Патша). Тек өз төлемі, 25 минут ішінде.
  r.post("/payments/qr-lookup", async (c) => {
    const b = z.object({ qr: z.string().min(10).max(1000) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [row] = (await db.execute(sql`select id, meta->>'confirmUrl' as url from app.payments where user_id = ${c.get("user").id} and status = 'pending'
      and meta->>'qr' = ${b.data.qr} and created_at > now() - interval '25 minutes' order by created_at desc limit 1`)).rows as { id: string; url: string | null }[];
    if (!row?.url) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, paymentId: row.id, confirmUrl: row.url });
  });

  // Төлем күйі: 3-D Secure-ден / банк бетінен оралғанда мини апп осыны сұрайды.
  // Төлем әлі «күтуде» болса және провайдер күйін айта алса — банктен өзіміз сұраймыз (хабарлама келмей қалса да төлем жоғалмайды)
  r.get("/payments/:id", async (c) => {
    let [pay] = await db.select().from(payments).where(and(eq(payments.id, c.req.param("id")), eq(payments.userId, c.get("user").id))).limit(1);
    if (!pay) return c.json({ ok: false, error: "not_found" }, 404);
    const p = providerByName(cfg, pay.provider);
    if (pay.status === "pending" && pay.externalId && p?.check) {
      try {
        const ev = await p.check(pay.externalId);
        if (ev && ev.status !== "pending") { await applyEvent(db, cfg, p, pay, ev); [pay] = await db.select().from(payments).where(eq(payments.id, pay.id)); }
      } catch (e) { console.error("payment check", pay.id, (e as Error).message); } // банк жауап бермесе — келесі сұрауда қайта
    }
    return c.json(...(await paymentReply(db, c.get("user").id, pay)));
  });

  // Сынақ провайдері ғана: мини апптағы «банк растауы» беті (нақты провайдерде — банктің беті, нәтижесі вебхукпен)
  r.post("/payments/:id/test-3ds", async (c) => {
    // Аудит 2026-11-25: тек сынақ провайдерінің төлемі және тек сынақ режимінде. Бұрын Halyk төлемін де осы жерден
    // ақшасыз «төленді» етуге болатын (провайдер тексерілмейтін, нақты режимде де ашық еді).
    if (cfg.PAYMENTS_MODE === "live" || paymentProvider(cfg).name !== "test") return c.json({ ok: false, error: "not_found" }, 404);
    const b = z.object({ approve: z.boolean() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [pay] = await db.select().from(payments).where(and(eq(payments.id, c.req.param("id")), eq(payments.userId, c.get("user").id), eq(payments.provider, "test"))).limit(1);
    if (!pay) return c.json({ ok: false, error: "not_found" }, 404);
    if (pay.status === "pending") {
      if (b.data.approve) { const out = await finalizePayment(db, cfg, pay); if ("error" in out) return c.json({ ok: false, error: out.error }, 409); }
      else { await db.update(payments).set({ status: "failed", failure: "3ds_failed" }).where(eq(payments.id, pay.id)); await releaseBonus(db, pay.id); }
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
    // Вебхук өз провайдеріне: жаңа банкке ауысқаннан кейін де ескі төлемдердің хабары қабылданады
    // Аудит 2026-11-21: нақты режимде сынақ провайдерінің вебхугы жабық
    if (cfg.PAYMENTS_MODE === "live" && c.req.param("provider") === "test") return c.json({ ok: false, error: "not_found" }, 404);
    const p = providerByName(cfg, c.req.param("provider"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const raw = await c.req.text();
    const headers: Record<string, string> = {}; c.req.raw.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const ev = await p.webhook({ headers, body: raw, query: c.req.query() });
    if (!ev) return c.json({ ok: false, error: "bad_signature" }, 401);
    const [pay] = ev.paymentId
      ? await db.select().from(payments).where(and(eq(payments.id, ev.paymentId), eq(payments.provider, p.name))).limit(1)
      : await db.select().from(payments).where(and(eq(payments.externalId, ev.externalId), eq(payments.provider, p.name))).limit(1);
    if (!pay) return c.json({ ok: true, ignored: true }); // бізде жоқ төлем — 200, провайдер қайта жібермесін
    const res = await applyEvent(db, cfg, p, pay, ev);
    return res.ok ? c.json({ ok: true }) : c.json({ ok: false, error: res.error }, res.status);
  });
  return r;
}
