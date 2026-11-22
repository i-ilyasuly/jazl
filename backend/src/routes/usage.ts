// B3 · Пакетті қолдану: кассадағы QR (scan), қазір тапсырыс (order), жоспар/жазылу (plan); бас тарту; кассир растауы.
// Басты ереже: бірлік тек транзакция ішінде, пакет жолын бұғаттап (SELECT … FOR UPDATE) шегеріледі — екі сұрау қатар келсе де
// бір бірлік екі рет жұмсалмайды. Әр қолдануға чек (receipts.kind = use | order) жазылады: алу тәсілі, слот, код — ішкі бөлікте.
import { hmac, safeEqual, sigOk, signKey, verifyKeys } from "../secret.js";
import { onPackChanged } from "../bot/packCard.js";
import { createHash, randomInt } from "node:crypto";
import { Hono, type Context } from "hono";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { Notifier } from "../notify.js";
import { branches, offers, orders, packEvents, packs, qrSessions, receipts, redemptions, users, venueStaff, venues } from "../db/schema.js";
import { stickerUrl } from "./sticker.js";
import { makeDynamicQr, makeSessionQr, parseQr } from "../qr.js";
import { branchStatus } from "../hours.js";
import { inOffPeak, type OffPeakT } from "../offpeak.js";
import { takeValue, unitPrice as unitPriceOf } from "../value.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type User = typeof users.$inferSelect;
const almaty = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const FREE_CANCEL_MS = 2 * 3600_000;

export const branchQr = (cfg: Config, branchId: string) => `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=br_${branchId}`;

class UseError extends Error { constructor(public code: string, public status: 400 | 404 | 409 = 409, public extra: Record<string, unknown> = {}) { super(code); } }

/** Пакеттен n бірлік алады (жолды бұғаттап). Қате болса UseError. check — бұғаттан кейінгі қосымша тексеру (мекеме, сома).
 *  amount — осы бірліктердің құны (value.ts: көшірілген құн ескеріледі, қалдық тиын соңғы бірлікке), feePct — сол сәттегі Medeo комиссиясы. */
async function takeUnit(tx: Tx, packId: string, userId: string, n: number, defFee: number, check?: (p: { venueId: string; offerId: string; unitPrice: number; units_left: number; planOnly: boolean; offPeak: OffPeakT | null }) => void) {
  const res = await tx.execute(sql`select p.*, o.venue_id as "venueId", o.title, o.unit_name as "unitName", o.slug, coalesce((o.rules->>'planOnly')::boolean, false) as "planOnly", o.rules->'branches' as "onlyBranches",
      coalesce(v.fee_pct, v.auto_fee_pct, ${defFee})::int as "feePct"
    from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where p.id = ${packId} and p.user_id = ${userId} for update of p`);
  const p = res.rows[0] as { id: string; offer_id: string; units_left: number; units_total: number; price_paid: number; value_total: number; off_peak: OffPeakT | null; valid_until: Date; status: string; venueId: string; title: string; unitName: string; slug: string; planOnly: boolean; feePct: number; onlyBranches: string[] | null } | undefined;
  if (!p) throw new UseError("pack_not_found", 404);
  if (p.status !== "active") throw new UseError("pack_" + p.status);
  if (new Date(p.valid_until).getTime() < Date.now()) throw new UseError("pack_expired");
  const unitPrice = unitPriceOf(p.value_total, p.units_total);
  // Бос сағатпен алынған пакет әрқашан «тек жоспар бойынша» (мекеме кейін ережені өзгертсе де)
  check?.({ venueId: p.venueId, offerId: p.offer_id, unitPrice, units_left: p.units_left, planOnly: p.planOnly || Boolean(p.off_peak), offPeak: p.off_peak });
  if (p.units_left < n) throw new UseError("no_units", 409, { left: p.units_left });
  const left = p.units_left - n;
  const amount = takeValue(p.value_total, p.units_total, p.units_left, n);
  await tx.update(packs).set({ unitsLeft: left, status: left === 0 ? "used" : "active" }).where(eq(packs.id, packId));
  return { ...p, left, unitPrice, amount };
}

/** Көп филиал (2026-11-18, Тұран шешімі): ұсыныс тек таңдалған филиалдарда жүрсе (rules.branches), басқа филиалда қолданылмайды.
 *  Қате ішінде клиентке жарамды филиалдардың мекенжайлары беріледі. Транзакция ішінде шақырылады — қате болса бірлік қайтады. */
async function assertBranch(tx: Tx, only: string[] | null, branchId: string) {
  if (!Array.isArray(only) || !only.length || only.includes(branchId)) return;
  const rows = await tx.select({ address: branches.address }).from(branches).where(and(inArray(branches.id, only), eq(branches.active, true))).orderBy(branches.createdAt);
  throw new UseError("other_branch", 409, { branches: rows.map((r) => r.address) });
}

function meta(c: Context<Env>, user: User) {
  const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim();
  return {
    customer: { firstName: user.firstName, lastName: user.lastName, fullName: [user.firstName, user.lastName].filter(Boolean).join(" "), username: user.username ? "@" + user.username : null, phone: user.phone ?? null },
    client: { platform: c.req.header("x-tg-platform") ?? null, tgVersion: c.req.header("x-tg-version") ?? null, appVersion: c.req.header("x-app-version") ?? null, userAgent: c.req.header("user-agent") ?? null,
      ipHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null, authDate: c.get("auth").authDate },
  };
}

export function usageRoutes(cfg: Config, db: Db, notify?: Notifier) {
  const r = new Hono<Env>();
  const fail = (c: Context<Env>, e: unknown) => {
    if (e instanceof UseError) return c.json({ ok: false, error: e.code, ...e.extra }, e.status);
    throw e;
  };

  // ── Кассадағы QR ──────────────────────────────────────────────
  // QR-ды алдын ала тану: қай мекеме, неше дана, мерзімі өтпеді ме (клиент төлем парағында көрсетеді)
  // Кассир сеансы: пакет (ұсыныс), дана, мерзім, қолданылған ба
  const sessionOf = async (id: string) => (await db.select({ s: qrSessions, o: offers }).from(qrSessions).leftJoin(offers, eq(qrSessions.offerId, offers.id)).where(eq(qrSessions.id, id)).limit(1))[0];

  /** Жапсырма коды → филиал және мекемеде жапсырма режимі қосулы ма */
  const stickerBranch = async (code: string) => {
    const [x] = await db.select({ id: branches.id, en: venues.stickerEnabled }).from(branches).innerJoin(venues, eq(branches.venueId, venues.id)).where(eq(branches.stickerCode, code)).limit(1);
    return x ? { branchId: x.id, enabled: x.en } : undefined;
  };

  r.post("/qr/resolve", async (c) => {
    const raw = String((await c.req.json().catch(() => ({})))?.qr ?? "");
    const q = parseQr(raw, verifyKeys(cfg));
    if (!q) return c.json({ ok: false, error: "not_medeo_qr" }, 400);
    if (q.kind === "static" && cfg.PAYMENTS_MODE !== "test") return c.json({ ok: false, error: "static_qr_disabled" }, 400);
    const stk = q.kind === "sticker" ? await stickerBranch(q.code) : undefined;
    if (q.kind === "sticker" && !stk) return c.json({ ok: false, error: "branch_not_found" }, 404);
    if (stk && !stk.enabled && cfg.PAYMENTS_MODE !== "test") return c.json({ ok: false, error: "static_qr_disabled" }, 400);
    let branchId: string; let units: number | null = null; let offer: { slug: string; title: string } | null = null; let valid = true; let expired = false;
    if (q.kind === "session") {
      const ss = q.valid ? await sessionOf(q.sessionId) : undefined;
      if (!ss) return c.json({ ok: false, error: "bad_qr" }, 400);
      if (ss.s.redemptionId) return c.json({ ok: false, error: "qr_used" }, 409);
      if (ss.s.cancelledAt) return c.json({ ok: false, error: "qr_cancelled" }, 409);
      branchId = ss.s.branchId; units = ss.s.units; offer = ss.o ? { slug: ss.o.slug, title: ss.o.title } : null;
      expired = q.expired || ss.s.expiresAt.getTime() < Date.now();
    } else if (q.kind === "sticker") { branchId = stk!.branchId; }
    else { branchId = q.branchId; if (q.kind === "dynamic") { units = q.units; valid = q.valid; expired = q.expired; } }
    const [br] = await db.select({ b: branches, v: venues }).from(branches).innerJoin(venues, eq(branches.venueId, venues.id)).where(eq(branches.id, branchId)).limit(1);
    if (!br) return c.json({ ok: false, error: "branch_not_found" }, 404);
    return c.json({ ok: true, kind: q.kind === "session" ? "dynamic" : q.kind === "sticker" ? "static" : q.kind, sticker: q.kind === "sticker", venue: { slug: br.v.slug, name: br.v.name }, branch: { id: br.b.id, address: br.b.address },
      units, offer, amount: q.kind === "amount" ? q.amount : null, valid, expired });
  });

  // Сканер істемесе: кассир QR-ының астындағы 4 таңбалы код (30 с жарамды) → сол сеанстың QR-ы
  r.post("/qr/code", async (c) => {
    const code = String((await c.req.json().catch(() => ({})))?.code ?? "").replace(/\D/g, "");
    if (code.length !== 4) return c.json({ ok: false, error: "bad_request" }, 400);
    // 4 таңбалы код 30 с жарамды (+15 с шыдам: клиент енгізіп жатқанда жаңарып кетсе)
    const [ss] = await db.select().from(qrSessions).where(and(eq(qrSessions.code, code), gt(qrSessions.codeExp, new Date(Date.now() - 15_000)), gt(qrSessions.expiresAt, new Date()), isNull(qrSessions.redemptionId), isNull(qrSessions.cancelledAt))).orderBy(desc(qrSessions.createdAt)).limit(1);
    if (!ss) return c.json({ ok: false, error: "code_not_found" }, 404);
    return c.json({ ok: true, qr: makeSessionQr(signKey(cfg), ss.id).payload });
  });

  const Redeem = z.object({ packId: z.string().uuid(), qr: z.string().min(5).max(300), units: z.number().int().min(1).max(20).default(1), idempotencyKey: z.string().min(8).max(64) }).strict();
  r.post("/redeem", async (c) => {
    const b = Redeem.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const user = c.get("user");
    const q = parseQr(b.data.qr, verifyKeys(cfg));
    if (!q) return c.json({ ok: false, error: "not_medeo_qr" }, 400);
    if ((q.kind === "dynamic" || q.kind === "session") && !q.valid) return c.json({ ok: false, error: "bad_qr" }, 400);
    if ((q.kind === "dynamic" || q.kind === "session") && q.expired) return c.json({ ok: false, error: "qr_expired" }, 409);
    const ss = q.kind === "session" ? await sessionOf(q.sessionId) : undefined;
    if (q.kind === "session" && !ss) return c.json({ ok: false, error: "bad_qr" }, 400);
    if (q.kind === "static" && cfg.PAYMENTS_MODE !== "test") return c.json({ ok: false, error: "static_qr_disabled" }, 400);
    const stk = q.kind === "sticker" ? await stickerBranch(q.code) : undefined;
    if (q.kind === "sticker" && !stk) return c.json({ ok: false, error: "branch_not_found" }, 404);
    if (stk && !stk.enabled && cfg.PAYMENTS_MODE !== "test") return c.json({ ok: false, error: "static_qr_disabled" }, 400);
    const units = b.data.units;
    if (q.kind === "dynamic" && units !== q.units) return c.json({ ok: false, error: "units_mismatch", expectedUnits: q.units }, 409);
    if (ss && units !== ss.s.units) return c.json({ ok: false, error: "units_mismatch", expectedUnits: ss.s.units }, 409);
    const branchId = ss ? ss.s.branchId : stk ? stk.branchId : (q as { branchId: string }).branchId;
    const prev = await db.select().from(redemptions).where(and(eq(redemptions.packId, b.data.packId), eq(redemptions.idempotencyKey, b.data.idempotencyKey))).limit(1);
    if (prev[0]) { const [rc] = await db.select({ id: receipts.id, no: receipts.no }).from(receipts).where(and(eq(receipts.packId, b.data.packId), eq(receipts.kind, "use"), sql`${receipts.internal}->>'redemptionId' = ${prev[0].id}`)).limit(1); return c.json({ ok: true, repeated: true, receipt: rc ? { id: rc.id, no: "MD-" + rc.no } : null }); }
    const [br] = await db.select({ b: branches, v: venues }).from(branches).innerJoin(venues, eq(branches.venueId, venues.id)).where(eq(branches.id, branchId)).limit(1);
    if (!br || !br.b.active) return c.json({ ok: false, error: "branch_not_found" }, 404);
    const bs = branchStatus(br.b);
    if (!bs.open) return c.json({ ok: false, error: "branch_closed", venue: br.v.name }, 409); // Figma: жұмыс уақытынан тыс QR төлем қабылданбайды
    try {
      const out = await db.transaction(async (tx) => {
        // Сеанс бір рет қана төленеді: жолды бұғаттаймыз (екі клиент бір QR-ды қатар сканерлесе — біреуі ғана өтеді)
        if (ss) {
          const lk = (await tx.execute(sql`select redemption_id, cancelled_at, expires_at from app.qr_sessions where id = ${ss.s.id} for update`)).rows[0] as { redemption_id: string | null; cancelled_at: Date | null; expires_at: Date };
          if (lk.redemption_id) throw new UseError("qr_used");
          if (lk.cancelled_at) throw new UseError("qr_cancelled");
          if (new Date(lk.expires_at).getTime() < Date.now()) throw new UseError("qr_expired");
        }
        const p = await takeUnit(tx, b.data.packId, user.id, units, cfg.MEDEO_FEE_PCT, (x) => {
          if (x.venueId !== br.v.id) throw new UseError("other_venue", 409, { venue: br.v.name });
          // «Тек жоспар бойынша» ұсыныс: кассада QR-мен қолданылмайды — алдын ала жазылу/жоспар арқылы ғана
          if (x.planOnly) throw new UseError("plan_only", 409);
          if (ss?.o && x.offerId !== ss.o.id) throw new UseError("other_offer", 409, { offer: ss.o.title });
          if (q.kind === "amount") {
            // Банк терминалы: сома = дана × 1 бірлік бағасы болуы керек
            if (q.amount % x.unitPrice !== 0) throw new UseError("amount_mismatch", 409, { amount: q.amount, unitPrice: x.unitPrice });
            const k = q.amount / x.unitPrice;
            if (k !== units) throw new UseError("units_mismatch", 409, { expectedUnits: k, amount: q.amount, unitPrice: x.unitPrice });
          }
        });
        await assertBranch(tx, p.onlyBranches, branchId);
        const [rd] = await tx.insert(redemptions).values({ packId: p.id, branchId, units, idempotencyKey: b.data.idempotencyKey, cashierId: ss?.s.createdBy ?? null, amount: p.amount, feePct: p.feePct }).returning();
        if (ss) await tx.update(qrSessions).set({ redemptionId: rd.id }).where(eq(qrSessions.id, ss.s.id));
        await tx.insert(packEvents).values({ packId: p.id, type: "use", unitsDelta: -units, meta: { via: "scan", qr: q.kind, branchId, redemptionId: rd.id } });
        const now = new Date();
        const [rc] = await tx.insert(receipts).values({ kind: "use", userId: user.id, packId: p.id, venueId: br.v.id, branchId, total: p.amount,
          public: { title: units > 1 ? `${units} бірлік пайдаланылды` : "Бірлік пайдаланылды", status: "Расталды", dateLocal: almaty(now), seller: { name: br.v.name, address: br.b.address, bin: null },
            item: { title: p.title, units, unitName: p.unitName, pricePerUnit: p.unitPrice }, left: p.left, via: q.kind === "amount" ? "Банк терминалының QR-ы" : q.kind === "sticker" ? "Мекеме жапсырмасы" : "Кассадағы Medeo QR", extra: ss && ss.s.extra ? { amount: ss.s.extra, note: "кассада бөлек төленеді" } : null },
          internal: { version: 1, redemptionId: rd.id, ...meta(c, user), item: { title: p.title, units, unitName: p.unitName, packSlug: p.slug },
            fulfillment: { type: "scan", slot: null, code: null, branchId, qr: q.kind, qrAmount: q.kind === "amount" ? q.amount : null, sessionId: ss?.s.id ?? null, cashierId: ss?.s.createdBy ?? null, extra: ss?.s.extra ?? 0 }, status: { current: "done", history: [{ status: "done", at: now }] }, unitsLeftAfter: p.left, rating: null } }).returning();
        // Жапсырмамен қолданғанда клиент кассирге «тірі растау» экранын көрсетеді: уақыты мен мерзімі (5 мин) серверден
        return { left: p.left, units, receipt: { id: rc.id, no: "MD-" + rc.no }, rid: rd.id, ...(q.kind === "sticker" ? { confirm: { at: now.toISOString(), until: new Date(now.getTime() + 5 * 60_000).toISOString(), venue: br.v.name, address: br.b.address } } : {}) };
      });
      const { rid, ...res } = out;
      await notify?.used(rid, res.receipt.no);
      void onPackChanged(b.data.packId); // пакет картасындағы санақ жаңарады
      return c.json({ ok: true, repeated: false, ...res });
    } catch (e) { return fail(c, e); }
  });

  // ── Тапсырыс (қазір) және жоспар (күн/уақыт) ─────────────────────
  const Order = z.object({ packId: z.string().uuid(), type: z.enum(["now", "plan"]), branchId: z.string().uuid().optional(), scheduledAt: z.string().datetime().optional(), courier: z.boolean().optional(), idempotencyKey: z.string().min(8).max(64) }).strict();
  r.post("/orders", async (c) => {
    const b = Order.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const d = b.data; const user = c.get("user");
    const prev = await db.select().from(orders).where(and(eq(orders.userId, user.id), eq(orders.idempotencyKey, d.idempotencyKey))).limit(1);
    if (prev[0]) return c.json({ ok: true, repeated: true, order: orderDto(prev[0]) });
    const at = d.type === "plan" ? new Date(d.scheduledAt ?? "") : null;
    if (d.type === "plan" && (!at || isNaN(at.getTime()) || at.getTime() < Date.now() + 15 * 60_000)) return c.json({ ok: false, error: "bad_slot" }, 400);
    try {
      const out = await db.transaction(async (tx) => {
        const p = await takeUnit(tx, d.packId, user.id, 1, cfg.MEDEO_FEE_PCT, (x) => {
          if (x.planOnly && d.type === "now") throw new UseError("plan_only", 409);
          // Бос сағат пакеті: келу уақыты мекеменің бос терезесінде болуы керек
          if (x.offPeak && at && !inOffPeak(x.offPeak, at)) throw new UseError("off_peak_slot", 400, { window: x.offPeak });
        });
        if (at && at.getTime() > new Date(p.valid_until).getTime()) throw new UseError("slot_after_expiry", 400);
        const [v] = await tx.select().from(venues).where(eq(venues.id, p.venueId));
        if (d.type === "now" && !v.acceptsPreorder) throw new UseError("no_preorder");
        const only = Array.isArray(p.onlyBranches) && p.onlyBranches.length ? p.onlyBranches : null;
        const [br] = d.branchId ? await tx.select().from(branches).where(and(eq(branches.id, d.branchId), eq(branches.venueId, v.id)))
          : await tx.select().from(branches).where(and(eq(branches.venueId, v.id), eq(branches.active, true), only ? inArray(branches.id, only) : undefined)).orderBy(branches.createdAt).limit(1);
        if (!br) throw new UseError("branch_not_found", 404);
        await assertBranch(tx, only, br.id);
        const code = String(randomInt(1000, 10000));
        const [o] = await tx.insert(orders).values({ type: d.type, packId: p.id, userId: user.id, branchId: br.id, scheduledAt: at, code, courier: d.courier ?? false, idempotencyKey: d.idempotencyKey, amount: p.amount, feePct: p.feePct }).returning();
        await tx.insert(packEvents).values({ packId: p.id, type: d.type === "plan" ? "plan" : "order", unitsDelta: -1, meta: { orderId: o.id, orderNo: o.no, scheduledAt: at } });
        const now = new Date();
        const slot = at ? almaty(at) : "қазір (~15 мин)";
        const [rc] = await tx.insert(receipts).values({ kind: "order", userId: user.id, packId: p.id, venueId: v.id, branchId: br.id, total: p.amount,
          public: { title: d.type === "plan" ? (v.kind === "hair" ? "Жазылу расталды" : "Жоспарланды") : "Тапсырыс жіберілді", status: "Жіберілді", dateLocal: almaty(now),
            seller: { name: v.name, address: br.address, bin: null }, item: { title: p.title, units: 1, unitName: p.unitName, pricePerUnit: p.unitPrice },
            order: { no: o.no, slot, code, courier: o.courier }, left: p.left },
          internal: { version: 1, orderId: o.id, ...meta(c, user), item: { title: p.title, units: 1, unitName: p.unitName, packSlug: p.slug },
            fulfillment: { type: d.type === "plan" ? "plan" : "order", slot: at ?? "now", code, courier: o.courier, branchId: br.id },
            status: { current: "sent", history: [{ status: "sent", at: now }] }, unitsLeftAfter: p.left, rating: null } }).returning();
        return { order: orderDto(o), left: p.left, receipt: { id: rc.id, no: "MD-" + rc.no } };
      });
      await notify?.order(out.order.id);
      void onPackChanged(d.packId);
      return c.json({ ok: true, repeated: false, ...out });
    } catch (e) { return fail(c, e); }
  });

  r.get("/orders", async (c) => {
    const rows = await db.select({ o: orders, off: offers, v: venues, b: branches }).from(orders).innerJoin(packs, eq(orders.packId, packs.id)).innerJoin(offers, eq(packs.offerId, offers.id))
      .innerJoin(venues, eq(offers.venueId, venues.id)).innerJoin(branches, eq(orders.branchId, branches.id)).where(eq(orders.userId, c.get("user").id)).orderBy(desc(orders.createdAt)).limit(50);
    return c.json({ ok: true, orders: rows.map((x) => ({ ...orderDto(x.o), title: x.off.title, venue: x.v.name, address: x.b.address })) });
  });

  // Бас тарту: жоспарда — уақытқа 2 сағаттан көп қалса бірлік қайтады; тапсырыста — мекеме әлі қабылдамаса
  r.post("/orders/:id/cancel", async (c) => {
    const user = c.get("user"); const id = c.req.param("id");
    try {
      const out = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select * from app.orders where id = ${id} and user_id = ${user.id} for update`);
        const o = res.rows[0] as { id: string; type: string; status: string; scheduled_at: Date | null; pack_id: string; no: number } | undefined;
        if (!o) throw new UseError("not_found", 404);
        if (!["sent", "accepted"].includes(o.status)) throw new UseError("order_" + o.status);
        const free = o.type === "plan" ? o.scheduled_at !== null && new Date(o.scheduled_at).getTime() - Date.now() >= FREE_CANCEL_MS : o.status === "sent";
        if (!free) throw new UseError("too_late");
        await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o.id));
        await tx.execute(sql`update app.packs set units_left = units_left + 1, status = case when status = 'used' then 'active' else status end where id = ${o.pack_id}`);
        await tx.insert(packEvents).values({ packId: o.pack_id, type: "cancel", unitsDelta: 1, meta: { orderId: o.id, orderNo: o.no } });
        await tx.execute(sql`update app.receipts set internal = jsonb_set(jsonb_set(internal, '{status,current}', '"cancelled"'), '{status,history}', (internal->'status'->'history') || jsonb_build_object('status','cancelled','at', now())) where internal->>'orderId' = ${o.id}`);
        return { returned: 1 };
      });
      return c.json({ ok: true, ...out });
    } catch (e) { return fail(c, e); }
  });

  // ── Мекеме персоналы (кассир, менеджер, иесі) ─────────────────────
  const staffVenues = async (userId: string) => (await db.select({ venueId: venueStaff.venueId }).from(venueStaff).where(and(eq(venueStaff.userId, userId), eq(venueStaff.status, "active")))).map((x) => x.venueId);

  r.get("/venue/orders", async (c) => {
    const vs = await staffVenues(c.get("user").id);
    if (!vs.length) return c.json({ ok: false, error: "not_staff" }, 403);
    const rows = await db.select({ o: orders, off: offers, u: users, b: branches }).from(orders).innerJoin(packs, eq(orders.packId, packs.id)).innerJoin(offers, eq(packs.offerId, offers.id))
      .innerJoin(users, eq(orders.userId, users.id)).innerJoin(branches, eq(orders.branchId, branches.id))
      .where(and(inArray(branches.venueId, vs), inArray(orders.status, ["sent", "accepted", "ready"]), gt(orders.createdAt, new Date(Date.now() - 7 * 86400_000)))).orderBy(orders.scheduledAt, orders.createdAt);
    // Figma «Тапсырыстар» (14010:8161): мекеме тапсырыс кодын көреді — клиент айтқан кодпен салыстырады
    return c.json({ ok: true, orders: rows.map((x) => ({ id: x.o.id, no: x.o.no, type: x.o.type, status: x.o.status, scheduledAt: x.o.scheduledAt, courier: x.o.courier, title: x.off.title, customer: x.u.firstName, username: x.u.username, branch: x.b.address, branchId: x.b.id, createdAt: x.o.createdAt, code: x.o.code, slug: x.off.slug, doneAt: x.o.doneAt })) });
  });

  const Status = z.object({ status: z.enum(["accepted", "ready", "missed"]) }).strict();
  r.post("/venue/orders/:id/status", async (c) => {
    const b = Status.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const vs = await staffVenues(c.get("user").id);
    const [row] = await db.select({ o: orders, b: branches }).from(orders).innerJoin(branches, eq(orders.branchId, branches.id)).where(eq(orders.id, c.req.param("id"))).limit(1);
    if (!row || !vs.includes(row.b.venueId)) return c.json({ ok: false, error: "not_found" }, 404);
    await db.update(orders).set({ status: b.data.status }).where(eq(orders.id, row.o.id));
    if (b.data.status === "ready" && row.o.status !== "ready") await notify?.orderReady(row.o.id);
    return c.json({ ok: true });
  });

  // Кассир клиент айтқан 4 таңбалы кодты енгізеді → тапсырыс беріледі (done)
  const Verify = z.object({ code: z.string().regex(/^\d{4}$/) }).strict();
  r.post("/venue/orders/verify", async (c) => {
    const b = Verify.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const staff = c.get("user");
    const vs = await staffVenues(staff.id);
    if (!vs.length) return c.json({ ok: false, error: "not_staff" }, 403);
    const [row] = await db.select({ o: orders, off: offers, u: users }).from(orders).innerJoin(branches, eq(orders.branchId, branches.id)).innerJoin(packs, eq(orders.packId, packs.id))
      .innerJoin(offers, eq(packs.offerId, offers.id)).innerJoin(users, eq(orders.userId, users.id))
      .where(and(inArray(branches.venueId, vs), eq(orders.code, b.data.code), inArray(orders.status, ["sent", "accepted", "ready"]))).orderBy(desc(orders.createdAt)).limit(1);
    if (!row) return c.json({ ok: false, error: "code_not_found" }, 404);
    await db.update(orders).set({ status: "done", doneAt: new Date(), doneBy: staff.id }).where(eq(orders.id, row.o.id));
    await db.execute(sql`update app.receipts set internal = jsonb_set(jsonb_set(internal, '{status,current}', '"done"'), '{status,history}', (internal->'status'->'history') || jsonb_build_object('status','done','at', now(), 'by', ${staff.id}::text)) where internal->>'orderId' = ${row.o.id}`);
    return c.json({ ok: true, order: { no: row.o.no, title: row.off.title, customer: row.u.firstName, type: row.o.type } });
  });

  // Кассирге соңғы қолданулар (30 мин) және 10 минут ішінде бас тарту — клиент қате мекеме/дана растаса
  const CANCEL_MS = 10 * 60_000;
  r.get("/venue/redemptions", async (c) => {
    const vs = await staffVenues(c.get("user").id);
    if (!vs.length) return c.json({ ok: false, error: "not_staff" }, 403);
    const rows = await db.select({ rd: redemptions, off: offers, u: users, b: branches }).from(redemptions).innerJoin(branches, eq(redemptions.branchId, branches.id))
      .innerJoin(packs, eq(redemptions.packId, packs.id)).innerJoin(offers, eq(packs.offerId, offers.id)).innerJoin(users, eq(packs.userId, users.id))
      .where(and(inArray(branches.venueId, vs), gt(redemptions.createdAt, new Date(Date.now() - 30 * 60_000)))).orderBy(desc(redemptions.createdAt));
    return c.json({ ok: true, redemptions: rows.map((x) => ({ id: x.rd.id, units: x.rd.units, title: x.off.title, customer: x.u.firstName, username: x.u.username, branchId: x.b.id, at: x.rd.createdAt, cancelled: Boolean(x.rd.cancelledAt),
      canCancel: !x.rd.cancelledAt && Date.now() - x.rd.createdAt.getTime() < CANCEL_MS })) });
  });
  r.post("/venue/redemptions/:id/cancel", async (c) => {
    const staff = c.get("user");
    const vs = await staffVenues(staff.id);
    try {
      const out = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`select r.*, b.venue_id as "venueId" from app.redemptions r join app.branches b on b.id = r.branch_id where r.id = ${c.req.param("id")} for update of r`);
        const rd = res.rows[0] as { id: string; pack_id: string; units: number; created_at: Date; cancelled_at: Date | null; venueId: string } | undefined;
        if (!rd || !vs.includes(rd.venueId)) throw new UseError("not_found", 404);
        if (rd.cancelled_at) throw new UseError("already_cancelled");
        if (Date.now() - new Date(rd.created_at).getTime() > CANCEL_MS) throw new UseError("too_late");
        await tx.update(redemptions).set({ cancelledAt: new Date(), cancelledBy: staff.id }).where(eq(redemptions.id, rd.id));
        await tx.execute(sql`update app.packs set units_left = units_left + ${rd.units}, status = case when status = 'used' then 'active' else status end where id = ${rd.pack_id}`);
        await tx.insert(packEvents).values({ packId: rd.pack_id, type: "use_cancelled", unitsDelta: rd.units, meta: { redemptionId: rd.id, by: staff.id } });
        await tx.execute(sql`update app.receipts set internal = jsonb_set(jsonb_set(internal, '{status,current}', '"cancelled"'), '{status,history}', (internal->'status'->'history') || jsonb_build_object('status','cancelled','at', now(), 'by', ${staff.id}::text)) where internal->>'redemptionId' = ${rd.id}`);
        return { returned: rd.units };
      });
      return c.json({ ok: true, ...out });
    } catch (e) { return fail(c, e); }
  });

  // Филиалдың касса QR-ы (басып шығаруға): тек осы мекеменің персоналына
  r.get("/venue/branches/:id/qr", async (c) => {
    const vs = await staffVenues(c.get("user").id);
    const [br] = await db.select().from(branches).where(eq(branches.id, c.req.param("id"))).limit(1);
    if (!br || !vs.includes(br.venueId)) return c.json({ ok: false, error: "not_found" }, 404);
    // Жапсырма (Патша, 2026-11-22): тұрақты қысқа сілтеме — мекеме режимі қосулы болса ғана басып шығаруға береміз
    const [v] = await db.select({ en: venues.stickerEnabled }).from(venues).where(eq(venues.id, br.venueId)).limit(1);
    return c.json({ ok: true, qr: branchQr(cfg, br.id), address: br.address, sticker: v?.en && br.stickerCode ? stickerUrl(cfg, br.stickerCode) : null });
  });

  return r;
}

type OrderRow = typeof orders.$inferSelect;
const orderDto = (o: OrderRow) => ({ id: o.id, no: o.no, type: o.type, packId: o.packId, branchId: o.branchId, scheduledAt: o.scheduledAt, code: o.code, courier: o.courier, status: o.status, createdAt: o.createdAt });

/** Сынақ режиміндегі ашық маршрут: кассирсіз сынау үшін динамикалық не банк QR-ын жасайды (нақты режимде өшірулі). */
export function devQrRoutes(cfg: Config, db: Db) {
  const r = new Hono();
  r.post("/qr", async (c) => {
    if (cfg.PAYMENTS_MODE !== "test") return c.json({ ok: false, error: "disabled" }, 404);
    const b = z.object({ branchId: z.string().uuid(), units: z.number().int().min(1).max(20).default(1), amount: z.number().int().min(100).max(1_000_000).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [br] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, b.data.branchId)).limit(1);
    if (!br) return c.json({ ok: false, error: "not_found" }, 404);
    if (b.data.amount) return c.json({ ok: true, payload: `${branchQr(cfg, br.id)}&amount=${b.data.amount}`, exp: null, ttl: null });
    return c.json({ ok: true, ...makeDynamicQr(signKey(cfg), br.id, b.data.units) });
  });
  return r;
}
