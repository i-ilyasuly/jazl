// B4 · Сыйлық, мерзімді ұзарту, қайтару, бағалау. (Қайта алу мен көшіру — POST /v1/purchases {fromPackId}.)
// Ережелер (14-құжат): сыйлық 7 күн ішінде қабылданбаса — пакет жіберушіге қайтады; 30 күн мерзімі алушы қабылдаған сәттен басталады.
// Ұзарту: 7 күн — мекеменің бір реттік тегін мүмкіндігі, 14 күн — 1 000 ₸, 30 күн — 2 000 ₸ (баға серверде).
// Қайтару: пакеттен бір де бірлік жұмсалмаса және сатып алғанына 14 күн толмаса — толық қайтарылады.
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { and, avg, count, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { gifts, offers, packEvents, packs, payments, ratings, receipts, users, venues } from "../db/schema.js";
import { GIFT_DAYS } from "./purchases.js";

export const EXTEND = [{ days: 7, price: 0 }, { days: 14, price: 1000 }, { days: 30, price: 2000 }] as const;
const REFUND_DAYS = 14;
class B4Error extends Error { constructor(public code: string, public status: 400 | 404 | 409 = 409) { super(code); } }
const almaty = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function b4Routes(cfg: Config, db: Db) {
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
    const text = [b.data.tags.join(", "), b.data.text].filter(Boolean).join(" — ") || null;
    await db.insert(ratings).values({ userId: user.id, venueId: p.o.venueId, packId: p.p.id, stars: b.data.stars, text });
    await db.execute(sql`update app.receipts set internal = jsonb_set(internal, '{rating}', ${JSON.stringify({ stars: b.data.stars, tags: b.data.tags, text: b.data.text ?? null, at: new Date() })}::jsonb)
      where id = (select id from app.receipts where pack_id = ${p.p.id} and kind in ('use','order') order by created_at desc limit 1)`);
    const [agg] = await db.select({ a: avg(ratings.stars), n: count() }).from(ratings).where(eq(ratings.venueId, p.o.venueId));
    await db.update(venues).set({ rating: Math.round(Number(agg.a) * 10) / 10, reviewsCount: Number(agg.n) }).where(eq(venues.id, p.o.venueId));
    return c.json({ ok: true, venueRating: Math.round(Number(agg.a) * 10) / 10 });
  });

  // ── Мерзімді ұзарту ──
  const Extend = z.object({ days: z.union([z.literal(7), z.literal(14), z.literal(30)]), idempotencyKey: z.string().min(8).max(64) }).strict();
  r.post("/packs/:id/extend", async (c) => {
    const b = Extend.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const user = c.get("user"); const opt = EXTEND.find((x) => x.days === b.data.days)!;
    try {
      const out = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select p.*, o.venue_id as "venueId", o.title from app.packs p join app.offers o on o.id = p.offer_id where p.id = ${c.req.param("id")} and p.user_id = ${user.id} for update of p`);
        const p = res.rows[0] as { id: string; status: string; units_left: number; valid_until: Date; free_extend_used: boolean; venueId: string; title: string } | undefined;
        if (!p) throw new B4Error("not_found", 404);
        if (p.status !== "active" && p.status !== "expired") throw new B4Error("pack_" + p.status);
        if (p.units_left < 1) throw new B4Error("no_units");
        if (opt.price === 0 && p.free_extend_used) throw new B4Error("free_used");
        const base = Math.max(Date.now(), new Date(p.valid_until).getTime());
        const until = new Date(base + opt.days * 86400_000);
        const [pay] = opt.price ? await tx.insert(payments).values({ userId: user.id, packId: p.id, provider: cfg.PAYMENTS_MODE, method: "test", amount: opt.price, status: "paid", paidAt: new Date(), externalId: "test_" + randomUUID(), idempotencyKey: b.data.idempotencyKey }).returning() : [undefined];
        await tx.update(packs).set({ validUntil: until, status: "active", freeExtendUsed: p.free_extend_used || opt.price === 0 }).where(eq(packs.id, p.id));
        await tx.insert(packEvents).values({ packId: p.id, type: "extend", meta: { days: opt.days, price: opt.price, until } });
        const now = new Date();
        const [rc] = await tx.insert(receipts).values({ kind: "extend", userId: user.id, packId: p.id, paymentId: pay?.id, venueId: p.venueId, total: opt.price,
          public: { title: "Мерзімі ұзартылды", status: opt.price ? "Төленді" : "Тегін", dateLocal: almaty(now), item: { title: p.title, days: opt.days }, newUntil: almaty(until) },
          internal: { version: 1, days: opt.days, price: opt.price, free: opt.price === 0, oldUntil: p.valid_until, newUntil: until, paymentId: pay?.id ?? null, status: { current: "done", history: [{ status: "done", at: now }] } } }).returning();
        return { validUntil: until, receipt: { id: rc.id, no: "JZ-" + rc.no } };
      });
      return c.json({ ok: true, ...out });
    } catch (e) { return fail(c, e); }
  });

  // ── Қайтару (толық, қолданылмаған пакет) ──
  r.post("/packs/:id/refund", async (c) => {
    const user = c.get("user");
    try {
      const out = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select p.*, o.venue_id as "venueId", o.title from app.packs p join app.offers o on o.id = p.offer_id where p.id = ${c.req.param("id")} and p.user_id = ${user.id} for update of p`);
        const p = res.rows[0] as { id: string; status: string; units_left: number; units_total: number; price_paid: number; created_at: Date; venueId: string; title: string } | undefined;
        if (!p) throw new B4Error("not_found", 404);
        if (p.status !== "active") throw new B4Error("pack_" + p.status);
        if (p.units_left !== p.units_total) throw new B4Error("units_used");
        if (Date.now() - new Date(p.created_at).getTime() > REFUND_DAYS * 86400_000) throw new B4Error("too_late");
        await tx.update(packs).set({ status: "refunded", unitsLeft: 0 }).where(eq(packs.id, p.id));
        await tx.execute(sql`update app.payments set status = 'refunded' where pack_id = ${p.id} and status = 'paid'`);
        await tx.insert(packEvents).values({ packId: p.id, type: "refund", unitsDelta: -p.units_left, meta: { amount: p.price_paid } });
        const now = new Date();
        const [rc] = await tx.insert(receipts).values({ kind: "refund", userId: user.id, packId: p.id, venueId: p.venueId, total: -p.price_paid,
          public: { title: "Ақша қайтарылды", status: "Қайтарылды", dateLocal: almaty(now), item: { title: p.title, units: p.units_total }, note: "Ақша төлем тәсіліңе 1–3 жұмыс күнінде түседі" },
          internal: { version: 1, amount: p.price_paid, reason: "unused_within_" + REFUND_DAYS + "d", status: { current: "refunded", history: [{ status: "refunded", at: now }] } } }).returning();
        return { refunded: p.price_paid, receipt: { id: rc.id, no: "JZ-" + rc.no } };
      });
      return c.json({ ok: true, ...out });
    } catch (e) { return fail(c, e); }
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
      from: x.g.anonymous ? null : x.from.firstName, message: x.g.message, expiresAt: x.g.expiresAt, mine: x.g.fromUserId === c.get("user").id } });
  });

  r.post("/gifts/:code/accept", async (c) => {
    const u = c.get("user");
    try {
      const out = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select * from app.gifts where code = ${c.req.param("code")} for update`);
        const g = res.rows[0] as { id: string; status: string; expires_at: Date; pack_id: string; from_user_id: string } | undefined;
        if (!g) throw new B4Error("not_found", 404);
        if (g.from_user_id === u.id) throw new B4Error("own_gift");
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
