// B4 · Сыйлық, мерзімді ұзарту, қайтару, бағалау. (Қайта алу мен көшіру — POST /v1/purchases {fromPackId}.)
// Ережелер (14-құжат): сыйлық 7 күн ішінде қабылданбаса — пакет жіберушіге қайтады; 30 күн мерзімі алушы қабылдаған сәттен басталады.
// Ұзарту: 7 күн — мекеменің бір реттік тегін мүмкіндігі, 14 күн — 1 000 ₸, 30 күн — 2 000 ₸ (баға серверде).
// Қайтару: src/refund.ts (карта бөлігі провайдер арқылы, бонус бөлігі бонусқа, сыйлықты тек беруші).
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { and, avg, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { Notifier } from "../notify.js";
import { gifts, offers, packEvents, packs, paymentCards, payments, ratings, receipts, users, venues } from "../db/schema.js";
import { CardBody, GIFT_DAYS, paymentReply, resolveCard, saveCard } from "./purchases.js";
import { paymentProvider } from "../payments/index.js";
import { PaymentError } from "../payments/types.js";
import { refundPack, RefundError } from "../refund.js";
import { getSettings } from "../settings.js";

export const EXTEND = [{ days: 7, price: 0 }, { days: 14, price: 1000 }, { days: 30, price: 2000 }] as const;
class B4Error extends Error { constructor(public code: string, public status: 400 | 404 | 409 = 409) { super(code); } }
const almaty = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Клиент бұл пакетті осы уақытқа дейін неше күнге ұзартты (Басқару мен шағым бойынша ұзарту есептелмейді) */
export async function extendedDays(q: Db | Tx, packId: string): Promise<number> {
  const [x] = (await q.execute(sql`select coalesce(sum((meta->>'days')::int), 0)::int as d from app.pack_events where pack_id = ${packId} and type = 'extend' and meta->>'via' is null`)).rows as { d: number }[];
  return Number(x?.d ?? 0);
}

export function b4Routes(cfg: Config, db: Db, notify?: Notifier) {
  const r = new Hono<Env>();
  const fail = (c: Context<Env>, e: unknown) => { if (e instanceof B4Error) return c.json({ ok: false, error: e.code }, e.status); throw e; };

  // ── Бағалау: жұлдыз мекеменің рейтингіне және соңғы қолдану чегінің ішкі бөлігіне жазылады ──
  const Rate = z.object({ packId: z.string().uuid(), stars: z.number().int().min(1).max(5), tags: z.array(z.string().max(30)).max(8).default([]), text: z.string().max(500).optional() }).strict();
  r.post("/ratings", async (c) => {
    const b = Rate.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const user = c.get("user");
    const [p] = await db.select({ p: packs, o: offers }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id)).where(and(eq(packs.id, b.data.packId), eq(packs.userId, user.id))).limit(1);
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    // Баға тек нақты қызмет алғаннан кейін (Патша, 2026-11-18): кем дегенде бір қолдану не орындалған тапсырыс
    const [{ used }] = (await db.execute(sql`select (exists (select 1 from app.redemptions where pack_id = ${p.p.id} and cancelled_at is null)
      or exists (select 1 from app.orders where pack_id = ${p.p.id} and status = 'done')) as used`)).rows as { used: boolean }[];
    if (!used) return c.json({ ok: false, error: "not_used_yet" }, 409);
    // Белгілер бөлек (ұсыныс бетінде чип), мәтін — клиент жазғаны ғана. Мекемеге хабарламада екеуі бірге
    const tags = [...new Set(b.data.tags.map((x) => x.trim()).filter(Boolean))];
    const text = b.data.text?.trim() || null;
    // Бір пакетке — бір баға: қайта бағаласа, бұрынғысы ауыстырылады (рейтингті бір адам шексіз «құлата» алмайды)
    const [prev] = await db.select({ id: ratings.id }).from(ratings).where(and(eq(ratings.userId, user.id), eq(ratings.packId, p.p.id))).limit(1);
    if (prev) await db.update(ratings).set({ stars: b.data.stars, text, tags }).where(eq(ratings.id, prev.id));
    else await db.insert(ratings).values({ userId: user.id, venueId: p.o.venueId, packId: p.p.id, stars: b.data.stars, text, tags }).onConflictDoNothing();
    await db.execute(sql`update app.receipts set internal = jsonb_set(internal, '{rating}', ${JSON.stringify({ stars: b.data.stars, tags: b.data.tags, text: b.data.text ?? null, at: new Date() })}::jsonb)
      where id = (select id from app.receipts where pack_id = ${p.p.id} and kind in ('use','order') order by created_at desc limit 1)`);
    const [agg] = await db.select({ a: avg(ratings.stars), n: count() }).from(ratings).where(eq(ratings.venueId, p.o.venueId));
    await db.update(venues).set({ rating: Math.round(Number(agg.a) * 10) / 10, reviewsCount: Number(agg.n) }).where(eq(venues.id, p.o.venueId));
    if (!prev) await notify?.review(p.o.venueId, b.data.stars, [tags.join(", "), text].filter(Boolean).join(" — ") || null);
    return c.json({ ok: true, updated: Boolean(prev), venueRating: Math.round(Number(agg.a) * 10) / 10 });
  });

  // ── Мерзімді ұзарту ──
  // Карта (сақталған id не жаңа картаның криптограммасы) — ақылы ұзарту нақты төлем ағынымен (3-D Secure, вебхук); картасыз — сынақ режимі
  const Extend = z.object({ days: z.union([z.literal(7), z.literal(14), z.literal(30)]), idempotencyKey: z.string().min(8).max(64),
    card: CardBody.optional() }).strict();
  r.post("/packs/:id/extend", async (c) => {
    const b = Extend.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const user = c.get("user"); const opt = EXTEND.find((x) => x.days === b.data.days)!;
    const packId = c.req.param("id");
    // Қайталанған сұрау (сол кілт) — бұрынғы төлемнің нәтижесі
    const [prev] = await db.select().from(payments).where(and(eq(payments.userId, user.id), eq(payments.idempotencyKey, b.data.idempotencyKey))).limit(1);
    if (prev) return c.json(...(await paymentReply(db, user.id, prev, true)));
    // Ұзарту шегі: ақша алынбай тұрып тексеріледі (төлеп қойып, кейін қате алмасын)
    const maxDays = (await getSettings(db)).extendMaxDays;
    const usedDays = await extendedDays(db, packId);
    if (usedDays + opt.days > maxDays) return c.json({ ok: false, error: "extend_limit", left: Math.max(0, maxDays - usedDays), max: maxDays }, 409);
    if (opt.price > 0 && b.data.card) {
      const [p] = await db.select({ p: packs, o: offers }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id)).where(and(eq(packs.id, packId), eq(packs.userId, user.id))).limit(1);
      if (!p) return c.json({ ok: false, error: "not_found" }, 404);
      if (p.p.status !== "active" && p.p.status !== "expired") return c.json({ ok: false, error: "pack_" + p.p.status }, 409);
      if (p.p.unitsLeft < 1) return c.json({ ok: false, error: "no_units" }, 409);
      const rc = await resolveCard(db, cfg, user.id, b.data.card);
      if ("error" in rc) return c.json({ ok: false, error: rc.error }, rc.status);
      const { provider, card } = rc;
      const [pay] = await db.insert(payments).values({ userId: user.id, packId, provider: provider.name, method: "card", amount: opt.price, status: "created", idempotencyKey: b.data.idempotencyKey,
        meta: { kind: "extend", days: opt.days, price: opt.price, methodLabel: card.label ?? "Банк картасы" }, cardId: card.id ?? null }).returning();
      let res: Awaited<ReturnType<typeof provider.charge>>;
      try {
        res = await provider.charge({ paymentId: pay.id, orderNo: pay.no, amount: opt.price, description: `Medeo · мерзімді ұзарту +${opt.days} күн`, user: { id: user.id, telegramId: user.telegramId },
          card: { token: card.token, cryptogram: card.cryptogram, save: card.save, hosted: card.hosted, qr: card.qr }, returnUrl: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=pay_${pay.id}` });
      } catch (e) { res = { status: "failed", reason: e instanceof PaymentError && e.code === "bad_card" ? "declined" : "provider_error" }; }
      if (res.status === "failed") {
        await db.update(payments).set({ status: "failed", failure: res.reason, externalId: res.externalId ?? null }).where(eq(payments.id, pay.id));
        return c.json({ ok: false, error: "payment_failed", reason: res.reason, paymentId: pay.id }, 402);
      }
      await db.update(payments).set({ externalId: res.externalId, status: res.status === "paid" ? "created" : "pending" }).where(eq(payments.id, pay.id));
      if (res.status === "action_required") {
        await db.execute(sql`update app.payments set meta = meta || ${JSON.stringify({ confirmUrl: res.confirmUrl, ...(res.qr ? { qr: res.qr } : {}) })}::jsonb where id = ${pay.id}`);
        return c.json({ ok: true, status: "action_required", paymentId: pay.id, confirmUrl: res.confirmUrl, ...(res.qr ? { qr: res.qr } : {}) }, 202);
      }
      if (res.card) await saveCard(db, provider.name, user.id, res.card);
      const out = await finalizeExtend(db, cfg, pay.id);
      if ("error" in out) return fail(c, new B4Error(out.error));
      const [fresh] = await db.select().from(payments).where(eq(payments.id, pay.id));
      return c.json(...(await paymentReply(db, user.id, fresh)));
    }
    try {
      const out = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select p.*, o.venue_id as "venueId", o.title from app.packs p join app.offers o on o.id = p.offer_id where p.id = ${packId} and p.user_id = ${user.id} for update of p`);
        const p = res.rows[0] as { id: string; status: string; units_left: number; valid_until: Date; free_extend_used: boolean; venueId: string; title: string } | undefined;
        if (!p) throw new B4Error("not_found", 404);
        if (p.status !== "active" && p.status !== "expired") throw new B4Error("pack_" + p.status);
        if (p.units_left < 1) throw new B4Error("no_units");
        if (opt.price === 0 && p.free_extend_used) throw new B4Error("free_used");
        if ((await extendedDays(tx, p.id)) + opt.days > maxDays) throw new B4Error("extend_limit"); // бұғаттан кейін қайта тексеру (қатар екі сұрау)
        if (opt.price && cfg.PAYMENTS_MODE === "live") throw new B4Error("payment_method_unavailable"); // нақты режимде ақылы ұзарту тек картамен (жоғарыдағы карта жолы)
        const [pay] = opt.price ? await tx.insert(payments).values({ userId: user.id, packId: p.id, provider: cfg.PAYMENTS_MODE, method: "test", amount: opt.price, status: "paid", paidAt: new Date(), externalId: "test_" + randomUUID(), idempotencyKey: b.data.idempotencyKey }).returning() : [undefined];
        return applyExtend(tx, p, opt.days, opt.price, pay?.id ?? null);
      });
      return c.json({ ok: true, ...out });
    } catch (e) { return fail(c, e); }
  });

  // ── Автожаңарту (src/autoRenew.ts): клиент өзі қосады/өшіреді; қосу үшін сақталған карта керек. Келісім уақыты жазылады. ──
  const Renew = z.object({ on: z.boolean(), cardId: z.string().uuid().optional() }).strict();
  r.post("/packs/:id/auto-renew", async (c) => {
    const b = Renew.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const user = c.get("user");
    const [p] = await db.select().from(packs).where(and(eq(packs.id, c.req.param("id")), eq(packs.userId, user.id))).limit(1);
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    if (!b.data.on) {
      await db.update(packs).set({ autoRenew: false }).where(eq(packs.id, p.id));
      await db.insert(packEvents).values({ packId: p.id, type: "auto_renew_off", meta: {} });
      return c.json({ ok: true, autoRenew: false });
    }
    if (!["active", "used", "expired"].includes(p.status) || p.renewedTo) return c.json({ ok: false, error: "pack_" + p.status }, 409);
    // Біткен пакетте қосуға болмайды (бірден ақша алынып кетер еді) — оны «Қайта алу» арқылы аласыз
    if (p.unitsLeft < 1 || p.validUntil.getTime() < Date.now()) return c.json({ ok: false, error: "pack_finished" }, 409);
    if (!b.data.cardId) return c.json({ ok: false, error: "card_required" }, 400);
    const [pc] = await db.select().from(paymentCards).where(and(eq(paymentCards.id, b.data.cardId), eq(paymentCards.userId, user.id), isNull(paymentCards.removedAt))).limit(1);
    if (!pc) return c.json({ ok: false, error: "card_not_found" }, 404);
    const at = new Date();
    await db.update(packs).set({ autoRenew: true, autoRenewCard: pc.id, autoRenewAt: at }).where(eq(packs.id, p.id));
    await db.insert(packEvents).values({ packId: p.id, type: "auto_renew_on", meta: { cardId: pc.id, at, ua: c.req.header("user-agent") ?? null } });
    return c.json({ ok: true, autoRenew: true, card: `${pc.brand} •• ${pc.last4}` });
  });

  // ── Қайтару (толық, қолданылмаған пакет): карта бөлігі — провайдер арқылы, бонус бөлігі — бонусқа (src/refund.ts) ──
  r.post("/packs/:id/refund", async (c) => {
    try { return c.json({ ok: true, ...(await refundPack(db, cfg, c.get("user").id, c.req.param("id"))) }); }
    catch (e) { if (e instanceof RefundError) return c.json({ ok: false, error: e.code }, e.status); throw e; }
  });

  // ── Сыйлық ──
  /** Мерзімі өткен сыйлықты жіберушіге қайтарады (қабылданбаған күйде). */
  async function expireGift(id: string) {
    await db.transaction(async (tx) => {
      const res = await tx.execute(sql`select * from app.gifts where id = ${id} for update`);
      const g = res.rows[0] as { id: string; status: string; expires_at: Date; pack_id: string } | undefined;
      if (!g || g.status !== "sent" || new Date(g.expires_at).getTime() > Date.now()) return;
      await tx.update(gifts).set({ status: "returned" }).where(eq(gifts.id, g.id));
      const [o] = await tx.select({ d: offers.validDays }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id)).where(eq(packs.id, g.pack_id));
      await tx.update(packs).set({ status: "active", validUntil: new Date(Date.now() + o.d * 86400_000) }).where(eq(packs.id, g.pack_id));
      await tx.insert(packEvents).values({ packId: g.pack_id, type: "gift_returned", meta: { giftId: g.id } });
    });
  }

  r.get("/gifts", async (c) => {
    const u = c.get("user");
    const rows = await db.select({ g: gifts, o: offers, v: venues, from: users }).from(gifts).innerJoin(packs, eq(gifts.packId, packs.id)).innerJoin(offers, eq(packs.offerId, offers.id))
      .innerJoin(venues, eq(offers.venueId, venues.id)).innerJoin(users, eq(gifts.fromUserId, users.id)).where(or(eq(gifts.fromUserId, u.id), eq(gifts.toUserId, u.id))).orderBy(desc(gifts.createdAt));
    for (const x of rows) if (x.g.status === "sent" && x.g.expiresAt.getTime() < Date.now()) { await expireGift(x.g.id); x.g.status = "returned"; }
    return c.json({ ok: true, gifts: rows.map((x) => ({ id: x.g.id, code: x.g.code, dir: x.g.fromUserId === u.id ? "sent" : "got", status: x.g.status, title: x.o.title, venue: x.v.name,
      from: x.g.anonymous && x.g.fromUserId !== u.id ? null : x.from.firstName, message: x.g.message, expiresAt: x.g.expiresAt, createdAt: x.g.createdAt })) });
  });

  r.get("/gifts/:code", async (c) => {
    const [x] = await db.select({ g: gifts, o: offers, v: venues, from: users }).from(gifts).innerJoin(packs, eq(gifts.packId, packs.id)).innerJoin(offers, eq(packs.offerId, offers.id))
      .innerJoin(venues, eq(offers.venueId, venues.id)).innerJoin(users, eq(gifts.fromUserId, users.id)).where(eq(gifts.code, c.req.param("code"))).limit(1);
    if (!x) return c.json({ ok: false, error: "not_found" }, 404);
    if (x.g.status === "sent" && x.g.expiresAt.getTime() < Date.now()) { await expireGift(x.g.id); x.g.status = "returned"; }
    return c.json({ ok: true, gift: { code: x.g.code, status: x.g.status, title: x.o.title, offerSlug: x.o.slug, venue: x.v.name, units: x.o.units, validDays: x.o.validDays,
      from: x.g.anonymous ? null : x.from.firstName, message: x.g.message, expiresAt: x.g.expiresAt, mine: x.g.fromUserId === c.get("user").id,
      toUsername: x.g.toUsername, forMe: !x.g.toUsername || x.g.toUsername === (c.get("user").username ?? "").toLowerCase() } });
  });

  r.post("/gifts/:code/accept", async (c) => {
    const u = c.get("user");
    try {
      const out = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select * from app.gifts where code = ${c.req.param("code")} for update`);
        const g = res.rows[0] as { id: string; status: string; expires_at: Date; pack_id: string; from_user_id: string; to_username: string | null } | undefined;
        if (!g) throw new B4Error("not_found", 404);
        if (g.from_user_id === u.id) throw new B4Error("own_gift");
        if (g.to_username && g.to_username !== (u.username ?? "").toLowerCase()) throw new B4Error("not_for_you");
        if (g.status !== "sent") throw new B4Error("gift_" + g.status);
        if (new Date(g.expires_at).getTime() < Date.now()) throw new B4Error("gift_expired");
        const [o] = await tx.select({ d: offers.validDays }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id)).where(eq(packs.id, g.pack_id));
        const until = new Date(Date.now() + o.d * 86400_000); // мерзім алушы қабылдаған сәттен
        await tx.update(gifts).set({ status: "accepted", toUserId: u.id }).where(eq(gifts.id, g.id));
        await tx.update(packs).set({ userId: u.id, status: "active", validUntil: until, source: "gift" }).where(eq(packs.id, g.pack_id));
        await tx.insert(packEvents).values({ packId: g.pack_id, type: "gift_accepted", meta: { giftId: g.id, from: g.from_user_id, to: u.id } });
        return { packId: g.pack_id, validUntil: until };
      });
      return c.json({ ok: true, ...out });
    } catch (e) { return fail(c, e); }
  });

  r.post("/gifts/:code/cancel", async (c) => {
    const u = c.get("user");
    try {
      await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select * from app.gifts where code = ${c.req.param("code")} and from_user_id = ${u.id} for update`);
        const g = res.rows[0] as { id: string; status: string; pack_id: string } | undefined;
        if (!g) throw new B4Error("not_found", 404);
        if (g.status !== "sent") throw new B4Error("gift_" + g.status);
        const [o] = await tx.select({ d: offers.validDays }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id)).where(eq(packs.id, g.pack_id));
        await tx.update(gifts).set({ status: "cancelled" }).where(eq(gifts.id, g.id));
        await tx.update(packs).set({ status: "active", validUntil: new Date(Date.now() + o.d * 86400_000) }).where(eq(packs.id, g.pack_id));
        await tx.insert(packEvents).values({ packId: g.pack_id, type: "gift_cancelled", meta: { giftId: g.id } });
      });
      return c.json({ ok: true });
    } catch (e) { return fail(c, e); }
  });

  return r;
}
export { GIFT_DAYS };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Ұзартуды қолдану (транзакция ішінде): мерзім, тарих, чек */
async function applyExtend(tx: Tx, p: { id: string; valid_until: Date; free_extend_used: boolean; venueId: string; title: string }, days: number, price: number, paymentId: string | null) {
  const base = Math.max(Date.now(), new Date(p.valid_until).getTime());
  const until = new Date(base + days * 86400_000);
  await tx.update(packs).set({ validUntil: until, status: "active", freeExtendUsed: p.free_extend_used || price === 0 }).where(eq(packs.id, p.id));
  await tx.insert(packEvents).values({ packId: p.id, type: "extend", meta: { days, price, until, paymentId } });
  const now = new Date();
  const [rc] = await tx.insert(receipts).values({ kind: "extend", userId: (await tx.select({ u: packs.userId }).from(packs).where(eq(packs.id, p.id)))[0].u, packId: p.id, paymentId, venueId: p.venueId, total: price,
    public: { title: "Мерзімі ұзартылды", status: price ? "Төленді" : "Тегін", dateLocal: almaty(now), item: { title: p.title, days }, newUntil: almaty(until) },
    internal: { version: 1, days, price, free: price === 0, oldUntil: p.valid_until, newUntil: until, paymentId, status: { current: "done", history: [{ status: "done", at: now }] } } }).returning();
  return { validUntil: until, receipt: { id: rc.id, no: "MD-" + rc.no } };
}

/** Карта арқылы ұзарту расталды (бірден, 3-D Secure-ден кейін не вебхукпен). Идемпотентті. */
export async function finalizeExtend(db: Db, cfg: Config, paymentId: string): Promise<{ validUntil: Date } | { error: string }> {
  void cfg;
  return db.transaction(async (tx) => {
    const lk = (await tx.execute(sql`select id, status, pack_id, meta from app.payments where id = ${paymentId} for update`)).rows[0] as { id: string; status: string; pack_id: string; meta: { days: number; price: number } } | undefined;
    if (!lk) return { error: "not_found" };
    if (lk.status === "failed") return { error: "payment_failed" };
    const res = await tx.execute(sql`select p.*, o.venue_id as "venueId", o.title from app.packs p join app.offers o on o.id = p.offer_id where p.id = ${lk.pack_id} for update of p`);
    const p = res.rows[0] as { id: string; valid_until: Date; free_extend_used: boolean; venueId: string; title: string };
    if (lk.status === "paid") return { validUntil: p.valid_until };
    await tx.update(payments).set({ status: "paid", paidAt: new Date() }).where(eq(payments.id, lk.id));
    const out = await applyExtend(tx, p, lk.meta.days, lk.meta.price, lk.id);
    return { validUntil: out.validUntil };
  });
}
