// B2 · Сатып алу, пакеттер, чектер.
// Ереже: баға тек серверде есептеледі (клиент жіберген бағаға сенбейміз); бір сатып алу кілті — бір төлем (идемпотенттік);
// бәрі бір транзакцияда: төлем → пакет → тарих → чек. Қазір төлем сынақ режимінде (ақша жүрмейді).
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { receiptPdf, type PublicReceipt } from "../receipt/pdf.js";
import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { branches, gifts, offers, packEvents, packs, payments, receipts, venues } from "../db/schema.js";

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
}).strict();

export const CARRY_DAYS = 3;
export const GIFT_DAYS = 7;
const giftCode = () => randomUUID().replace(/-/g, "").slice(0, 10);

type Sizes = { units: number; price: number; oldPrice?: number }[] | null;
class PurchaseError extends Error { constructor(public code: string) { super(code); } }
const almaty = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const receiptNo = (n: number) => "JZ-" + n;

export function packStatusNow(p: { status: string; unitsLeft: number; validUntil: Date }) {
  if (p.status !== "active") return p.status;
  if (p.unitsLeft < 1) return "used";
  return p.validUntil.getTime() < Date.now() ? "expired" : "active";
}

export function purchaseRoutes(cfg: Config, db: Db) {
  const r = new Hono<Env>();

  r.post("/purchases", async (c) => {
    const t0 = Date.now();
    const parsed = Buy.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const body = parsed.data;
    const user = c.get("user");

    // Қайталанған сұрау: бұрын сол кілтпен жасалған сатып алуды қайтарамыз
    const prev = await db.select({ packId: payments.packId }).from(payments).where(and(eq(payments.userId, user.id), eq(payments.idempotencyKey, body.idempotencyKey))).limit(1);
    if (prev[0]?.packId) return c.json({ ok: true, repeated: true, ...(await packAndReceipt(db, user.id, prev[0].packId)) });

    const [row] = await db.select({ o: offers, v: venues }).from(offers).innerJoin(venues, eq(offers.venueId, venues.id)).where(eq(offers.slug, body.offerSlug)).limit(1);
    if (!row || row.o.status !== "active" || row.v.status !== "active") return c.json({ ok: false, error: "offer_unavailable" }, 409);
    const { o, v } = row;
    const units = body.units ?? o.units;
    const size = units === o.units ? { units, price: o.price } : ((o.sizes as Sizes) ?? []).find((x) => x.units === units);
    if (!size) return c.json({ ok: false, error: "bad_size" }, 400);
    const [branch] = await db.select().from(branches).where(and(eq(branches.venueId, v.id), eq(branches.active, true))).limit(1);

    const now = new Date();
    const validUntil = new Date(now.getTime() + o.validDays * 86400_000);
    const regularTotal = o.regularUnitPrice * units;
    const saving = Math.max(0, regularTotal - size.price);
    const fee = Math.round((size.price * cfg.JAZL_FEE_PCT) / 100);
    const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim();
    const methodLabel = body.methodLabel ?? { kaspi: "Kaspi Pay", card: "Банк картасы", test: "Сынақ төлемі" }[body.method];

    const result = await db.transaction(async (tx) => {
      const [pay] = await tx.insert(payments).values({ userId: user.id, provider: cfg.PAYMENTS_MODE, method: body.method, amount: size.price, status: "created", idempotencyKey: body.idempotencyKey, externalId: "test_" + randomUUID() }).returning();
      const [pack] = await tx.insert(packs).values({ userId: user.id, offerId: o.id, unitsTotal: units, unitsLeft: units, pricePaid: size.price, validUntil, status: "pending_payment", source: "purchase" }).returning();
      // Сынақ режимі: провайдер бірден «төленді» дейді. Нақты төлемде бұл қадам провайдердің webhook-ында болады.
      const paidAt = new Date();
      await tx.update(payments).set({ status: "paid", paidAt, packId: pack.id }).where(eq(payments.id, pay.id));
      // B4 · көшіру: ескі пакетті бұғаттап, қалған бірлігін жаңасына қосамыз
      let carried = 0;
      if (body.fromPackId) {
        const res = await tx.execute(sql`select * from app.packs where id = ${body.fromPackId} and user_id = ${user.id} for update`);
        const old = res.rows[0] as { id: string; offer_id: string; units_left: number; valid_until: Date; status: string } | undefined;
        if (!old || old.offer_id !== o.id) throw new PurchaseError("bad_from_pack");
        const expiredFor = Date.now() - new Date(old.valid_until).getTime();
        carried = ["active", "expired"].includes(old.status) && expiredFor <= CARRY_DAYS * 86400_000 ? old.units_left : 0;
        await tx.update(packs).set({ unitsLeft: 0, status: "used" }).where(eq(packs.id, old.id));
        if (carried) {
          await tx.insert(packEvents).values({ packId: old.id, type: "carry_out", unitsDelta: -carried, meta: { toPackId: pack.id } });
          await tx.update(packs).set({ unitsTotal: units + carried, unitsLeft: units + carried }).where(eq(packs.id, pack.id));
          await tx.insert(packEvents).values({ packId: pack.id, type: "carry_in", unitsDelta: carried, meta: { fromPackId: old.id } });
        }
      }
      await tx.update(packs).set({ status: body.gift ? "gifted" : "active", source: body.gift ? "gift" : body.fromPackId ? "rebuy" : "purchase" }).where(eq(packs.id, pack.id));
      await tx.insert(packEvents).values({ packId: pack.id, type: body.gift ? "gift_bought" : "purchase", unitsDelta: units, meta: { paymentId: pay.id, price: size.price, method: body.method } });
      let gift: { code: string; link: string; expiresAt: Date } | null = null;
      if (body.gift) {
        const code = giftCode(); const expiresAt = new Date(Date.now() + GIFT_DAYS * 86400_000);
        const toUsername = body.gift.toUsername?.replace(/^@/, "").toLowerCase() ?? null;
        if (toUsername && user.username && toUsername === user.username.toLowerCase()) throw new PurchaseError("gift_to_self");
        await tx.insert(gifts).values({ packId: pack.id, fromUserId: user.id, toUsername, code, message: body.gift.message ?? null, anonymous: body.gift.anonymous, status: "sent", expiresAt });
        gift = { code, link: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=gift_${code}`, expiresAt };
      }
      const pub = {
        title: body.gift ? "Сыйлық сатып алынды" : body.fromPackId ? "Пакет қайта алынды" : "Пакет сатып алынды", status: "Төленді",
        dateLocal: almaty(paidAt), timezone: "Asia/Almaty",
        seller: { name: v.name, kind: v.kind, address: branch?.address ?? null, city: v.city, bin: null as string | null },
        agent: { name: "Jazl+", note: "Пакетті Jazl+ сервисі арқылы сатып алдыңыз" },
        item: { title: o.title, units, carried, unitName: o.unitName, pricePerUnit: Math.round(size.price / units), regularPricePerUnit: o.regularUnitPrice, regularTotal, saving, discountPct: regularTotal ? Math.round((saving / regularTotal) * 100) : 0 },
        total: size.price, currency: "KZT",
        payment: { method: body.method, label: methodLabel, ref: pay.externalId, mode: cfg.PAYMENTS_MODE },
        pack: { id: pack.id, validFrom: almaty(now), validUntil: almaty(validUntil), validDays: o.validDays, howToUse: "Мекемеде «Jazl бойынша» деп айтып, кассадағы QR-ды сканерле немесе алдын ала тапсырыс бер" },
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
        client: { platform: c.req.header("x-tg-platform") ?? null, tgVersion: c.req.header("x-tg-version") ?? null, appVersion: c.req.header("x-app-version") ?? null, userAgent: c.req.header("user-agent") ?? null,
          ipHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null, authDate: c.get("auth").authDate, startParam: c.get("auth").startParam ?? null },
        offer: { id: o.id, slug: o.slug, venueId: v.id, branchId: branch?.id ?? null, catalogPrice: o.price, sizesOffered: o.sizes ?? null, chosenUnits: units, priceSource: "server" },
        money: { total: size.price, regularTotal, saving, jazlFeePct: cfg.JAZL_FEE_PCT, jazlFee: fee, venuePayout: size.price - fee, currency: "KZT" },
        payment: { id: pay.id, provider: cfg.PAYMENTS_MODE, externalId: pay.externalId, idempotencyKey: body.idempotencyKey, createdAt: pay.createdAt, paidAt },
        timing: { serverMs: Date.now() - t0 },
      };
      const [rc] = await tx.insert(receipts).values({ kind: "purchase", userId: user.id, packId: pack.id, paymentId: pay.id, venueId: v.id, branchId: branch?.id, total: size.price, public: pub, internal }).returning();
      return { packId: pack.id, receiptId: rc.id, gift, carried };
    }).catch((e) => { if (e instanceof PurchaseError) return { error: e.code }; throw e; });
    if ("error" in result) return c.json({ ok: false, error: result.error }, 409);
    return c.json({ ok: true, repeated: false, carried: result.carried, gift: result.gift, ...(await packAndReceipt(db, user.id, result.packId)) });
  });

  r.get("/packs", async (c) => {
    const user = c.get("user");
    const rows = await db.select({ p: packs, o: offers }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id))
      .where(and(eq(packs.userId, user.id), inArray(packs.status, ["active", "used", "expired"]))).orderBy(desc(packs.createdAt));
    const ids = rows.map((x) => x.p.id);
    const rcs = ids.length ? await db.select({ id: receipts.id, no: receipts.no, packId: receipts.packId }).from(receipts).where(and(inArray(receipts.packId, ids), eq(receipts.kind, "purchase"))) : [];
    return c.json({ ok: true, packs: rows.map(({ p, o }) => packDto(p, o.slug, rcs.find((x) => x.packId === p.id))) });
  });

  r.get("/receipts/no/:no", async (c) => {
    const no = Number(c.req.param("no").replace(/^JZ-/i, ""));
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
    return c.json({ ok: true, url: `${base}/files/receipts/${rc.id}.pdf?e=${e}&s=${signLink(cfg, rc.id, e)}`, fileName: `Jazl-chek-${receiptNo(rc.no)}.pdf` });
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
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Jazl-chek-${pub.no}.pdf"`, "Cache-Control": "private, max-age=600" } });
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
