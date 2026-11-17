// C · Мекеме бөлімі — Figma «Jazl+ Мекеме» беттерінің деректері (2026-11-17, Патшаның талабы: дизайн бойынша).
// Беттер: 01 Кіру (шақыру коды → иесінің растауы), 04 Басты, 05 Кассир (пакетті таңда → QR → Төлем өтті), 06 Ұсыныстар,
// 07 Команда (шақыру, рөлдер, кассир профилі), 08 Қолдану тарихы және тапсырыстар, 09 Есеп, 16 Қайтару.
// Рөлдер (Figma «Рөлдер мен рұқсаттар»): кассир — тек кассир режимі; басқарушы — + қолдану тарихы, ұсыныстарды өңдеу;
// иесі — + баға, есеп пен төлем, команданы басқару.
import { randomInt } from "node:crypto";
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { branches, offers, packs, qrSessions, redemptions, staffInvites, users, venueStaff, venues } from "../db/schema.js";
import { makeSessionQr } from "../qr.js";
import { branchStatus } from "../hours.js";
import { MAX_BYTES, MediaError, mediaStore, type MediaKind } from "../media.js";

type Role = "owner" | "manager" | "cashier";
const INVITE_MS = 24 * 3600_000;
const SESSION_MS = 10 * 60_000; // кассир экраны ашық тұрғанда сеанс 10 минут (QR мен код әр 30 с жаңарады)
const CODE_MS = 30_000;         // Патша (2026-11-17): 4 таңбалы код пен QR суреті 30 секунд сайын жаңарады
const CANCEL_MS = 10 * 60_000;
const DAY = sql`(date_trunc('day', now() at time zone 'Asia/Almaty') at time zone 'Asia/Almaty')`;
const short = (f: string, l: string | null) => (l ? `${f} ${l.slice(0, 1)}.` : f);

/** Мекемедегі барлық қолдану: QR арқылы (redemptions) және алдын ала тапсырыс (orders, жасалған сәтте 1 бірлік). */
interface UseRow { id: string; kind: "scan" | "order"; at: Date; units: number; unit_price: number; cancelled_at: Date | null; title: string; slug: string; first_name: string; last_name: string | null;
  branch_id: string; address: string; order_no: number | null; cashier_id: string | null; left: number; total: number }

export function venueRoutes(cfg: Config, db: Db) {
  const r = new Hono<Env>();
  const share = (amount: number) => Math.round((amount * (100 - cfg.JAZL_FEE_PCT)) / 100); // мекеме шотына түсетін бөлік
  const roleIn = async (userId: string, venueId: string) =>
    (await db.select({ role: venueStaff.role, branchId: venueStaff.branchId, status: venueStaff.status }).from(venueStaff).where(and(eq(venueStaff.userId, userId), eq(venueStaff.venueId, venueId))).limit(1))[0];
  /** Белсенді қызметкер және рөлі жеткілікті ме; болмаса 403 */
  const guard = async (c: Context<Env>, venueId: string, need: Role[] = ["owner", "manager", "cashier"]) => {
    const me = await roleIn(c.get("user").id, venueId);
    return me && me.status === "active" && need.includes(me.role) ? me : null;
  };
  const deny = (c: Context<Env>) => c.json({ ok: false, error: "forbidden" }, 403);

  async function uses(venueId: string, since: unknown, branchId?: string | null, limit = 500): Promise<UseRow[]> {
    const br = branchId ? sql`and b.id = ${branchId}` : sql``;
    const res = await db.execute(sql`
      select * from (
        select r.id, 'scan' as kind, r.created_at as at, r.units::int, (p.price_paid / p.units_total)::int as unit_price, r.cancelled_at, o.title, o.slug, u.first_name, u.last_name,
               b.id as branch_id, b.address, null::bigint as order_no, r.cashier_id, p.units_left::int as left, p.units_total::int as total
          from app.redemptions r join app.branches b on b.id = r.branch_id join app.packs p on p.id = r.pack_id join app.offers o on o.id = p.offer_id join app.users u on u.id = p.user_id
         where b.venue_id = ${venueId} and r.created_at >= ${since} ${br}
        union all
        select od.id, 'order', od.created_at, 1, (p.price_paid / p.units_total)::int, case when od.status in ('cancelled','failed') then od.created_at end, o.title, o.slug, u.first_name, u.last_name,
               b.id, b.address, od.no, od.done_by, p.units_left::int, p.units_total::int
          from app.orders od join app.branches b on b.id = od.branch_id join app.packs p on p.id = od.pack_id join app.offers o on o.id = p.offer_id join app.users u on u.id = od.user_id
         where b.venue_id = ${venueId} and od.created_at >= ${since} ${br}
      ) x order by at desc limit ${limit}`);
    return res.rows as unknown as UseRow[];
  }
  const useDto = (x: UseRow) => {
    const amount = x.unit_price * x.units;
    return { id: x.id, kind: x.kind, at: x.at, units: x.units, title: x.title, slug: x.slug, customer: short(x.first_name, x.last_name), branch: x.address, branchId: x.branch_id,
      orderNo: x.order_no, amount, venueAmount: share(amount), cancelled: Boolean(x.cancelled_at),
      canCancel: x.kind === "scan" && !x.cancelled_at && Date.now() - new Date(x.at).getTime() < CANCEL_MS };
  };

  // ── 01 · Кіру ────────────────────────────────────────────────
  r.get("/venue/me", async (c) => {
    const rows = await db.select({ s: venueStaff, v: venues }).from(venueStaff).innerJoin(venues, eq(venueStaff.venueId, venues.id)).where(eq(venueStaff.userId, c.get("user").id));
    const out = await Promise.all(rows.map(async (x) => {
      const brs = await db.select({ id: branches.id, address: branches.address }).from(branches).where(and(eq(branches.venueId, x.v.id), eq(branches.active, true))).orderBy(asc(branches.createdAt));
      return { venue: { id: x.v.id, slug: x.v.slug, name: x.v.name, kind: x.v.kind, city: x.v.city, logoUrl: x.v.logoUrl, coverUrl: x.v.coverUrl, rating: x.v.rating, reviews: x.v.reviewsCount, branchesTotal: brs.length },
        role: x.s.role, status: x.s.status, branchId: x.s.branchId, branches: x.s.branchId ? brs.filter((b) => b.id === x.s.branchId) : brs };
    }));
    return c.json({ ok: true, staff: out });
  });

  // Кассир 6 таңбалы кодты енгізеді → «Сұраныс жіберілді», иесі «Команда» бетінде растайды
  r.post("/venue/join", async (c) => {
    const code = String((await c.req.json().catch(() => ({})))?.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) return c.json({ ok: false, error: "bad_code" }, 400);
    const [inv] = await db.select({ i: staffInvites, v: venues }).from(staffInvites).innerJoin(venues, eq(staffInvites.venueId, venues.id))
      .where(and(eq(staffInvites.code, code), gt(staffInvites.expiresAt, new Date()))).limit(1);
    if (!inv) return c.json({ ok: false, error: "bad_code" }, 404);
    const user = c.get("user");
    const cur = await roleIn(user.id, inv.i.venueId);
    if (!cur) await db.insert(venueStaff).values({ venueId: inv.i.venueId, userId: user.id, role: inv.i.role, branchId: inv.i.branchId, status: "pending" });
    return c.json({ ok: true, venue: inv.v.name, role: cur?.role ?? inv.i.role, status: cur?.status ?? "pending" });
  });

  // ── 07 · Команда ─────────────────────────────────────────────
  // Шақыру коды: мекемеде бір белсенді код (жаңасы жасалса — ескісі өшеді), 24 сағат
  r.get("/venue/:venueId/invite", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner"]))) return deny(c);
    const [i] = await db.select().from(staffInvites).where(and(eq(staffInvites.venueId, venueId), gt(staffInvites.expiresAt, new Date()))).orderBy(desc(staffInvites.createdAt)).limit(1);
    return c.json({ ok: true, invite: i ? { code: i.code, expiresAt: i.expiresAt, link: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=staff_${i.code}` } : null });
  });
  r.post("/venue/:venueId/invites", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner"]))) return deny(c);
    const b = z.object({ role: z.enum(["manager", "cashier"]).default("cashier"), branchId: z.string().uuid().optional() }).strict().safeParse(await c.req.json().catch(() => ({})));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    await db.delete(staffInvites).where(eq(staffInvites.venueId, venueId));
    let code = "";
    for (let i = 0; i < 8; i++) {
      code = String(randomInt(100000, 1000000));
      const [taken] = await db.select({ c: staffInvites.code }).from(staffInvites).where(eq(staffInvites.code, code)).limit(1);
      if (!taken) break;
    }
    const expiresAt = new Date(Date.now() + INVITE_MS);
    await db.insert(staffInvites).values({ code, venueId, role: b.data.role, branchId: b.data.branchId ?? null, createdBy: c.get("user").id, expiresAt });
    return c.json({ ok: true, code, expiresAt, link: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=staff_${code}` });
  });

  r.get("/venue/:venueId/staff", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const rows = await db.select({ s: venueStaff, u: users, b: branches }).from(venueStaff).innerJoin(users, eq(venueStaff.userId, users.id)).leftJoin(branches, eq(venueStaff.branchId, branches.id))
      .where(eq(venueStaff.venueId, venueId)).orderBy(asc(venueStaff.createdAt));
    const order: Record<Role, number> = { owner: 0, manager: 1, cashier: 2 };
    return c.json({ ok: true, me: c.get("user").id,
      staff: rows.sort((a, b) => order[a.s.role] - order[b.s.role]).map((x) => ({ userId: x.u.id, name: short(x.u.firstName, x.u.lastName), username: x.u.username, photoUrl: x.u.photoUrl,
        role: x.s.role, status: x.s.status, branch: x.b?.address ?? null, branchId: x.s.branchId, since: x.s.createdAt, lastSeen: x.u.lastSeenAt })) });
  });

  // Кассир профилі: филиал, бүгінгі төлемдер, қосылған күні, соңғы күндер
  r.get("/venue/:venueId/staff/:userId", async (c) => {
    const venueId = c.req.param("venueId"); const uid = c.req.param("userId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const [x] = await db.select({ s: venueStaff, u: users, b: branches }).from(venueStaff).innerJoin(users, eq(venueStaff.userId, users.id)).leftJoin(branches, eq(venueStaff.branchId, branches.id))
      .where(and(eq(venueStaff.venueId, venueId), eq(venueStaff.userId, uid))).limit(1);
    if (!x) return c.json({ ok: false, error: "not_found" }, 404);
    const mine = (await uses(venueId, sql`${DAY} - interval '30 days'`)).filter((u) => u.cashier_id === uid && !u.cancelled_at);
    const dayKey = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
    const days = new Map<string, { count: number; amount: number }>();
    for (const u of mine) { const k = dayKey(u.at); const d = days.get(k) ?? { count: 0, amount: 0 }; d.count++; d.amount += share(u.unit_price * u.units); days.set(k, d); }
    const today = days.get(dayKey(new Date())) ?? { count: 0, amount: 0 };
    return c.json({ ok: true, staff: { userId: x.u.id, name: short(x.u.firstName, x.u.lastName), username: x.u.username, photoUrl: x.u.photoUrl, role: x.s.role, status: x.s.status,
      branch: x.b?.address ?? null, branchId: x.s.branchId, since: x.s.createdAt, today, days: [...days.entries()].filter(([k]) => k !== dayKey(new Date())).slice(0, 7).map(([date, v]) => ({ date, ...v })) } });
  });

  const owner = async (c: Context<Env>) => {
    const venueId = c.req.param("venueId")!; const uid = c.req.param("userId")!;
    if (!(await guard(c, venueId, ["owner"]))) return null;
    const t = await roleIn(uid, venueId);
    return t ? { venueId, uid, t } : null;
  };
  r.post("/venue/:venueId/staff/:userId/approve", async (c) => {
    const o = await owner(c); if (!o) return deny(c);
    await db.update(venueStaff).set({ status: "active" }).where(and(eq(venueStaff.venueId, o.venueId), eq(venueStaff.userId, o.uid)));
    return c.json({ ok: true });
  });
  r.post("/venue/:venueId/staff/:userId/remove", async (c) => {
    const o = await owner(c); if (!o) return deny(c);
    if (o.uid === c.get("user").id || o.t.role === "owner") return deny(c); // иесін ешкім шығармайды
    await db.delete(venueStaff).where(and(eq(venueStaff.venueId, o.venueId), eq(venueStaff.userId, o.uid)));
    return c.json({ ok: true });
  });
  r.post("/venue/:venueId/staff/:userId/branch", async (c) => {
    const o = await owner(c); if (!o) return deny(c);
    const b = z.object({ branchId: z.string().uuid().nullable() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    if (b.data.branchId) { const [br] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, b.data.branchId), eq(branches.venueId, o.venueId))).limit(1); if (!br) return c.json({ ok: false, error: "not_found" }, 404); }
    await db.update(venueStaff).set({ branchId: b.data.branchId }).where(and(eq(venueStaff.venueId, o.venueId), eq(venueStaff.userId, o.uid)));
    return c.json({ ok: true });
  });

  // ── 04 · Басты және 05 · Кассир (басты) ───────────────────────
  r.get("/venue/:venueId/dashboard", async (c) => {
    const venueId = c.req.param("venueId");
    const me = await guard(c, venueId); if (!me) return deny(c);
    const branchId = me.branchId ?? c.req.query("branch") ?? null;
    const all = (await uses(venueId, sql`${DAY} - interval '6 days'`, branchId)).filter((u) => !u.cancelled_at);
    const dayKey = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
    const keys = Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() - (6 - i) * 86400_000)));
    const series = keys.map((k) => all.filter((u) => dayKey(u.at) === k).length);
    const sum = (k: string, rows = all) => rows.filter((u) => dayKey(u.at) === k).reduce((s, u) => s + share(u.unit_price * u.units), 0);
    const mine = me.role === "cashier" ? all.filter((u) => u.cashier_id === c.get("user").id) : all;
    const act = (await db.execute(sql`select count(*)::int as packs, coalesce(sum(p.units_left), 0)::int as units from app.packs p join app.offers o on o.id = p.offer_id
      where o.venue_id = ${venueId} and p.status = 'active' and p.valid_until > now()`)).rows[0] as { packs: number; units: number };
    return c.json({ ok: true, dashboard: {
      today: series[6], yesterday: series[5], series, revenueToday: sum(keys[6]), revenueYesterday: sum(keys[5]),
      cashierToday: mine.filter((u) => dayKey(u.at) === keys[6]).length, cashierRevenue: sum(keys[6], mine),
      activePacks: act.packs, unitsLeft: act.units, recent: (me.role === "cashier" ? mine : all).slice(0, 5).map(useDto) } });
  });

  // ── 08 · Қолдану тарихы ──────────────────────────────────────
  r.get("/venue/:venueId/history", async (c) => {
    const venueId = c.req.param("venueId");
    const me = await guard(c, venueId); if (!me) return deny(c);
    const days = Math.min(30, Math.max(1, Number(c.req.query("days") ?? 1)));
    const branchId = me.branchId ?? c.req.query("branch") ?? null;
    let rows = await uses(venueId, sql`${DAY} - (${days - 1} * interval '1 day')`, branchId);
    if (me.role === "cashier") rows = rows.filter((u) => u.cashier_id === c.get("user").id); // кассир — тек өз төлемдері (Figma: тарих — басқарушы мен иесіне)
    const ok = rows.filter((u) => !u.cancelled_at);
    return c.json({ ok: true, summary: { count: ok.length, amount: ok.reduce((s, u) => s + share(u.unit_price * u.units), 0), refunds: rows.filter((u) => u.kind === "scan" && u.cancelled_at).length },
      items: rows.map(useDto) });
  });

  // ── 08 · Тапсырыстар ─────────────────────────────────────────
  r.get("/venue/:venueId/orders/:orderId", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId))) return deny(c);
    const res = await db.execute(sql`select od.*, o.title, o.slug, (p.price_paid / p.units_total)::int as unit_price, u.first_name, u.last_name, b.address, b.venue_id
      from app.orders od join app.packs p on p.id = od.pack_id join app.offers o on o.id = p.offer_id join app.users u on u.id = od.user_id join app.branches b on b.id = od.branch_id where od.id = ${c.req.param("orderId")}`);
    const o = res.rows[0] as { id: string; no: number; type: string; status: string; scheduled_at: Date | null; created_at: Date; done_at: Date | null; code: string; courier: boolean; title: string; slug: string; unit_price: number; first_name: string; last_name: string | null; address: string; venue_id: string } | undefined;
    if (!o || o.venue_id !== venueId) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, order: { id: o.id, no: o.no, type: o.type, status: o.status, scheduledAt: o.scheduled_at, createdAt: o.created_at, doneAt: o.done_at, code: o.code, courier: o.courier,
      title: o.title, slug: o.slug, customer: short(o.first_name, o.last_name), branch: o.address, amount: o.unit_price, venueAmount: share(o.unit_price) } });
  });

  // ── 06 · Ұсыныстар ───────────────────────────────────────────
  r.get("/venue/:venueId/offers", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId))) return deny(c); // кассир де көреді: «Клиенттің пакетін таңда»
    const rows = await db.execute(sql`select o.id, o.slug, o.title, o.kind, o.unit_name, o.units, o.price, o.sizes, o.status, o.valid_days, o.photos,
        (select count(*) from app.packs p where p.offer_id = o.id and p.status not in ('pending_payment','refunded'))::int as sold
      from app.offers o where o.venue_id = ${venueId} order by o.created_at`);
    return c.json({ ok: true, offers: (rows.rows as { id: string; slug: string; title: string; kind: string; unit_name: string; units: number; price: number; sizes: { units: number; price: number }[] | null; status: string; valid_days: number; photos: string[]; sold: number }[])
      .map((o) => { const sizes = [{ units: o.units, price: o.price }, ...(o.sizes ?? [])].sort((a, b) => a.units - b.units);
        return { id: o.id, slug: o.slug, title: o.title.split(" · ")[0], kind: o.kind, unitName: o.unit_name, status: o.status, sold: o.sold, validDays: o.valid_days, photo: o.photos?.[0] ?? null,
          sizes: sizes.map((s) => s.units), fromPrice: Math.min(...sizes.map((s) => s.price)), unitPrice: Math.round(o.price / o.units) }; }) });
  });
  r.post("/venue/:venueId/offers/:offerId/status", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const b = z.object({ status: z.enum(["active", "paused"]) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const res = await db.update(offers).set({ status: b.data.status }).where(and(eq(offers.id, c.req.param("offerId")), eq(offers.venueId, venueId), inArray(offers.status, ["active", "paused"]))).returning({ id: offers.id });
    return res.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  });

  // ── 06 · Ұсыныс құру, ұсыныс беті, бағаны өзгерту (Figma 14007/14008/14018) ──
  const Size = z.object({ units: z.number().int().min(1).max(100), price: z.number().int().min(100).max(10_000_000) });
  const OfferBody = z.object({
    title: z.string().trim().min(2).max(60), category: z.string().trim().max(30).optional(), about: z.string().max(500).default(""),
    sizes: z.array(Size).min(1).max(5), regularUnitPrice: z.number().int().min(50).max(1_000_000), validDays: z.number().int().min(7).max(365),
    rules: z.object({ carry: z.boolean(), extend: z.boolean(), preorder: z.boolean(), branches: z.array(z.string().uuid()).nullable() }),
    publish: z.boolean().default(false),
    photos: z.array(z.string().url().max(500)).max(5).default([]),
  }).strict();
  /** Жеңілдік кемінде 10% (Figma «Ұсыныс: жеңілдік 10%-дан аз»): әр көлем бағасы бөлек алғандағы сомадан ≤ 90% */
  const lowDiscount = (sizes: { units: number; price: number }[], regular: number) => sizes.find((x) => x.price > Math.floor(x.units * regular * 0.9));
  const slugOf = (t: string) => {
    const map: Record<string, string> = { а: "a", ә: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", қ: "q", л: "l", м: "m", н: "n", ң: "n", о: "o", ө: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ұ: "u", ү: "u", ф: "f", х: "h", һ: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", і: "i", ь: "", э: "e", ю: "yu", я: "ya" };
    const base = [...t.toLowerCase()].map((ch) => map[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "offer";
    return `${base}-${randomInt(1000, 10000)}`;
  };
  const statusAfterPublish = () => (cfg.PAYMENTS_MODE === "test" ? "active" : "review"); // сынақта бірден жарияланады, нақты режимде Jazl+ тексереді (24 сағ)

  r.post("/venue/:venueId/offers", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const b = OfferBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const d = b.data; const sizes = [...d.sizes].sort((a, z) => a.units - z.units);
    if (d.publish && lowDiscount(sizes, d.regularUnitPrice)) return c.json({ ok: false, error: "low_discount" }, 409);
    const [v] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
    const [o] = await db.insert(offers).values({ venueId, slug: slugOf(d.title), title: `${d.title} · ${sizes[0].units} дана`, kind: v.kind, unitName: "дана", units: sizes[0].units, price: sizes[0].price,
      regularUnitPrice: d.regularUnitPrice, validDays: d.validDays, sizes: sizes.length > 1 ? sizes : null, details: { about: d.about }, photos: d.photos, category: d.category ?? null, rules: d.rules,
      status: d.publish ? statusAfterPublish() : "draft" }).returning();
    return c.json({ ok: true, offer: { id: o.id, status: o.status } });
  });

  r.put("/venue/:venueId/offers/:offerId", async (c) => {
    const venueId = c.req.param("venueId");
    const me = await guard(c, venueId, ["owner", "manager"]); if (!me) return deny(c);
    const b = OfferBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [cur] = await db.select().from(offers).where(and(eq(offers.id, c.req.param("offerId")), eq(offers.venueId, venueId))).limit(1);
    if (!cur) return c.json({ ok: false, error: "not_found" }, 404);
    const d = b.data; const sizes = [...d.sizes].sort((a, z) => a.units - z.units);
    const draft = cur.status === "draft";
    // Жарияланған ұсыныстың бағасын тек иесі «Бағаны өзгерту» арқылы өзгертеді (Figma «Рөлдер»)
    const keepSizes = !draft;
    if (d.publish && draft && lowDiscount(sizes, d.regularUnitPrice)) return c.json({ ok: false, error: "low_discount" }, 409);
    await db.update(offers).set({ title: `${d.title} · ${(keepSizes ? cur.units : sizes[0].units)} дана`, validDays: d.validDays, details: { ...(cur.details as object ?? {}), about: d.about },
      category: d.category ?? null, rules: d.rules, photos: d.photos, regularUnitPrice: keepSizes ? cur.regularUnitPrice : d.regularUnitPrice,
      ...(keepSizes ? {} : { units: sizes[0].units, price: sizes[0].price, sizes: sizes.length > 1 ? sizes : null }),
      ...(d.publish && draft ? { status: statusAfterPublish() } : {}) }).where(eq(offers.id, cur.id));
    return c.json({ ok: true, status: d.publish && draft ? statusAfterPublish() : cur.status });
  });

  r.get("/venue/:venueId/offers/:offerId", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const [o] = await db.select().from(offers).where(and(eq(offers.id, c.req.param("offerId")), eq(offers.venueId, venueId))).limit(1);
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    const st = (await db.execute(sql`select count(*)::int as sold, count(*) filter (where status = 'active' and valid_until > now())::int as active,
        coalesce(sum(units_total - units_left), 0)::int as used, coalesce(sum(price_paid), 0)::int as gross
      from app.packs where offer_id = ${o.id} and status not in ('pending_payment','refunded')`)).rows[0] as { sold: number; active: number; used: number; gross: number };
    const daily = (await db.execute(sql`select to_char(created_at at time zone 'Asia/Almaty', 'YYYY-MM-DD') as d, count(*)::int as n from app.packs
      where offer_id = ${o.id} and status not in ('pending_payment','refunded') and created_at >= ${DAY} - interval '13 days' group by 1`)).rows as { d: string; n: number }[];
    const key = (k: number) => new Date(Date.now() - k * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
    const series = Array.from({ length: 7 }, (_, i) => ({ date: key(6 - i), n: daily.find((x) => x.d === key(6 - i))?.n ?? 0 }));
    const prev = Array.from({ length: 7 }, (_, i) => daily.find((x) => x.d === key(13 - i))?.n ?? 0).reduce((a, x) => a + x, 0);
    const now7 = series.reduce((a, x) => a + x.n, 0);
    const bySize = (await db.execute(sql`select units_total::int as units, count(*)::int as n from app.packs where offer_id = ${o.id} and status not in ('pending_payment','refunded') group by 1`)).rows as { units: number; n: number }[];
    const sizes = (o.sizes as { units: number; price: number }[] | null) ?? [{ units: o.units, price: o.price }];
    const all = sizes.some((x) => x.units === o.units) ? sizes : [{ units: o.units, price: o.price }, ...sizes];
    return c.json({ ok: true, offer: { id: o.id, slug: o.slug, title: o.title.split(" · ")[0], kind: o.kind, status: o.status, category: o.category, about: (o.details as { about?: string } | null)?.about ?? "",
      regularUnitPrice: o.regularUnitPrice, validDays: o.validDays, photos: o.photos, rules: o.rules ?? { carry: true, extend: true, preorder: true, branches: null },
      sizes: all.sort((a, z) => a.units - z.units).map((x) => ({ ...x, sold: bySize.find((y) => y.units === x.units)?.n ?? 0 })),
      stats: { ...st, revenue: share(st.gross), series, growth: prev ? Math.round(((now7 - prev) / prev) * 100) : null } } });
  });

  // Бағаны өзгерту (тек иесі): жаңа баға тек жаңа пакеттерге; 50%-дан көп түсірілсе — растау керек (Figma «Баға қатты түсірілді»)
  r.post("/venue/:venueId/offers/:offerId/price", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner"]))) return deny(c);
    const b = z.object({ units: z.number().int().min(1), price: z.number().int().min(100).max(10_000_000), confirmDrop: z.boolean().optional() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [o] = await db.select().from(offers).where(and(eq(offers.id, c.req.param("offerId")), eq(offers.venueId, venueId))).limit(1);
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    const sizes = ((o.sizes as { units: number; price: number }[] | null) ?? [{ units: o.units, price: o.price }]).map((x) => ({ ...x }));
    const cur = sizes.find((x) => x.units === b.data.units) ?? (b.data.units === o.units ? { units: o.units, price: o.price } : null);
    if (!cur) return c.json({ ok: false, error: "not_found" }, 404);
    if (b.data.price < cur.price * 0.5 && !b.data.confirmDrop) return c.json({ ok: false, error: "big_drop", old: cur.price }, 409);
    if (lowDiscount([{ units: b.data.units, price: b.data.price }], o.regularUnitPrice)) return c.json({ ok: false, error: "low_discount" }, 409);
    const next = sizes.map((x) => (x.units === b.data.units ? { ...x, price: b.data.price } : x));
    await db.update(offers).set({ sizes: o.sizes ? next : null, ...(b.data.units === o.units ? { price: b.data.price } : {}) }).where(eq(offers.id, o.id));
    return c.json({ ok: true });
  });

  // Жобаны өшіру (тек жоба) не мұрағатқа жіберу
  r.post("/venue/:venueId/offers/:offerId/remove", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const [o] = await db.select().from(offers).where(and(eq(offers.id, c.req.param("offerId")), eq(offers.venueId, venueId))).limit(1);
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    const sold = (await db.execute(sql`select count(*)::int as n from app.packs where offer_id = ${o.id}`)).rows[0] as { n: number };
    if (o.status === "draft" && !sold.n) await db.delete(offers).where(eq(offers.id, o.id));
    else await db.update(offers).set({ status: "ended" }).where(eq(offers.id, o.id));
    return c.json({ ok: true });
  });

  // Сурет жүктеу (иесі мен басқарушы): денесі — суреттің өзі (image/jpeg|png|webp), ?kind=offer|logo|cover → ашық URL
  const media = mediaStore(cfg);
  r.post("/venue/:venueId/media", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const kind = (["offer", "logo", "cover"].includes(c.req.query("kind") ?? "") ? c.req.query("kind") : "offer") as MediaKind;
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_BYTES) return c.json({ ok: false, error: "too_large" }, 413);
    try {
      const url = await media.put(new Uint8Array(await c.req.arrayBuffer()), (c.req.header("content-type") ?? "").split(";")[0], kind, `venues/${venueId}`);
      return c.json({ ok: true, url });
    } catch (e) { if (e instanceof MediaError) return c.json({ ok: false, error: e.code }, e.status); throw e; }
  });

  // ── 07 · Филиалдар (Figma 14009:8007, 14019:*): тізім, өңдеу (24/7, апта күндері, мереке күндері), уақытша жабу ──
  const Hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const BranchBody = z.object({
    address: z.string().trim().min(3).max(120), is247: z.boolean(),
    days: z.array(z.object({ on: z.boolean(), open: Hm, close: Hm })).length(7),
    holidays: z.array(z.object({ name: z.string().trim().min(1).max(40), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), closed: z.boolean(), open: Hm.optional(), close: Hm.optional() })).max(30),
  }).strict();
  const branchOf = async (venueId: string, id: string) => (await db.select().from(branches).where(and(eq(branches.id, id), eq(branches.venueId, venueId), eq(branches.active, true))).limit(1))[0];

  r.get("/venue/:venueId/branches", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const list = await db.select().from(branches).where(and(eq(branches.venueId, venueId), eq(branches.active, true))).orderBy(asc(branches.createdAt));
    const today = await uses(venueId, DAY);
    const staffN = (await db.execute(sql`select branch_id, count(*)::int as n from app.venue_staff where venue_id = ${venueId} and role = 'cashier' and status = 'active' group by 1`)).rows as { branch_id: string | null; n: number }[];
    const allCashiers = staffN.filter((x) => !x.branch_id).reduce((a, x) => a + x.n, 0);
    return c.json({ ok: true, today: today.filter((u) => !u.cancelled_at).length, branches: list.map((b) => ({
      id: b.id, address: b.address, is247: b.is247, hours: b.hours, holidays: b.holidays ?? [], closedUntil: b.closedUntil, closedReason: b.closedReason, status: branchStatus(b),
      today: today.filter((u) => u.branch_id === b.id && !u.cancelled_at).length, cashiers: (staffN.find((x) => x.branch_id === b.id)?.n ?? 0) + allCashiers })) });
  });
  r.post("/venue/:venueId/branches", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner"]))) return deny(c);
    const b = z.object({ address: z.string().trim().min(3).max(120) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [x] = await db.insert(branches).values({ venueId, address: b.data.address, hours: { days: Array.from({ length: 7 }, () => ({ on: true, open: "09:00", close: "22:00" })) } }).returning();
    return c.json({ ok: true, id: x.id });
  });
  r.put("/venue/:venueId/branches/:id", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const b = BranchBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const br = await branchOf(venueId, c.req.param("id")); if (!br) return c.json({ ok: false, error: "not_found" }, 404);
    await db.update(branches).set({ address: b.data.address, is247: b.data.is247, hours: { days: b.data.days }, holidays: b.data.holidays }).where(eq(branches.id, br.id));
    return c.json({ ok: true });
  });
  // Уақытша жабу (Figma «Уақытша жабу»): 1 сағат, 3 сағат, бүгін, ертеңге дейін; себебі
  r.post("/venue/:venueId/branches/:id/close", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const b = z.object({ for: z.enum(["1h", "3h", "today", "tomorrow"]), reason: z.string().max(40) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const br = await branchOf(venueId, c.req.param("id")); if (!br) return c.json({ ok: false, error: "not_found" }, 404);
    const until = b.data.for === "1h" ? sql`now() + interval '1 hour'` : b.data.for === "3h" ? sql`now() + interval '3 hours'` : b.data.for === "today" ? sql`${DAY} + interval '1 day'` : sql`${DAY} + interval '2 days'`;
    await db.execute(sql`update app.branches set closed_until = ${until}, closed_reason = ${b.data.reason} where id = ${br.id}`);
    return c.json({ ok: true });
  });
  r.post("/venue/:venueId/branches/:id/open", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner", "manager"]))) return deny(c);
    const br = await branchOf(venueId, c.req.param("id")); if (!br) return c.json({ ok: false, error: "not_found" }, 404);
    await db.update(branches).set({ closedUntil: null, closedReason: null }).where(eq(branches.id, br.id));
    return c.json({ ok: true });
  });
  r.post("/venue/:venueId/branches/:id/remove", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner"]))) return deny(c);
    const br = await branchOf(venueId, c.req.param("id")); if (!br) return c.json({ ok: false, error: "not_found" }, 404);
    const n = (await db.execute(sql`select count(*)::int as n from app.branches where venue_id = ${venueId} and active`)).rows[0] as { n: number };
    if (n.n <= 1) return c.json({ ok: false, error: "last_branch" }, 409);
    await db.update(branches).set({ active: false }).where(eq(branches.id, br.id)); // тарих сақталады — тек белсенді емес
    return c.json({ ok: true });
  });

  // ── 09 · Есеп (тек иесі) ─────────────────────────────────────
  r.get("/venue/:venueId/report", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await guard(c, venueId, ["owner"]))) return deny(c);
    const period = c.req.query("period") === "month" ? "month" : c.req.query("period") === "all" ? "all" : "week";
    const rows = (await uses(venueId, period === "all" ? sql`${DAY} - interval '365 days'` : sql`${DAY} - interval '29 days'`, null, 20000)).filter((u) => !u.cancelled_at);
    const dayKey = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
    const byDay = new Map<string, { count: number; amount: number }>();
    for (const u of rows) { const k = dayKey(u.at); const d = byDay.get(k) ?? { count: 0, amount: 0 }; d.count++; d.amount += share(u.unit_price * u.units); byDay.set(k, d); }
    const now = Date.now();
    let bars: { label: string; amount: number }[];
    if (period === "week") bars = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * 86400_000); return { label: d.toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }), amount: byDay.get(dayKey(d))?.amount ?? 0 }; });
    else if (period === "month") bars = Array.from({ length: 4 }, (_, i) => { let s = 0; for (let k = 0; k < 7; k++) s += byDay.get(dayKey(new Date(now - ((3 - i) * 7 + (6 - k)) * 86400_000)))?.amount ?? 0; return { label: `${i + 1}-апта`, amount: s }; });
    else { const m = new Map<string, number>(); for (const [k, v] of byDay) m.set(k.slice(0, 7), (m.get(k.slice(0, 7)) ?? 0) + v.amount);
      bars = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); const k = d.toISOString().slice(0, 7); return { label: k, amount: m.get(k) ?? 0 }; }); }
    const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14).map(([date, v]) => ({ date, ...v, status: "paid" as const }));
    return c.json({ ok: true, report: { today: byDay.get(dayKey(new Date()))?.amount ?? 0, total: bars.reduce((s, b) => s + b.amount, 0), bars, days, feePct: cfg.JAZL_FEE_PCT, testMode: cfg.PAYMENTS_MODE === "test" } });
  });

  // ── 05 · Кассир: QR сеансы ───────────────────────────────────
  const MakeQr = z.object({ branchId: z.string().uuid(), offerId: z.string().uuid(), units: z.number().int().min(1).max(20), extra: z.number().int().min(0).max(1_000_000).default(0) }).strict();
  r.post("/venue/qr", async (c) => {
    const b = MakeQr.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [br] = await db.select().from(branches).where(eq(branches.id, b.data.branchId)).limit(1);
    if (!br) return c.json({ ok: false, error: "not_found" }, 404);
    const me = await guard(c, br.venueId);
    if (!me || (me.branchId && me.branchId !== br.id)) return deny(c);
    const [of] = await db.select().from(offers).where(and(eq(offers.id, b.data.offerId), eq(offers.venueId, br.venueId))).limit(1);
    if (!of) return c.json({ ok: false, error: "offer_not_found" }, 404);
    const bs = branchStatus(br);
    if (!bs.open) return c.json({ ok: false, error: "branch_closed", status: bs }, 409); // жұмыс уақытынан тыс QR жоқ
    const code = await freeCode();
    const codeExp = new Date(Date.now() + CODE_MS);
    const [s] = await db.insert(qrSessions).values({ code, codeExp, branchId: br.id, offerId: of.id, units: b.data.units, extra: b.data.extra, createdBy: c.get("user").id, expiresAt: new Date(Date.now() + SESSION_MS) }).returning();
    return c.json({ ok: true, session: { id: s.id, code, codeExp, expiresAt: s.expiresAt, ...qrAt(s.id, codeExp) } });
  });

  /** 4 таңбалы код: қазір жарамды (30 с + 15 с шыдам) басқа сеанста жоқ болуы керек */
  async function freeCode() {
    let code = "";
    for (let i = 0; i < 12; i++) {
      code = String(randomInt(0, 10000)).padStart(4, "0");
      const [taken] = await db.select({ id: qrSessions.id }).from(qrSessions).where(and(eq(qrSessions.code, code), gt(qrSessions.codeExp, new Date(Date.now() - 15_000)))).limit(1);
      if (!taken) break;
    }
    return code;
  }
  /** QR суретінің мерзімі кодпен бірдей: екеуі бірге жаңарады */
  const qrAt = (id: string, codeExp: Date) => makeSessionQr(cfg.BOT_TOKEN, id, Math.floor(codeExp.getTime() / 1000) - 30);

  // Кассир экраны әр 2 с сұрайды: жаңа QR суреті (30 с) + күйі (күтілуде / төленді / мерзімі өтті)
  r.get("/venue/qr/:id", async (c) => {
    const [x] = await db.select({ s: qrSessions, b: branches }).from(qrSessions).innerJoin(branches, eq(qrSessions.branchId, branches.id)).where(eq(qrSessions.id, c.req.param("id"))).limit(1);
    if (!x || !(await guard(c, x.b.venueId))) return c.json({ ok: false, error: "not_found" }, 404);
    if (x.s.redemptionId) {
      const res = await db.execute(sql`select r.id, r.units, r.created_at, r.cancelled_at, o.title, (p.price_paid / p.units_total)::int as unit_price, p.units_left, p.units_total, u.first_name, u.last_name,
          (select no from app.receipts rc where rc.internal->>'redemptionId' = r.id::text limit 1) as receipt_no, (select id from app.receipts rc where rc.internal->>'redemptionId' = r.id::text limit 1) as receipt_id
        from app.redemptions r join app.packs p on p.id = r.pack_id join app.offers o on o.id = p.offer_id join app.users u on u.id = p.user_id where r.id = ${x.s.redemptionId}`);
      const d = res.rows[0] as { id: string; units: number; created_at: Date; cancelled_at: Date | null; title: string; unit_price: number; units_left: number; units_total: number; first_name: string; last_name: string | null; receipt_no: number | null; receipt_id: string | null };
      return c.json({ ok: true, status: "paid", paid: { redemptionId: d.id, customer: short(d.first_name, d.last_name), title: d.title.split(" · ")[0], units: d.units, left: d.units_left, total: d.units_total,
        amount: d.unit_price * d.units, venueAmount: share(d.unit_price * d.units), extra: x.s.extra, at: d.created_at, ref: d.receipt_no ? "JZ-" + d.receipt_no : null, receiptId: d.receipt_id, cancelled: Boolean(d.cancelled_at) } });
    }
    if (x.s.cancelledAt) return c.json({ ok: true, status: "cancelled" });
    if (x.s.expiresAt.getTime() < Date.now()) return c.json({ ok: true, status: "expired" });
    let { code, codeExp } = x.s;
    if (codeExp.getTime() <= Date.now() + 1000) { // 30 с өтті — жаңа код пен QR
      code = await freeCode(); codeExp = new Date(Date.now() + CODE_MS);
      await db.update(qrSessions).set({ code, codeExp }).where(eq(qrSessions.id, x.s.id));
    }
    const [of] = x.s.offerId ? await db.select().from(offers).where(eq(offers.id, x.s.offerId)).limit(1) : [];
    // Кассирге баға көрсетілмейді (Патша, 2026-11-17) — тек пакет пен бірлік
    return c.json({ ok: true, status: "waiting", code, codeExp, expiresAt: x.s.expiresAt, units: x.s.units, extra: x.s.extra,
      title: of ? of.title.split(" · ")[0] : null, unitName: of?.unitName ?? null, ...qrAt(x.s.id, codeExp) });
  });
  r.post("/venue/qr/:id/cancel", async (c) => {
    const [x] = await db.select({ s: qrSessions, b: branches }).from(qrSessions).innerJoin(branches, eq(qrSessions.branchId, branches.id)).where(eq(qrSessions.id, c.req.param("id"))).limit(1);
    if (!x || !(await guard(c, x.b.venueId))) return c.json({ ok: false, error: "not_found" }, 404);
    await db.update(qrSessions).set({ cancelledAt: new Date() }).where(and(eq(qrSessions.id, x.s.id), isNull(qrSessions.redemptionId)));
    return c.json({ ok: true });
  });

  // Сынақ режимі ғана: өзіңді мекеменің иесі қылу (телефоннан сынау үшін). Нақты режимде 404.
  r.post("/venue/dev-join", async (c) => {
    if (cfg.PAYMENTS_MODE !== "test") return c.json({ ok: false, error: "disabled" }, 404);
    const b = z.object({ venueSlug: z.string().min(1).max(64), leave: z.boolean().optional() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [v] = await db.select().from(venues).where(eq(venues.slug, b.data.venueSlug)).limit(1);
    if (!v) return c.json({ ok: false, error: "not_found" }, 404);
    const userId = c.get("user").id;
    if (b.data.leave) await db.delete(venueStaff).where(and(eq(venueStaff.venueId, v.id), eq(venueStaff.userId, userId)));
    else await db.insert(venueStaff).values({ venueId: v.id, userId, role: "owner" }).onConflictDoUpdate({ target: [venueStaff.venueId, venueStaff.userId], set: { role: "owner", branchId: null, status: "active" } });
    return c.json({ ok: true, venue: v.name });
  });

  void packs; void redemptions;
  return r;
}
