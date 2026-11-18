// B2 · Сатып алу, пакеттер, чектер.
// Ереже: баға тек серверде есептеледі (клиент жіберген бағаға сенбейміз); бір сатып алу кілті — бір төлем (идемпотенттік);
// бәрі бір транзакцияда: төлем → пакет → тарих → чек. Қазір төлем сынақ режимінде (ақша жүрмейді).
import { bonusOf, holdBonus, releaseBonus } from "../bonus.js";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { receiptPdf, type PublicReceipt } from "../receipt/pdf.js";
import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { branches, gifts, offers, packEvents, packs, paymentCards, payments, receipts, users, venues } from "../db/schema.js";
import { paymentProvider, type CardInfo } from "../payments/index.js";
import { PaymentError } from "../payments/types.js";
import { leftValue } from "../value.js";
import { getSettings } from "../settings.js";

const Buy = z.object({
  offerSlug: z.string().min(1).max(64),
  units: z.number().int().positive().max(100).optional(),
  method: z.enum(["kaspi", "card", "test"]).default("test"),
  /** Төлем тәсілінің адамға көрінетін атауы: «Kaspi Pay», «Visa •• 4417» */
  methodLabel: z.string().max(40).optional(),
  idempotencyKey: z.string().min(8).max(64),
  /** B4 · қайта алу: бұрынғы пакеттің қалған бірлігі жаңасына көшеді (мерзімі өткеніне 3 күннен аспаса) */
  fromPackId: z.string().uuid().optional(),
  /** B4 · сыйлыққа алу: пакет алушы қабылдағанша «gifted» күйінде тұрады */
  gift: z.object({ message: z.string().max(120).optional(), anonymous: z.boolean().default(false), toUsername: z.string().regex(/^@?[A-Za-z0-9_]{4,32}$/).optional() }).optional(),
  /** Карта: сақталған (id) не жаңа картаның провайдер криптограммасы (карта нөмірі ЕШҚАШАН жіберілмейді); save — картаны сақтау */
  card: z.object({ id: z.string().uuid().optional(), cryptogram: z.string().min(8).max(4000).optional(), save: z.boolean().optional() }).strict().optional(),
  /** Medeo бонусын жұмсау (күйген бірліктен қайтқан ақша): бағадан шегеріледі, қалғаны картадан/Kaspi-ден */
  useBonus: z.boolean().optional(),
}).strict();

export const CARRY_DAYS = 3;
export const GIFT_DAYS = 7;
const giftCode = () => randomUUID().replace(/-/g, "").slice(0, 10);

type Sizes = { units: number; price: number; oldPrice?: number }[] | null;
class PurchaseError extends Error { constructor(public code: string) { super(code); } }
const almaty = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** Medeo. атауынан кейін «MD-», бұрынғы «JZ-» чектері де оқылады (нөмір бірдей) */
const receiptNo = (n: number) => "MD-" + n;

export function packStatusNow(p: { status: string; unitsLeft: number; validUntil: Date }) {
  if (p.status !== "active") return p.status;
  if (p.unitsLeft < 1) return "used";
  return p.validUntil.getTime() < Date.now() ? "expired" : "active";
}

export function purchaseRoutes(cfg: Config, db: Db) {
  const r = new Hono<Env>();

  // Сатып алу екі кезеңмен: (1) төлем мен пакет «күтуде» жасалады, провайдерден төлем сұралады;
  // (2) төлем расталғанда (бірден, 3-D Secure-ден кейін не вебхукпен) finalizePurchase пакетті белсендіріп, чек жазады.
  r.post("/purchases", async (c) => {
    const parsed = Buy.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const body = parsed.data;
    const user = c.get("user");

    // Қайталанған сұрау: бұрын сол кілтпен жасалған төлемнің күйін қайтарамыз (екінші рет ақша алынбайды)
    const [prev] = await db.select().from(payments).where(and(eq(payments.userId, user.id), eq(payments.idempotencyKey, body.idempotencyKey))).limit(1);
    if (prev) return c.json(...(await paymentReply(db, user.id, prev, true)));

    const [row] = await db.select({ o: offers, v: venues }).from(offers).innerJoin(venues, eq(offers.venueId, venues.id)).where(eq(offers.slug, body.offerSlug)).limit(1);
    if (!row || row.o.status !== "active" || row.v.status !== "active") return c.json({ ok: false, error: "offer_unavailable" }, 409);
    const { o, v } = row;
    const units = body.units ?? o.units;
    const size = units === o.units ? { units, price: o.price } : ((o.sizes as Sizes) ?? []).find((x) => x.units === units);
    if (!size) return c.json({ ok: false, error: "bad_size" }, 400);
    // Ақша алынбай тұрып тексерілетін қателер (төленген соң пакет берілмей қалмауы үшін)
    const toUsername = body.gift?.toUsername?.replace(/^@/, "").toLowerCase() ?? null;
    if (toUsername && user.username && toUsername === user.username.toLowerCase()) return c.json({ ok: false, error: "gift_to_self" }, 409);
    if (body.fromPackId) {
      const [old] = await db.select().from(packs).where(and(eq(packs.id, body.fromPackId), eq(packs.userId, user.id))).limit(1);
      if (!old || old.offerId !== o.id) return c.json({ ok: false, error: "bad_from_pack" }, 409);
    }
    // Карта: сақталған карта (id) не жаңа картаның криптограммасы. Карта нөмірі серверге келмейді.
    const provider = paymentProvider(cfg);
    let card: { token?: string; cryptogram?: string; save?: boolean; id?: string; label?: string } | null = null;
    if (body.method === "card" && body.card?.id) {
      const [pc] = await db.select().from(paymentCards).where(and(eq(paymentCards.id, body.card.id), eq(paymentCards.userId, user.id), isNull(paymentCards.removedAt))).limit(1);
      if (!pc) return c.json({ ok: false, error: "card_not_found" }, 404);
      card = { token: pc.token, id: pc.id, label: `${pc.brand} •• ${pc.last4}` };
    } else if (body.method === "card" && body.card?.cryptogram) card = { cryptogram: body.card.cryptogram, save: body.card.save ?? false };
    const methodLabel = card?.label ?? body.methodLabel ?? { kaspi: "Kaspi Pay", card: "Банк картасы", test: "Сынақ төлемі" }[body.method];
    const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim();
    const meta = { body, units, price: size.price, methodLabel, card: card?.id ? { id: card.id, label: card.label } : null,
      client: { platform: c.req.header("x-tg-platform") ?? null, tgVersion: c.req.header("x-tg-version") ?? null, appVersion: c.req.header("x-app-version") ?? null, userAgent: c.req.header("user-agent") ?? null,
        ipHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null, authDate: c.get("auth").authDate, startParam: c.get("auth").startParam ?? null } };

    const created = await db.transaction(async (tx) => {
      // Бонус бірден ұсталады (екі рет жұмсалмауы үшін); төлем өтпесе releaseBonus қайтарады
      const bonus = body.useBonus ? await holdBonus(tx, user.id, size.price) : { used: 0, from: [] };
      const cash = size.price - bonus.used;
      const viaProvider = Boolean(card) && cash > 0;
      const [pay] = await tx.insert(payments).values({ userId: user.id, provider: viaProvider ? provider.name : cash === 0 && bonus.used ? "bonus" : cfg.PAYMENTS_MODE, method: cash === 0 && bonus.used ? "bonus" : body.method, amount: cash, status: "created",
        idempotencyKey: body.idempotencyKey, externalId: viaProvider ? null : (cash === 0 ? "bonus_" : "test_") + randomUUID(), meta: { ...meta, ...(bonus.used ? { bonus } : {}), ...(cash === 0 && bonus.used ? { methodLabel: "Medeo бонусы" } : {}) }, cardId: viaProvider ? card?.id ?? null : null }).returning();
      const [pack] = await tx.insert(packs).values({ userId: user.id, offerId: o.id, unitsTotal: units, unitsLeft: units, pricePaid: size.price,
        validUntil: new Date(Date.now() + o.validDays * 86400_000), status: "pending_payment", source: "purchase" }).returning();
      await tx.update(payments).set({ packId: pack.id }).where(eq(payments.id, pay.id));
      return { ...pay, packId: pack.id, viaProvider };
    });
    const viaProvider = created.viaProvider;

    // Сынақ режимі (Kaspi, сынақ, картасыз ескі клиент): провайдер бірден «төленді» дейді
    if (!viaProvider) {
      const out = await finalizePurchase(db, cfg, created.id);
      if ("error" in out) return c.json({ ok: false, error: out.error }, 409);
      return c.json({ ok: true, repeated: false, status: "paid", paymentId: created.id, carried: out.carried, gift: out.gift, ...(await packAndReceipt(db, user.id, out.packId)) });
    }
    let res: Awaited<ReturnType<typeof provider.charge>>;
    try {
      res = await provider.charge({ paymentId: created.id, amount: created.amount, description: `Medeo · ${o.title}`.slice(0, 60), user: { id: user.id, telegramId: user.telegramId },
        card: { token: card!.token, cryptogram: card!.cryptogram, save: card!.save }, returnUrl: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=pay_${created.id}` });
    } catch (e) { res = { status: "failed", reason: e instanceof PaymentError && e.code === "bad_card" ? "declined" : "provider_error" }; }
    if (res.status === "failed") {
      await db.update(payments).set({ status: "failed", failure: res.reason, externalId: res.externalId ?? null }).where(eq(payments.id, created.id));
      await releaseBonus(db, created.id);
      return c.json({ ok: false, error: "payment_failed", reason: res.reason, paymentId: created.id }, 402);
    }
    await db.update(payments).set({ externalId: res.externalId, status: res.status === "paid" ? "created" : "pending" }).where(eq(payments.id, created.id));
    if (res.status === "action_required") {
      await db.execute(sql`update app.payments set meta = meta || ${JSON.stringify({ confirmUrl: res.confirmUrl })}::jsonb where id = ${created.id}`);
      return c.json({ ok: true, status: "action_required", paymentId: created.id, confirmUrl: res.confirmUrl }, 202);
    }
    if (res.card) await saveCard(db, provider.name, user.id, res.card);
    const out = await finalizePurchase(db, cfg, created.id);
    if ("error" in out) return c.json({ ok: false, error: out.error }, 409);
    return c.json({ ok: true, repeated: false, status: "paid", paymentId: created.id, carried: out.carried, gift: out.gift, ...(await packAndReceipt(db, user.id, out.packId)) });
  });

  // Medeo бонусы: қалдық, ең жақын мерзім, тарих (күйген бірліктен қайтқан ақша)
  r.get("/bonus", async (c) => c.json({ ok: true, ...(await bonusOf(db, c.get("user").id)) }));

  r.get("/packs", async (c) => {
    const user = c.get("user");
    const rows = await db.select({ p: packs, o: offers }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id))
      .where(and(eq(packs.userId, user.id), inArray(packs.status, ["active", "used", "expired"]))).orderBy(desc(packs.createdAt));
    const ids = rows.map((x) => x.p.id);
    const rcs = ids.length ? await db.select({ id: receipts.id, no: receipts.no, packId: receipts.packId }).from(receipts).where(and(inArray(receipts.packId, ids), eq(receipts.kind, "purchase"))) : [];
    // Ұзарту шегінен қалған күн (мини апп ұзарту парағында тек осыған сыятын нұсқаларды ұсынады)
    const ext = ids.length ? (await db.execute(sql`select pack_id, coalesce(sum((meta->>'days')::int), 0)::int as d from app.pack_events where type = 'extend' and meta->>'via' is null and pack_id in ${ids} group by pack_id`)).rows as { pack_id: string; d: number }[] : [];
    const maxDays = (await getSettings(db)).extendMaxDays;
    return c.json({ ok: true, packs: rows.map(({ p, o }) => ({ ...packDto(p, o.slug, rcs.find((x) => x.packId === p.id)), extendLeft: Math.max(0, maxDays - Number(ext.find((x) => x.pack_id === p.id)?.d ?? 0)) })) });
  });

  r.get("/receipts/no/:no", async (c) => {
    const no = Number(c.req.param("no").replace(/^(JZ|MD)-/i, ""));
    if (!Number.isInteger(no)) return c.json({ ok: false, error: "not_found" }, 404);
    const [rc] = await db.select().from(receipts).where(and(eq(receipts.no, no), eq(receipts.userId, c.get("user").id))).limit(1);
    if (!rc) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, receipt: publicReceipt(rc, cfg) });
  });

  // Жүктеу сілтемесі: 1 сағат жарамды, қолтаңбалы (Telegram downloadFile тақырып жібере алмайды, сондықтан кіру — сілтемедегі қолтаңбамен)
  r.post("/receipts/:id/link", async (c) => {
    const id = c.req.param("id");
    const [rc] = await db.select({ id: receipts.id, no: receipts.no, userId: receipts.userId, venueId: receipts.venueId }).from(receipts).where(eq(receipts.id, id)).limit(1);
    const staff = rc && rc.userId !== c.get("user").id && rc.venueId
      ? (await db.execute(sql`select 1 from app.venue_staff where venue_id = ${rc.venueId} and user_id = ${c.get("user").id} and status = 'active'`)).rows.length > 0 : false;
    if (!rc || (rc.userId !== c.get("user").id && !staff)) return c.json({ ok: false, error: "not_found" }, 404);
    const e = Math.floor(Date.now() / 1000) + 3600;
    const base = cfg.PUBLIC_URL ?? `https://${c.req.header("host")}`;
    return c.json({ ok: true, url: `${base}/files/receipts/${rc.id}.pdf?e=${e}&s=${signLink(cfg, rc.id, e)}`, fileName: `Medeo-chek-${receiptNo(rc.no)}.pdf` });
  });

  r.get("/receipts/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ ok: false, error: "not_found" }, 404);
    const [rc] = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
    // Клиенттің өзі немесе сол мекеменің белсенді қызметкері (Figma «Төлем өтті» → «Чек»)
    const staff = rc && rc.userId !== c.get("user").id && rc.venueId
      ? (await db.execute(sql`select 1 from app.venue_staff where venue_id = ${rc.venueId} and user_id = ${c.get("user").id} and status = 'active'`)).rows.length > 0 : false;
    if (!rc || (rc.userId !== c.get("user").id && !staff)) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, receipt: publicReceipt(rc, cfg) });
  });

  return r;
}

type ReceiptRow = typeof receipts.$inferSelect;
export function publicReceipt(rc: ReceiptRow, cfg: Config) {
  return { id: rc.id, no: receiptNo(rc.no), kind: rc.kind, total: rc.total, currency: rc.currency, createdAt: rc.createdAt, ...(rc.public as object),
    verifyUrl: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=rc_${rc.no}` };
}
export const signLink = (cfg: Config, id: string, e: number) => createHmac("sha256", cfg.BOT_TOKEN).update(`receipt:${id}:${e}`).digest("hex").slice(0, 32);

/** Ашық маршрут: /files/receipts/:id.pdf?e=&s= — қолтаңба мен мерзім тексеріледі, PDF беріледі. */
export function receiptFileRoutes(cfg: Config, db: Db) {
  const r = new Hono();
  r.get("/receipts/:file", async (c) => {
    const id = c.req.param("file").replace(/\.pdf$/, "");
    const e = Number(c.req.query("e")); const s = c.req.query("s") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id) || !e || e < Date.now() / 1000) return c.text("Сілтеменің мерзімі өтті", 410);
    const want = Buffer.from(signLink(cfg, id, e)); const got = Buffer.from(s);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return c.text("Сілтеме жарамсыз", 403);
    const [rc] = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
    if (!rc) return c.text("Чек табылмады", 404);
    const pub = publicReceipt(rc, cfg) as unknown as PublicReceipt;
    const pdf = await receiptPdf(pub);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Medeo-chek-${pub.no}.pdf"`, "Cache-Control": "private, max-age=600" } });
  });
  return r;
}

type PackRow = typeof packs.$inferSelect;
function packDto(p: PackRow, offerSlug: string, rc?: { id: string; no: number }) {
  return { id: p.id, offerSlug, unitsTotal: p.unitsTotal, unitsLeft: p.unitsLeft, pricePaid: p.pricePaid, validUntil: p.validUntil, status: packStatusNow(p), source: p.source, freeExtendUsed: p.freeExtendUsed, createdAt: p.createdAt,
    receipt: rc ? { id: rc.id, no: receiptNo(rc.no) } : null };
}

async function packAndReceipt(db: Db, userId: string, packId: string) {
  const [row] = await db.select({ p: packs, o: offers }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id)).where(and(eq(packs.id, packId), eq(packs.userId, userId))).limit(1);
  const [rc] = await db.select().from(receipts).where(and(eq(receipts.packId, packId), eq(receipts.kind, "purchase"))).limit(1);
  return {
    pack: packDto(row.p, row.o.slug, rc ? { id: rc.id, no: rc.no } : undefined),
    receipt: rc ? { id: rc.id, no: receiptNo(rc.no), kind: rc.kind, total: rc.total, currency: rc.currency, createdAt: rc.createdAt, ...(rc.public as object) } : null,
  };
}

/** Төлемнің күйі бойынша жауап (қайталанған сұрау мен GET /payments/:id үшін ортақ) */
export async function paymentReply(db: Db, userId: string, pay: typeof payments.$inferSelect, repeated = false): Promise<[object, 200 | 202 | 402]> {
  if (pay.status === "paid" && pay.packId) {
    const [g] = await db.select({ code: gifts.code }).from(gifts).where(eq(gifts.packId, pay.packId)).limit(1);
    const kind = (pay.meta as { kind?: string } | null)?.kind ?? "purchase";
    return [{ ok: true, repeated, status: "paid", paymentId: pay.id, kind, gift: g ? { code: g.code } : null, ...(await packAndReceipt(db, userId, pay.packId)) }, 200];
  }
  if (pay.status === "failed") return [{ ok: false, repeated, error: "payment_failed", reason: pay.failure, paymentId: pay.id }, 402];
  return [{ ok: true, repeated, status: "action_required", paymentId: pay.id, amount: pay.amount, confirmUrl: (pay.meta as { confirmUrl?: string } | null)?.confirmUrl ?? null }, 202];
}

/** Сақталған карта: бір провайдер токені — бір жол (қайта сақталса — жаңартылады, өшірілгені қайта көрінеді) */
export async function saveCard(db: Db, provider: string, userId: string, card: CardInfo) {
  const [row] = await db.insert(paymentCards).values({ userId, provider, token: card.token, brand: card.brand, last4: card.last4, expMonth: card.expMonth, expYear: card.expYear, holder: card.holder ?? null })
    .onConflictDoUpdate({ target: [paymentCards.provider, paymentCards.token], set: { removedAt: null, expMonth: card.expMonth, expYear: card.expYear } }).returning();
  return row;
}

/** Төлем расталды → пакет белсенді, көшіру/сыйлық, тарих, чек. Идемпотентті: екінші рет шақырылса ештеңе өзгермейді. */
export async function finalizePurchase(db: Db, cfg: Config, paymentId: string): Promise<{ packId: string; receiptId: string | null; gift: { code: string; link: string; expiresAt: Date } | null; carried: number } | { error: string }> {
  return db.transaction(async (tx) => {
    const lk = (await tx.execute(sql`select id, status, pack_id from app.payments where id = ${paymentId} for update`)).rows[0] as { id: string; status: string; pack_id: string } | undefined;
    if (!lk) throw new PurchaseError("not_found");
    if (lk.status === "paid") {
      const [rc] = await tx.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.packId, lk.pack_id), eq(receipts.kind, "purchase"))).limit(1);
      return { packId: lk.pack_id, receiptId: rc?.id ?? null, gift: null, carried: 0 };
    }
    if (lk.status === "failed") throw new PurchaseError("payment_failed");
    const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId));
    const m = pay.meta as { body: z.infer<typeof Buy>; units: number; price: number; methodLabel: string; card: { id: string; label: string } | null; client: Record<string, unknown> };
    const body = m.body; const units = m.units; const size = { units, price: m.price }; const methodLabel = m.methodLabel;
    const [pk] = await tx.select().from(packs).where(eq(packs.id, pay.packId!));
    const [{ o, v }] = await tx.select({ o: offers, v: venues }).from(offers).innerJoin(venues, eq(offers.venueId, venues.id)).where(eq(offers.id, pk.offerId));
    const [user] = await tx.select().from(users).where(eq(users.id, pay.userId));
    const [branch] = await tx.select().from(branches).where(and(eq(branches.venueId, v.id), eq(branches.active, true))).limit(1);
    const now = pay.createdAt;
    const validUntil = new Date(Date.now() + o.validDays * 86400_000);
    const regularTotal = o.regularUnitPrice * units;
    const saving = Math.max(0, regularTotal - size.price);
    const feePct = v.feePct ?? cfg.MEDEO_FEE_PCT;
    const fee = Math.round((size.price * feePct) / 100);
    const paidAt = new Date();
    await tx.update(payments).set({ status: "paid", paidAt }).where(eq(payments.id, pay.id));
    await tx.update(packs).set({ validUntil }).where(eq(packs.id, pk.id));
    const pack = { ...pk, validUntil };
    // B4 · көшіру: ескі пакетті бұғаттап, қалған бірлігін жаңасына қосамыз
    let carried = 0;
    if (body.fromPackId) {
      const res = await tx.execute(sql`select * from app.packs where id = ${body.fromPackId} and user_id = ${user.id} for update`);
      const old = res.rows[0] as { id: string; offer_id: string; units_left: number; units_total: number; value_total: number; valid_until: Date; status: string } | undefined;
      if (old && old.offer_id === o.id) {
        const expiredFor = Date.now() - new Date(old.valid_until).getTime();
        carried = ["active", "expired"].includes(old.status) && expiredFor <= CARRY_DAYS * 86400_000 ? old.units_left : 0;
        // Көшірілген бірліктер ескі пакетте төленген бағасымен келеді (Патша, 2026-11-18): мекеме оларды да толық бағасымен алады.
        // Мысал: латте 900 ₸, 3 кесе қалды → жаңа пакет 10 800 + 2 700 = 13 500 ₸ / 15 кесе = 900 ₸ (бұрын 720 ₸ болып, мекеме 2 700 ₸ жоғалтатын).
        const carriedValue = carried ? leftValue(old.value_total, old.units_total, carried) : 0;
        await tx.update(packs).set({ unitsLeft: 0, status: "used" }).where(eq(packs.id, old.id));
        if (carried) {
          await tx.insert(packEvents).values({ packId: old.id, type: "carry_out", unitsDelta: -carried, meta: { toPackId: pack.id, value: carriedValue } });
          await tx.update(packs).set({ unitsTotal: units + carried, unitsLeft: units + carried, valueTotal: size.price + carriedValue }).where(eq(packs.id, pack.id));
          await tx.insert(packEvents).values({ packId: pack.id, type: "carry_in", unitsDelta: carried, meta: { fromPackId: old.id, value: carriedValue } });
        }
      }
    }
    await tx.update(packs).set({ status: body.gift ? "gifted" : "active", source: body.gift ? "gift" : body.fromPackId ? "rebuy" : "purchase" }).where(eq(packs.id, pack.id));
    await tx.insert(packEvents).values({ packId: pack.id, type: body.gift ? "gift_bought" : "purchase", unitsDelta: units, meta: { paymentId: pay.id, price: size.price, method: body.method } });
    let gift: { code: string; link: string; expiresAt: Date } | null = null;
    if (body.gift) {
      const code = giftCode(); const expiresAt = new Date(Date.now() + GIFT_DAYS * 86400_000);
      const toUsername = body.gift.toUsername?.replace(/^@/, "").toLowerCase() ?? null;
      await tx.insert(gifts).values({ packId: pack.id, fromUserId: user.id, toUsername, code, message: body.gift.message ?? null, anonymous: body.gift.anonymous, status: "sent", expiresAt });
      gift = { code, link: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=gift_${code}`, expiresAt };
    }
      const pub = {
        title: body.gift ? "Сыйлық сатып алынды" : body.fromPackId ? "Пакет қайта алынды" : "Пакет сатып алынды", status: "Төленді",
        dateLocal: almaty(paidAt), timezone: "Asia/Almaty",
        seller: { name: v.name, kind: v.kind, address: branch?.address ?? null, city: v.city, bin: null as string | null },
        agent: { name: "Medeo", note: "Пакетті Medeo сервисі арқылы сатып алдыңыз" },
        item: { title: o.title, units, carried, unitName: o.unitName, pricePerUnit: Math.round(size.price / units), regularPricePerUnit: o.regularUnitPrice, regularTotal, saving, discountPct: regularTotal ? Math.round((saving / regularTotal) * 100) : 0 },
        total: size.price, currency: "KZT",
        payment: { method: pay.method, label: methodLabel, ref: pay.externalId, mode: cfg.PAYMENTS_MODE, bonus: (m as { bonus?: { used: number } }).bonus?.used ?? 0, charged: pay.amount },
        pack: { id: pack.id, validFrom: almaty(now), validUntil: almaty(validUntil), validDays: o.validDays, howToUse: "Мекемеде «Medeo бойынша» деп айтып, кассадағы QR-ды сканерле немесе алдын ала тапсырыс бер" },
        support: { bot: "@" + cfg.MINIAPP_BOT_USERNAME },
      };
      const internal = {
        version: 1,
        user: { id: user.id, telegramId: user.telegramId, lang: user.lang, city: user.city },
        // Патша (2026-11-17): клиент туралы толық дерек — аты-жөні, username, телефон (Telegram-да бөліссе)
        customer: { firstName: user.firstName, lastName: user.lastName, fullName: [user.firstName, user.lastName].filter(Boolean).join(" "), username: user.username ? "@" + user.username : null, phone: user.phone ?? null },
        item: { title: o.title, units, unitName: o.unitName },
        // Алу тәсілі, слот, бір реттік код — пакетті қолданғанда (B3: scan | order | plan) толтырылады; сатып алуда жоқ
        fulfillment: { type: null, slot: null, code: null },
        status: { current: "paid", history: [{ status: "created", at: now }, { status: "paid", at: paidAt }] },
        // Клиенттің бағасы (жұлдыз) — бағалағанда осы чекке жазылады (B4)
        rating: null,
        client: m.client,
        offer: { id: o.id, slug: o.slug, venueId: v.id, branchId: branch?.id ?? null, catalogPrice: o.price, sizesOffered: o.sizes ?? null, chosenUnits: units, priceSource: "server" },
        money: { total: size.price, regularTotal, saving, medeoFeePct: feePct, medeoFee: fee, venuePayout: size.price - fee, currency: "KZT" },
        payment: { id: pay.id, provider: pay.provider, externalId: pay.externalId, idempotencyKey: body.idempotencyKey, createdAt: pay.createdAt, paidAt, card: m.card ?? null },
      };
      const [rc] = await tx.insert(receipts).values({ kind: "purchase", userId: user.id, packId: pack.id, paymentId: pay.id, venueId: v.id, branchId: branch?.id, total: size.price, public: pub, internal }).returning();
    return { packId: pack.id, receiptId: rc.id, gift, carried };
  }).catch((e) => { if (e instanceof PurchaseError) return { error: e.code }; throw e; });
}
