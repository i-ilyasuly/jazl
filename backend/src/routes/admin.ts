// Medeo Басқару (Figma «Medeo Басқару» 14060:7998): платформа иесінің беттері.
// Кіру: ADMIN_IDS тізіміндегі Telegram аккаунты (initData) + жеке PIN → 12 сағаттық X-Admin-Token.
// Қауіпті әрекеттер (комиссия, тоқтату, қолмен қайтару, ұзарту, техникалық жұмыстар) PIN-мен қайта расталады. Әр өзгеріс — admin_log.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { adminLog, admins, users, venueApplications, venueNotes, venues } from "../db/schema.js";
import { validateLoginWidget } from "../auth/telegram.js";
import { adminPrefDefaults, type Notifier } from "../notify.js";
import { getSettings, refreshFees, setSetting, SETTING_DEFAULTS, type Settings } from "../settings.js";
import { leftValueSql } from "../value.js";
import { pushRefund } from "../refund.js";
import { approve, bankOf, posName, type AppData } from "./apply.js";
import { decideComplaint } from "./complaints.js";

type Row = Record<string, unknown>;
/** Мекемеге төленетін тапсырыс күйлері: орындалды не клиент келмеді (бірлік жұмсалды, мекеме уақытын бөлді) */
const PAYABLE = sql.raw("('done','missed')");
const TOKEN_TTL = 12 * 3600;
const LOCK_MIN = 15;
const short = (f: string, l: string | null) => (l ? `${f} ${l.slice(0, 1)}.` : f);
const head = (t: string) => t.split(" · ")[0];
const kindName: Record<string, string> = { food: "Тағамдар", coffee: "Кофе", hair: "Шаштараз" };
const almatyMidnight = () => new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" })}T00:00:00+05:00`);
/** Кезең: today | 7 | 30 | all → [from, to) және алдыңғы тең кезең (өсімді есептеу үшін) */
function periodOf(p: string) {
  const to = new Date();
  const from = p === "today" ? almatyMidnight() : p === "7" ? new Date(to.getTime() - 7 * 86400_000) : p === "30" ? new Date(to.getTime() - 30 * 86400_000) : new Date("2020-01-01");
  const len = to.getTime() - from.getTime();
  return { from, to, prevFrom: new Date(from.getTime() - (p === "today" ? 86400_000 : len)), prevTo: p === "today" ? new Date(to.getTime() - 86400_000) : from, all: p === "all" };
}
const growth = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);

function hashPin(pin: string) { const salt = randomBytes(16); return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`; }
function pinOk(pin: string, stored: string) {
  const [s, h] = stored.split(":"); if (!s || !h) return false;
  const a = scryptSync(pin, Buffer.from(s, "hex"), 32); const b = Buffer.from(h, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Басқару токенінің қолтаңбасы (Mini App-та X-Admin-Token, вебте «Authorization: adm <userId>.<exp>.<sig>») */
export const adminSig = (cfg: Config, userId: string, exp: number) => createHmac("sha256", cfg.BOT_TOKEN).update(`adm:${userId}:${exp}`).digest("hex").slice(0, 32);
const adminIds = (cfg: Config) => new Set(cfg.ADMIN_IDS.split(",").map((x) => x.trim()).filter(Boolean));

/** PIN тексеру (кіру мен қауіпті әрекет үшін ортақ): 3 қате → 15 минут бұғат */
async function checkPinDb(db: Db, userId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string; left?: number; until?: Date }> {
  const [a] = await db.select().from(admins).where(eq(admins.userId, userId)).limit(1);
  if (!a?.pinHash) return { ok: false, error: "no_pin" };
  if (a.lockedUntil && a.lockedUntil.getTime() > Date.now()) return { ok: false, error: "locked", until: a.lockedUntil };
  if (pinOk(pin, a.pinHash)) { await db.update(admins).set({ failed: 0, lockedUntil: null }).where(eq(admins.userId, userId)); return { ok: true }; }
  const failed = a.failed + 1;
  const lock = failed >= 3 ? new Date(Date.now() + LOCK_MIN * 60_000) : null;
  await db.update(admins).set({ failed: lock ? 0 : failed, lockedUntil: lock }).where(eq(admins.userId, userId));
  return lock ? { ok: false, error: "locked", until: lock } : { ok: false, error: "bad_pin", left: 3 - failed };
}
const weakPin = (p: string) => /^(\d)\1{3}$/.test(p) || ["1234", "4321", "0123"].includes(p);

export function adminRoutes(cfg: Config, db: Db, notify?: Notifier) {
  const r = new Hono<Env>();
  const ids = adminIds(cfg);
  const isAdmin = (c: Context<Env>) => ids.has(String(c.get("user").telegramId));
  const sign = (userId: string, exp: number) => adminSig(cfg, userId, exp);
  const token = (userId: string) => { const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL; return `${exp}.${sign(userId, exp)}`; };
  const tokenOk = (c: Context<Env>) => {
    const [e, s] = (c.req.header("X-Admin-Token") ?? "").split(".");
    const exp = Number(e);
    return Boolean(s && exp > Date.now() / 1000 && s === sign(c.get("user").id, exp));
  };
  const rows = async <T = Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
  const log = (c: Context<Env>, action: string, target: string, meta?: object) => db.insert(adminLog).values({ adminId: c.get("user").id, action, target, meta: meta ?? null });

  const checkPin = (userId: string, pin: string) => checkPinDb(db, userId, pin);
  const pinFail = (c: Context<Env>, p: { error: string; left?: number; until?: Date }) => c.json({ ok: false, error: p.error, left: p.left ?? null, until: p.until ?? null }, p.error === "locked" ? 423 : 403);
  const Pin = z.string().regex(/^\d{4}$/);

  // ── 01 · Кіру ───────────────────────────────────────────────────
  r.get("/admin/me", async (c) => {
    const u = c.get("user");
    if (!isAdmin(c)) return c.json({ ok: true, admin: false, telegramId: u.telegramId });
    await db.insert(admins).values({ userId: u.id }).onConflictDoNothing();
    const [a] = await db.select().from(admins).where(eq(admins.userId, u.id)).limit(1);
    return c.json({ ok: true, admin: true, telegramId: u.telegramId, name: u.firstName, hasPin: Boolean(a.pinHash), lockedUntil: a.lockedUntil && a.lockedUntil.getTime() > Date.now() ? a.lockedUntil : null, session: tokenOk(c) });
  });
  // PIN: алғаш — орнату (setup), кейін — кіру. Жауапта токен.
  r.post("/admin/pin", async (c) => {
    if (!isAdmin(c)) return c.json({ ok: false, error: "forbidden" }, 403);
    const b = z.object({ pin: Pin, setup: z.boolean().optional() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const u = c.get("user");
    await db.insert(admins).values({ userId: u.id }).onConflictDoNothing();
    const [a] = await db.select().from(admins).where(eq(admins.userId, u.id)).limit(1);
    if (!a.pinHash) {
      if (!b.data.setup) return c.json({ ok: false, error: "no_pin" }, 409);
      if (weakPin(b.data.pin)) return c.json({ ok: false, error: "weak_pin" }, 400);
      await db.update(admins).set({ pinHash: hashPin(b.data.pin) }).where(eq(admins.userId, u.id));
      await log(c, "PIN орнатылды", u.firstName);
      return c.json({ ok: true, token: token(u.id) });
    }
    const p = await checkPin(u.id, b.data.pin);
    if (!p.ok) return pinFail(c, p);
    return c.json({ ok: true, token: token(u.id) });
  });
  // Қалған барлық маршрут — тек тізімдегі аккаунт + жарамды токен
  r.use("/admin/*", async (c, next) => {
    if (c.req.path.endsWith("/admin/me") || c.req.path.endsWith("/admin/pin")) return next();
    if (!isAdmin(c)) return c.json({ ok: false, error: "forbidden" }, 403);
    if (!tokenOk(c)) return c.json({ ok: false, error: "admin_session" }, 401);
    await next();
  });
  /** Қауіпті әрекет: денесіндегі pin қайта тексеріледі (Figma «Әрекетті растаңыз») */
  const danger = async (c: Context<Env>, pin: unknown) => {
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) return c.json({ ok: false, error: "pin_required" }, 403);
    const p = await checkPin(c.get("user").id, pin);
    return p.ok ? null : pinFail(c, p);
  };

  // ── 02 · Пульс ──────────────────────────────────────────────────
  const feeExpr = sql.raw(`coalesce(v.fee_pct, v.auto_fee_pct, ${Number(cfg.MEDEO_FEE_PCT)})`);
  const salesIn = async (from: Date, to: Date) => (await rows<{ sales: number; fee: number; packs: number }>(sql`
    select coalesce(sum(p.price_paid), 0)::int as sales, coalesce(sum(round(p.price_paid * ${feeExpr} / 100.0)), 0)::int as fee, count(*)::int as packs
    from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id
    where p.status <> 'pending_payment' and p.source <> 'carry' and p.price_paid > 0 and p.created_at >= ${from} and p.created_at < ${to}`))[0];
  const usedIn = async (from: Date, to: Date) => (await rows<{ units: number }>(sql`
    select (coalesce((select sum(units) from app.redemptions where cancelled_at is null and created_at >= ${from} and created_at < ${to}), 0)
      + (select count(*) from app.orders where status not in ('cancelled','failed') and created_at >= ${from} and created_at < ${to}))::int as units`))[0].units;
  const attention = async () => {
    const s = await getSettings(db);
    const [x] = await rows<{ apps: number; oldest: Date | null; offers_new: number; offers_changed: number; complaints: number; due_today: number; failed: number; grace: number; sold: number; refund_failed: number }>(sql`select
      (select count(*) from app.venue_applications where status = 'review')::int as apps,
      (select min(submitted_at) from app.venue_applications where status = 'review') as oldest,
      (select count(*) from app.offers o where o.status = 'review' and not exists (select 1 from app.packs p where p.offer_id = o.id))::int as offers_new,
      (select count(*) from app.offers o where o.status = 'review' and exists (select 1 from app.packs p where p.offer_id = o.id))::int as offers_changed,
      (select count(*) from app.complaints where status = 'new')::int as complaints,
      (select count(*) from app.complaints where status = 'new' and created_at + make_interval(hours => ${s.complaintHours}) < now() + interval '1 day')::int as due_today,
      (select count(*) from app.payments where status = 'failed' and created_at > now() - interval '1 day')::int as failed,
      (select count(*) from app.packs where units_left > 0 and valid_until < now() and valid_until > now() - make_interval(days => ${s.graceDays}) and valid_until + make_interval(days => ${s.graceDays}) < now() + interval '1 day')::int as grace,
      (select count(*) from app.packs where status <> 'pending_payment' and source <> 'carry')::int as sold,
      (select count(*) from app.payments where refund_status = 'failed' or (refund_status = 'pending' and coalesce((meta->>'refundAt')::timestamptz, created_at) < now() - interval '15 minutes'))::int as refund_failed`);
    return { ...x, tickAt: s.lastTick || null };
  };
  r.get("/admin/pulse", async (c) => {
    const p = periodOf(c.req.query("period") ?? "today");
    const [now, prev, used, usedPrev] = await Promise.all([salesIn(p.from, p.to), salesIn(p.prevFrom, p.prevTo), usedIn(p.from, p.to), usedIn(p.prevFrom, p.prevTo)]);
    const [cl] = await rows<{ now: number; prev: number; active: number; total: number; paused: number }>(sql`select
      (select count(*) from app.users where created_at >= ${p.from})::int as now, (select count(*) from app.users where created_at >= ${p.prevFrom} and created_at < ${p.prevTo})::int as prev,
      (select count(*) from app.venues where status = 'active')::int as active, (select count(*) from app.venues where status in ('active','paused'))::int as total,
      (select count(*) from app.venues where status = 'paused')::int as paused`);
    const days = await rows<{ d: string; sales: number }>(sql`select to_char(g.d, 'YYYY-MM-DD') as d, coalesce(sum(p.price_paid), 0)::int as sales
      from generate_series((now() at time zone 'Asia/Almaty')::date - 6, (now() at time zone 'Asia/Almaty')::date, interval '1 day') g(d)
      left join app.packs p on (p.created_at at time zone 'Asia/Almaty')::date = g.d::date and p.status <> 'pending_payment' and p.source <> 'carry'
      group by g.d order by g.d`);
    const feed = await rows<{ kind: string; at: Date; first_name: string; last_name: string | null; title: string; venue: string; amount: number; units: number }>(sql`select * from (
        select 'buy' as kind, p.created_at as at, u.first_name, u.last_name, o.title, v.name as venue, p.price_paid as amount, p.units_total::int as units from app.packs p join app.users u on u.id = p.user_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where p.status <> 'pending_payment' and p.source = 'purchase'
        union all select 'use', r.created_at, u.first_name, u.last_name, o.title, v.name, 0, r.units::int from app.redemptions r join app.packs p on p.id = r.pack_id join app.users u on u.id = p.user_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where r.cancelled_at is null
        union all select case when od.type = 'plan' then 'plan' else 'order' end, od.created_at, u.first_name, u.last_name, o.title, v.name, 0, 1 from app.orders od join app.users u on u.id = od.user_id join app.packs p on p.id = od.pack_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id
        union all select 'gift', p.created_at, u.first_name, u.last_name, o.title, v.name, 0, 1 from app.packs p join app.users u on u.id = p.user_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where p.source = 'gift'
        union all select 'complaint', cm.created_at, u.first_name, u.last_name, o.title, v.name, 0, 0 from app.complaints cm join app.users u on u.id = cm.user_id join app.packs p on p.id = cm.pack_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = cm.venue_id
      ) x order by at desc limit 12`);
    return c.json({ ok: true, pulse: {
      sales: now.sales, salesGrowth: growth(now.sales, prev.sales), fee: now.fee, feeGrowth: growth(now.fee, prev.fee), packs: now.packs, packsDelta: now.packs - prev.packs,
      units: used, unitsGrowth: growth(used, usedPrev), clients: cl.now, clientsDelta: cl.now - cl.prev, venuesActive: cl.active, venuesTotal: cl.total, venuesPaused: cl.paused,
      week: days, weekTotal: days.reduce((a, d) => a + d.sales, 0),
      feed: feed.map((x) => ({ kind: x.kind, at: x.at, who: short(x.first_name, x.last_name), title: head(x.title), venue: x.venue, amount: x.amount, units: x.units })),
    }, attention: await attention() });
  });
  r.get("/admin/attention", async (c) => c.json({ ok: true, attention: await attention() }));
  // Сәтсіз қайтарулар (провайдер қабылдамаған): тізім және «Қайта жіберу» (src/refund.ts)
  r.get("/admin/refunds/failed", async (c) => {
    const list = await rows<Row>(sql`select p.id, p.amount, p.refunded, p.refund_status, p.refund_failure, p.meta->>'lastRefund' as last, p.meta->>'refundAt' as at, u.first_name, u.last_name from app.payments p join app.users u on u.id = p.user_id
      where p.refund_status = 'failed' or (p.refund_status = 'pending' and coalesce((p.meta->>'refundAt')::timestamptz, p.created_at) < now() - interval '15 minutes') order by p.created_at desc limit 100`);
    return c.json({ ok: true, refunds: list.map((x) => ({ id: x.id, amount: Number(x.last ?? x.refunded), status: x.refund_status, reason: x.refund_failure, at: x.at, customer: short(String(x.first_name), x.last_name as string | null) })) });
  });
  r.post("/admin/payments/:id/refund-retry", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { pin?: unknown };
    const bad = await danger(c, body.pin); if (bad) return bad; // ақша әрекеті — PIN-мен
    // Жолды бір сұраумен «алып қоямыз» (failed → pending): екі рет басылса да ақша екі рет қайтарылмайды
    const [x] = await rows<{ id: string }>(sql`update app.payments set refund_status = 'pending' where id = ${c.req.param("id")} and refund_status in ('failed') returning id`);
    if (!x) return c.json({ ok: false, error: "not_failed" }, 409);
    const st = await pushRefund(db, cfg, x.id);
    await log(c, "Қайтару қайта жіберілді", `${x.id.slice(0, 8)} · ${st}`, { paymentId: x.id, result: st });
    return c.json({ ok: st === "done", refundStatus: st });
  });

  // ── 03 · Мекемелер ──────────────────────────────────────────────
  r.get("/admin/venues", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const like = `%${q}%`;
    const list = await rows<Row>(sql`select v.id, v.name, v.kind, v.city, v.status, v.rating, v.reviews_count as reviews, v.created_at,
        (select count(*) from app.branches b where b.venue_id = v.id and b.active)::int as branches,
        coalesce((select sum(p.price_paid) from app.packs p join app.offers o on o.id = p.offer_id where o.venue_id = v.id and p.status <> 'pending_payment' and p.created_at > now() - interval '30 days'), 0)::int as sales30
      from app.venues v where v.status in ('active','paused','closed') and (${q} = '' or v.name ilike ${like} or v.city ilike ${like}) order by sales30 desc, v.name`);
    const apps = await rows<Row>(sql`select a.id, a.data->>'name' as name, a.data->>'kind' as kind, a.data->>'bin' as bin, a.submitted_at from app.venue_applications a
      where a.status = 'review' and (${q} = '' or a.data->>'name' ilike ${like} or a.data->>'bin' like ${like}) order by a.submitted_at`);
    return c.json({ ok: true, venues: list.map((v) => ({ ...v, kindName: kindName[v.kind as string] })), applications: apps.map((a) => ({ ...a, kindName: kindName[a.kind as string] ?? "—" })) });
  });

  r.get("/admin/venues/:id", async (c) => {
    const id = c.req.param("id");
    const [v] = await rows<Row & { fee_pct: number | null }>(sql`select v.*, v.reviews_count as reviews from app.venues v where v.id = ${id}`);
    if (!v) return c.json({ ok: false, error: "not_found" }, 404);
    const [s] = await rows<{ sales30: number; prev30: number; uses30: number; complaints30: number; branches: number; offers: number; team: number; complaints: number; notes: number; active_packs: number }>(sql`select
      coalesce((select sum(p.price_paid) from app.packs p join app.offers o on o.id = p.offer_id where o.venue_id = ${id} and p.status <> 'pending_payment' and p.created_at > now() - interval '30 days'), 0)::int as sales30,
      coalesce((select sum(p.price_paid) from app.packs p join app.offers o on o.id = p.offer_id where o.venue_id = ${id} and p.status <> 'pending_payment' and p.created_at between now() - interval '60 days' and now() - interval '30 days'), 0)::int as prev30,
      (select count(*) from app.redemptions r join app.branches b on b.id = r.branch_id where b.venue_id = ${id} and r.cancelled_at is null and r.created_at > now() - interval '30 days')::int as uses30,
      (select count(*) from app.complaints where venue_id = ${id} and created_at > now() - interval '30 days')::int as complaints30,
      (select count(*) from app.branches where venue_id = ${id} and active)::int as branches,
      (select count(*) from app.offers where venue_id = ${id} and status = 'active')::int as offers,
      (select count(*) from app.venue_staff where venue_id = ${id} and status = 'active')::int as team,
      (select count(*) from app.complaints where venue_id = ${id})::int as complaints,
      (select count(*) from app.venue_notes where venue_id = ${id})::int as notes,
      (select count(*) from app.packs p join app.offers o on o.id = p.offer_id where o.venue_id = ${id} and p.status = 'active' and p.units_left > 0 and p.valid_until > now())::int as active_packs`);
    // Айла белгілері (Патша, 2026-11-17): күйген бірлік үлесі (90 күн, платформа орташасымен) және «мекеме қабылдамады» шағымдары (30 күн, түрлі клиент)
    const [g] = await rows<{ burned: number; sold: number; burned_all: number; sold_all: number; refused: number }>(sql`select
      coalesce((select sum(b.units) from app.bonuses b join app.packs p on p.id = b.pack_id join app.offers o on o.id = p.offer_id where o.venue_id = ${id} and b.created_at > now() - interval '90 days'), 0)::int as burned,
      coalesce((select sum(p.units_total) from app.packs p join app.offers o on o.id = p.offer_id where o.venue_id = ${id} and p.status <> 'pending_payment' and p.source <> 'carry' and p.created_at > now() - interval '120 days'), 0)::int as sold,
      coalesce((select sum(b.units) from app.bonuses b where b.pack_id is not null and b.created_at > now() - interval '90 days'), 0)::int as burned_all,
      coalesce((select sum(p.units_total) from app.packs p where p.status <> 'pending_payment' and p.source <> 'carry' and p.created_at > now() - interval '120 days'), 0)::int as sold_all,
      (select count(distinct user_id) from app.complaints where venue_id = ${id} and reason = 'refused' and created_at > now() - interval '30 days')::int as refused`);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const fee = v.fee_pct ?? cfg.MEDEO_FEE_PCT;
    const complaintShare = s.uses30 ? Math.round((s.complaints30 / s.uses30) * 1000) / 10 : 0;
    return c.json({ ok: true, venue: { id: v.id, name: v.name, kind: v.kind, kindName: kindName[v.kind as string], city: v.city, status: v.status, statusNote: v.status_note, createdAt: v.created_at, rating: v.rating, reviews: v.reviews,
      feePct: fee, feeCustom: v.fee_pct !== null, sales30: s.sales30, salesGrowth: growth(s.sales30, s.prev30), fee30: Math.round((s.sales30 * fee) / 100), complaintShare,
      branches: s.branches, offers: s.offers, team: s.team, complaints: s.complaints, notes: s.notes, activePacks: s.active_packs,
      burnShare: pct(g.burned, g.sold), burnAvg: pct(g.burned_all, g.sold_all), refused30: g.refused,
      eligible8: Number(v.rating ?? 0) >= 4.7 && Number(v.reviews) >= 20 && complaintShare < 2 } });
  });
  // Комиссия (10 — негізгі, 8 — жоғары рейтинг): PIN-мен
  r.post("/admin/venues/:id/fee", async (c) => {
    const b = z.object({ feePct: z.union([z.literal(8), z.literal(10)]), pin: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const bad = await danger(c, b.data.pin); if (bad) return bad;
    const [v] = await db.select().from(venues).where(eq(venues.id, c.req.param("id"))).limit(1);
    if (!v) return c.json({ ok: false, error: "not_found" }, 404);
    const before = v.feePct ?? cfg.MEDEO_FEE_PCT;
    await db.update(venues).set({ feePct: b.data.feePct === cfg.MEDEO_FEE_PCT ? null : b.data.feePct }).where(eq(venues.id, v.id));
    await refreshFees(db);
    await log(c, "Комиссия өзгерді", `${v.name} · ${before}% → ${b.data.feePct}%`, { venueId: v.id, before, after: b.data.feePct });
    return c.json({ ok: true });
  });
  // Тоқтату (уақытша: paused) / біржола (closed) / қайта қосу (active): PIN-мен, себебі мекемеге көрінеді
  r.post("/admin/venues/:id/status", async (c) => {
    const b = z.object({ status: z.enum(["active", "paused", "closed"]), reason: z.string().trim().max(200).default(""), pin: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    if (b.data.status !== "active" && b.data.reason.length < 3) return c.json({ ok: false, error: "reason_required" }, 400);
    const bad = await danger(c, b.data.pin); if (bad) return bad;
    const [v] = await db.select().from(venues).where(eq(venues.id, c.req.param("id"))).limit(1);
    if (!v) return c.json({ ok: false, error: "not_found" }, 404);
    await db.update(venues).set({ status: b.data.status, statusNote: b.data.status === "active" ? null : b.data.reason }).where(eq(venues.id, v.id));
    await log(c, b.data.status === "active" ? "Мекеме қайта қосылды" : b.data.status === "paused" ? "Мекеме тоқтатылды" : "Мекеме біржола жабылды", `${v.name}${b.data.reason ? " · " + b.data.reason : ""}`, { venueId: v.id, from: v.status, to: b.data.status });
    await notify?.venueStatus(v.id, b.data.status !== "active", b.data.reason);
    return c.json({ ok: true });
  });
  r.post("/admin/venues/:id/message", async (c) => {
    const b = z.object({ text: z.string().trim().min(3).max(800) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [v] = await db.select().from(venues).where(eq(venues.id, c.req.param("id"))).limit(1);
    if (!v) return c.json({ ok: false, error: "not_found" }, 404);
    const n = (await notify?.toVenue(v.id, b.data.text)) ?? 0;
    await log(c, "Мекемеге хабарлама", `${v.name} · ${b.data.text.slice(0, 60)}`);
    return c.json({ ok: true, sent: n });
  });
  r.get("/admin/venues/:id/notes", async (c) => c.json({ ok: true, notes: await rows(sql`select n.id, n.text, n.created_at as at, u.first_name as author from app.venue_notes n join app.users u on u.id = n.admin_id where n.venue_id = ${c.req.param("id")} order by n.created_at desc`) }));
  r.post("/admin/venues/:id/notes", async (c) => {
    const b = z.object({ text: z.string().trim().min(2).max(1000) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    await db.insert(venueNotes).values({ venueId: c.req.param("id"), adminId: c.get("user").id, text: b.data.text });
    return c.json({ ok: true });
  });
  r.get("/admin/venues/:id/branches", async (c) => c.json({ ok: true, branches: await rows(sql`select id, address, active, is_247, closed_until from app.branches where venue_id = ${c.req.param("id")} order by created_at`) }));
  r.get("/admin/venues/:id/team", async (c) => c.json({ ok: true, team: await rows(sql`select u.first_name, u.last_name, u.username, s.role, s.status from app.venue_staff s join app.users u on u.id = s.user_id where s.venue_id = ${c.req.param("id")} order by s.role, u.first_name`) }));

  // Өтінімдер (Figma «Өтінімдер», «Өтінім беті», «Қайтару себебі», «Өтінім бекітілді»)
  r.get("/admin/applications", async (c) => {
    const st = c.req.query("status") ?? "review";
    const list = await rows<Row>(sql`select a.id, a.status, a.data->>'name' as name, a.data->>'kind' as kind, a.data->>'legalName' as legal_name, a.submitted_at, a.decided_at, a.note
      from app.venue_applications a where a.status = ${st} order by a.submitted_at nulls last limit 100`);
    const [n] = await rows<{ review: number; need_info: number; rejected: number }>(sql`select count(*) filter (where status = 'review')::int as review, count(*) filter (where status = 'need_info')::int as need_info, count(*) filter (where status = 'rejected')::int as rejected from app.venue_applications`);
    return c.json({ ok: true, counts: n, applications: list.map((a) => ({ ...a, kindName: kindName[a.kind as string] ?? "—", form: /^(ЖШС|ТОО|LLP)/i.test(String(a.legal_name ?? "")) ? "ЖШС" : "ЖК" })) });
  });
  r.get("/admin/applications/:id", async (c) => {
    const [a] = await db.select().from(venueApplications).where(eq(venueApplications.id, c.req.param("id"))).limit(1);
    if (!a) return c.json({ ok: false, error: "not_found" }, 404);
    const d = a.data as AppData;
    const docs = await rows<{ id: string; kind: string; file_name: string; mime: string; size: number }>(sql`select id, kind, file_name, mime, size from app.venue_docs where application_id = ${a.id} order by created_at`);
    const bank = d.iban ? bankOf(d.iban) : null;
    return c.json({ ok: true, application: { id: a.id, status: a.status, note: a.note, submittedAt: a.submittedAt, data: { ...d, kindName: kindName[d.kind ?? ""] ?? "—", bank: bank?.[0] ?? null, posName: d.pos ? (d.pos === "other" ? d.posOther || posName.other : posName[d.pos]) : null }, docs, venueId: a.venueId } });
  });
  // Мекемелер қандай касса бағдарламасын қолданады (жіберілген өтінімдер бойынша) — POS интеграциясын қайсысынан бастауды шешу үшін
  r.get("/admin/pos-stats", async (c) => {
    const list = await rows<{ pos: string; other: string | null; n: number }>(sql`select coalesce(data->>'pos', 'unknown') as pos, case when data->>'pos' = 'other' then data->>'posOther' end as other, count(*)::int as n
      from app.venue_applications where status <> 'draft' group by 1, 2 order by n desc`);
    const total = list.reduce((a, x) => a + x.n, 0);
    return c.json({ ok: true, total, items: list.map((x) => ({ pos: x.pos, name: x.pos === "unknown" ? "Белгісіз (ескі өтінім)" : x.pos === "other" ? x.other || posName.other : posName[x.pos] ?? x.pos, n: x.n })) });
  });
  // Құжатты ашу: жабық — тек админ токенімен, қысқа қолтаңбалы сілтеме арқылы (Telegram downloadFile header жібере алмайды)
  const docSig = (id: string, exp: number) => createHmac("sha256", cfg.BOT_TOKEN).update(`doc:${id}:${exp}`).digest("hex").slice(0, 32);
  r.get("/admin/docs/:id/link", async (c) => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    return c.json({ ok: true, url: `/files/admin-doc/${c.req.param("id")}?e=${exp}&s=${docSig(c.req.param("id"), exp)}` });
  });
  r.post("/admin/applications/:id/approve", async (c) => {
    const [a] = await db.select().from(venueApplications).where(eq(venueApplications.id, c.req.param("id"))).limit(1);
    if (!a) return c.json({ ok: false, error: "not_found" }, 404);
    if (a.status !== "review") return c.json({ ok: false, error: "not_in_review" }, 409);
    const venueId = await approve(db, a);
    await log(c, "Өтінім бекітілді", (a.data as AppData).name ?? "—", { applicationId: a.id, venueId });
    await notify?.application(a.id);
    return c.json({ ok: true, venueId });
  });
  r.post("/admin/applications/:id/return", async (c) => {
    const b = z.object({ status: z.enum(["need_info", "rejected"]), reason: z.string().trim().min(2).max(60), note: z.string().trim().max(400).default("") }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [a] = await db.select().from(venueApplications).where(eq(venueApplications.id, c.req.param("id"))).limit(1);
    if (!a) return c.json({ ok: false, error: "not_found" }, 404);
    if (a.status !== "review") return c.json({ ok: false, error: "not_in_review" }, 409);
    const note = [b.data.reason, b.data.note].filter(Boolean).join(". ");
    await db.update(venueApplications).set({ status: b.data.status, note, decidedAt: new Date() }).where(eq(venueApplications.id, a.id));
    await log(c, b.data.status === "need_info" ? "Өтінім түзетуге жіберілді" : "Өтінім қабылданбады", `${(a.data as AppData).name ?? "—"} · ${b.data.reason}`, { applicationId: a.id });
    await notify?.application(a.id);
    return c.json({ ok: true });
  });

  // ── 04 · Ұсыныстар модерациясы ──────────────────────────────────
  const offerRow = (x: Row) => {
    const units = Number(x.units); const regular = Number(x.regular_unit_price) * units; const price = Number(x.price);
    return { id: x.id, title: head(String(x.title)), units, unitName: x.unit_name, price, regular, discount: regular ? Math.round((1 - price / regular) * 100) : 0, unitPrice: Math.round(price / units),
      status: x.status, venue: x.venue, venueId: x.venue_id, kind: x.kind, sold: Number(x.sold ?? 0), isNew: Number(x.sold ?? 0) === 0, reviewNote: x.review_note, photos: (x.photos as string[] | null)?.length ?? 0, validDays: x.valid_days, createdAt: x.created_at };
  };
  r.get("/admin/offers", async (c) => {
    const tab = c.req.query("tab") ?? "queue"; const q = (c.req.query("q") ?? "").trim(); const like = `%${q}%`; const venueId = c.req.query("venue") ?? "";
    const st = tab === "queue" ? ["review"] : tab === "active" ? ["active"] : ["paused", "ended"];
    const list = await rows<Row>(sql`select o.*, v.name as venue, (select count(*) from app.packs p where p.offer_id = o.id and p.status <> 'pending_payment')::int as sold
      from app.offers o join app.venues v on v.id = o.venue_id where o.status in (${sql.join(st.map((x) => sql`${x}`), sql`, `)}) and (${q} = '' or o.title ilike ${like} or v.name ilike ${like}) and (${venueId} = '' or o.venue_id::text = ${venueId})
      order by ${tab === "queue" ? sql`o.created_at` : sql`sold desc`} limit 200`);
    const [n] = await rows<{ queue: number; active: number; stopped: number }>(sql`select count(*) filter (where status = 'review')::int as queue, count(*) filter (where status = 'active')::int as active, count(*) filter (where status in ('paused','ended'))::int as stopped from app.offers`);
    return c.json({ ok: true, counts: n, offers: list.map(offerRow) });
  });
  r.get("/admin/offers/:id", async (c) => {
    const [x] = await rows<Row>(sql`select o.*, v.name as venue, (select count(*) from app.packs p where p.offer_id = o.id and p.status <> 'pending_payment')::int as sold from app.offers o join app.venues v on v.id = o.venue_id where o.id = ${c.req.param("id")}`);
    if (!x) return c.json({ ok: false, error: "not_found" }, 404);
    const o = offerRow(x);
    const about = String((x.details as { about?: string } | null)?.about ?? "");
    // Тексеру парағы (Figma «Ұсынысты тексеру»): ok | check | fail
    const checks = [
      { t: "Жеңілдік 10%-дан кем емес", sub: `${o.discount}%`, s: o.discount >= 10 ? "ok" : "fail" },
      { t: "Бөлек баға шынайы", sub: `Бөлек баға ${Number(x.regular_unit_price).toLocaleString("ru-RU")} ₸: мәзірмен қолмен тексеріңіз`, s: "check" },
      { t: "Фото бар және сапалы", sub: o.photos ? `${o.photos} фото` : "Фото жоқ", s: o.photos ? "ok" : "fail" },
      { t: "Сипаттама толық", sub: about.length >= 40 ? "Құрамы мен шектеулері жазылған" : "Тым қысқа", s: about.length >= 40 ? "ok" : "check" },
      { t: "Мерзімі ережеге сай", sub: `${o.validDays} күн`, s: Number(o.validDays) >= 7 && Number(o.validDays) <= 90 ? "ok" : "fail" },
    ];
    return c.json({ ok: true, offer: { ...o, about, photosList: x.photos, regularUnitPrice: x.regular_unit_price, kindName: kindName[x.kind as string], sizes: x.sizes, checks } });
  });
  r.post("/admin/offers/:id/approve", async (c) => {
    const [x] = await rows<{ title: string; venue: string; status: string }>(sql`select o.title, v.name as venue, o.status from app.offers o join app.venues v on v.id = o.venue_id where o.id = ${c.req.param("id")}`);
    if (!x) return c.json({ ok: false, error: "not_found" }, 404);
    if (x.status !== "review") return c.json({ ok: false, error: "not_in_review" }, 409);
    await db.execute(sql`update app.offers set status = 'active', review_note = null where id = ${c.req.param("id")}`);
    await log(c, "Ұсыныс бекітілді", `${head(x.title)} · ${x.venue}`, { offerId: c.req.param("id") });
    await notify?.offerReviewed(c.req.param("id"), "approved");
    return c.json({ ok: true });
  });
  // Түзету сұрау (жобаға қайтады, мекеме баннерде көреді) не мүлде қайтару (ended)
  r.post("/admin/offers/:id/fix", async (c) => {
    const b = z.object({ field: z.enum(["price", "photo", "about", "discount", "other"]), text: z.string().trim().min(3).max(300), reject: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [x] = await rows<{ title: string; venue: string }>(sql`select o.title, v.name as venue from app.offers o join app.venues v on v.id = o.venue_id where o.id = ${c.req.param("id")}`);
    if (!x) return c.json({ ok: false, error: "not_found" }, 404);
    const note = { text: b.data.text, field: b.data.field, at: new Date() };
    await db.execute(sql`update app.offers set status = ${b.data.reject ? "ended" : "draft"}, review_note = ${JSON.stringify(note)}::jsonb where id = ${c.req.param("id")}`);
    await log(c, b.data.reject ? "Ұсыныс қайтарылды" : "Ұсынысқа түзету сұралды", `${head(x.title)} · ${x.venue} · ${b.data.text.slice(0, 60)}`, { offerId: c.req.param("id") });
    await notify?.offerReviewed(c.req.param("id"), b.data.reject ? "stopped" : "fix", b.data.text);
    return c.json({ ok: true });
  });
  r.post("/admin/offers/:id/stop", async (c) => {
    const b = z.object({ reason: z.string().trim().min(3).max(200), pin: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const bad = await danger(c, b.data.pin); if (bad) return bad;
    const [x] = await rows<{ title: string; venue: string }>(sql`select o.title, v.name as venue from app.offers o join app.venues v on v.id = o.venue_id where o.id = ${c.req.param("id")}`);
    if (!x) return c.json({ ok: false, error: "not_found" }, 404);
    await db.execute(sql`update app.offers set status = 'paused', review_note = ${JSON.stringify({ text: b.data.reason, field: "stopped", at: new Date() })}::jsonb where id = ${c.req.param("id")}`);
    await log(c, "Ұсыныс тоқтатылды", `${head(x.title)} · ${x.venue}`, { offerId: c.req.param("id"), reason: b.data.reason });
    await notify?.offerReviewed(c.req.param("id"), "stopped", b.data.reason);
    return c.json({ ok: true });
  });

  // ── 06 · Пакеттер және қолданулар ───────────────────────────────
  const packRef = sql`(select 'MD-' || rc.no from app.receipts rc where rc.pack_id = p.id and rc.kind in ('purchase','gift') order by rc.created_at limit 1)`;
  r.get("/admin/packs", async (c) => {
    const tab = c.req.query("tab") ?? "active"; const q = (c.req.query("q") ?? "").trim().replace(/^(JZ|MD)-?/i, ""); const like = `%${q}%`;
    const s = await getSettings(db);
    const cond = tab === "expiring" ? sql`p.status = 'active' and p.units_left > 0 and p.valid_until between now() and now() + interval '7 days'`
      : tab === "grace" ? sql`p.units_left > 0 and p.valid_until < now() and p.valid_until > now() - make_interval(days => ${s.graceDays})`
      : tab === "ended" ? sql`(p.status in ('used','expired','refunded') or p.units_left = 0 or p.valid_until < now() - make_interval(days => ${s.graceDays}))`
      : sql`p.status = 'active' and p.units_left > 0 and p.valid_until > now()`;
    const search = q ? sql`and (u.first_name ilike ${like} or u.last_name ilike ${like} or p.id::text like ${q + "%"} or exists (select 1 from app.receipts rc where rc.pack_id = p.id and rc.no::text = ${q}) or exists (select 1 from app.orders od where od.pack_id = p.id and od.code = ${q}))` : sql``;
    const list = await rows<Row>(sql`select p.id, p.units_left::int as left, p.units_total::int as total, p.valid_until, p.status, o.title, o.kind, u.first_name, u.last_name, v.name as venue, ${packRef} as ref
      from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id join app.users u on u.id = p.user_id
      where p.status <> 'pending_payment' and ${q ? sql`true` : cond} ${search} order by p.created_at desc limit 60`);
    const [n] = await rows<Row>(sql`select count(*) filter (where status = 'active' and units_left > 0 and valid_until > now())::int as active,
        count(*) filter (where status = 'active' and units_left > 0 and valid_until between now() and now() + interval '7 days')::int as expiring,
        count(*) filter (where units_left > 0 and valid_until < now() and valid_until > now() - make_interval(days => ${s.graceDays}))::int as grace from app.packs where status <> 'pending_payment'`);
    return c.json({ ok: true, counts: n, packs: list.map((x) => ({ id: x.id, ref: x.ref ?? "—", title: head(String(x.title)), kind: x.kind, left: x.left, total: x.total, validUntil: x.valid_until, status: x.status, customer: short(String(x.first_name), x.last_name as string | null), venue: x.venue,
      daysLeft: Math.ceil((new Date(x.valid_until as string).getTime() - Date.now()) / 86400_000) })) });
  });
  r.get("/admin/packs/:id", async (c) => {
    const id = c.req.param("id");
    const [p] = await rows<Row>(sql`select p.*, o.title, o.unit_name, v.name as venue, v.id as venue_id, coalesce(v.fee_pct, v.auto_fee_pct, ${cfg.MEDEO_FEE_PCT})::int as fee_pct, u.first_name, u.last_name, ${packRef} as ref
      from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id join app.users u on u.id = p.user_id where p.id = ${id}`);
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const unitPrice = Math.round(Number(p.value_total ?? p.price_paid) / Number(p.units_total));
    const ev = await rows<Row>(sql`select e.type, e.units_delta, e.meta, e.created_at, b.address, cu.first_name as cashier, r.cancelled_at
      from app.pack_events e left join app.redemptions r on r.id = (e.meta->>'redemptionId')::uuid left join app.branches b on b.id = r.branch_id left join app.users cu on cu.id = r.cashier_id
      where e.pack_id = ${id} order by e.created_at desc`);
    const pay = await rows<{ method: string; amount: number }>(sql`select method, amount from app.payments where pack_id = ${id} order by created_at limit 1`);
    const fee = Number(p.fee_pct);
    return c.json({ ok: true, pack: { id: p.id, ref: p.ref ?? "—", title: head(String(p.title)), unitName: p.unit_name, units: p.units_total, left: p.units_left, total: p.units_total, validUntil: p.valid_until, status: p.status,
      customer: short(String(p.first_name), p.last_name as string | null), venue: p.venue, venueId: p.venue_id, unitPrice, pricePaid: p.price_paid, createdAt: p.created_at, method: pay[0]?.method ?? null,
      timeline: ev.map((e) => {
        const units = Math.abs(Number(e.units_delta)); const m = (e.meta ?? {}) as Record<string, unknown>;
        const venueAmt = Math.round((unitPrice * units * (100 - fee)) / 100);
        return { type: e.type, at: e.created_at, units, redemptionId: m.redemptionId ?? null, cancelled: Boolean(e.cancelled_at), address: e.address ?? null, cashier: e.cashier ?? null,
          venueAmount: e.type === "use" ? venueAmt : null, fee: e.type === "use" ? unitPrice * units - venueAmt : null, days: m.days ?? null };
      }) } });
  });
  r.post("/admin/packs/:id/extend", async (c) => {
    const b = z.object({ days: z.union([z.literal(3), z.literal(7), z.literal(14), z.literal(30)]), reason: z.string().trim().max(200).default(""), pin: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const bad = await danger(c, b.data.pin); if (bad) return bad;
    const id = c.req.param("id");
    const [p] = await rows<{ valid_until: Date; ref: string | null; units_left: number }>(sql`select p.valid_until, p.units_left, ${packRef} as ref from app.packs p where p.id = ${id}`);
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    // Мерзімі өтіп кеткен болса — бүгіннен бастап санаймыз
    await db.execute(sql`update app.packs set valid_until = greatest(valid_until, now()) + make_interval(days => ${b.data.days}), status = case when status = 'expired' and units_left > 0 then 'active' else status end where id = ${id}`);
    await db.execute(sql`insert into app.pack_events (pack_id, type, units_delta, meta) values (${id}, 'extend', 0, ${JSON.stringify({ days: b.data.days, by: c.get("user").id, via: "admin", reason: b.data.reason })}::jsonb)`);
    await log(c, "Мерзім ұзартылды", `${p.ref ?? id.slice(0, 8)} · +${b.data.days} күн`, { packId: id, reason: b.data.reason });
    return c.json({ ok: true });
  });
  // Бонус беру (2026-11-18): өтемақы не сынақ — пакет иесіне Medeo бонусы (kind manual). Ақша әрекеті — PIN-мен, журналға жазылады
  r.post("/admin/packs/:id/bonus", async (c) => {
    const b = z.object({ amount: z.number().int().min(100).max(50_000), reason: z.string().trim().min(3).max(200), pin: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const bad = await danger(c, b.data.pin); if (bad) return bad;
    const id = c.req.param("id");
    const [p] = await rows<{ user_id: string; ref: string | null }>(sql`select p.user_id, ${packRef} as ref from app.packs p where p.id = ${id}`);
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const months = (await getSettings(db)).bonusMonths;
    const [x] = await rows<{ id: string }>(sql`insert into app.bonuses (user_id, kind, amount, "left", units, expires_at) values (${p.user_id}, 'manual', ${b.data.amount}, ${b.data.amount}, 0, now() + make_interval(months => ${months})) returning id`);
    await log(c, "Бонус берілді", `${p.ref ?? id.slice(0, 8)} · ${b.data.amount} ₸`, { packId: id, bonusId: x.id, amount: b.data.amount, reason: b.data.reason });
    return c.json({ ok: true, bonusId: x.id });
  });
  // Қолдануды қайтару (Figma «Қолдануды қайтару»): соңғы (не көрсетілген) қолдану жойылып, бірлік пакетке оралады
  r.post("/admin/packs/:id/refund-use", async (c) => {
    const b = z.object({ redemptionId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(200), pin: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const bad = await danger(c, b.data.pin); if (bad) return bad;
    const id = c.req.param("id"); const by = c.get("user").id;
    const out = await db.transaction(async (tx) => {
      const rd = (await tx.execute(sql`select id, units from app.redemptions where pack_id = ${id} and cancelled_at is null ${b.data.redemptionId ? sql`and id = ${b.data.redemptionId}` : sql``} order by created_at desc limit 1 for update`)).rows[0] as { id: string; units: number } | undefined;
      if (!rd) return null;
      await tx.execute(sql`update app.redemptions set cancelled_at = now(), cancelled_by = ${by} where id = ${rd.id}`);
      await tx.execute(sql`update app.packs set units_left = least(units_total, units_left + ${rd.units}), status = case when status = 'used' then 'active' else status end where id = ${id}`);
      await tx.execute(sql`insert into app.pack_events (pack_id, type, units_delta, meta) values (${id}, 'use_cancelled', ${rd.units}, ${JSON.stringify({ redemptionId: rd.id, by, via: "admin", reason: b.data.reason })}::jsonb)`);
      await tx.execute(sql`update app.receipts set internal = jsonb_set(jsonb_set(internal, '{status,current}', '"cancelled"'), '{status,history}', (internal->'status'->'history') || jsonb_build_object('status','cancelled','at', now(), 'by', ${by}::text, 'via', 'admin')) where internal->>'redemptionId' = ${rd.id}`);
      return rd;
    });
    if (!out) return c.json({ ok: false, error: "no_use" }, 409);
    const [p] = await rows<{ ref: string | null }>(sql`select ${packRef} as ref from app.packs p where p.id = ${id}`);
    await log(c, "Қолдану қайтарылды", `${p?.ref ?? id.slice(0, 8)} · ${out.units} бірлік`, { packId: id, redemptionId: out.id, reason: b.data.reason });
    return c.json({ ok: true, returned: out.units });
  });

  // ── 07 · Ақша (шолу) ────────────────────────────────────────────
  r.get("/admin/money", async (c) => {
    const p = periodOf(c.req.query("period") ?? "30");
    const [now, prev] = await Promise.all([salesIn(p.from, p.to), salesIn(p.prevFrom, p.prevTo)]);
    const [m] = await rows<{ venue: number; uses: number; balance: number; payments: number; refunds: number; expired: number }>(sql`select
      (coalesce((select sum(round(r.amount * (100 - r.fee_pct) / 100.0)) from app.redemptions r where r.cancelled_at is null and r.created_at >= ${p.from}), 0)
        + coalesce((select sum(round(o.amount * (100 - o.fee_pct) / 100.0)) from app.orders o where o.status in ${PAYABLE} and o.created_at >= ${p.from}), 0))::int as venue,
      (select count(*) from app.redemptions where cancelled_at is null and created_at >= ${p.from})::int as uses,
      coalesce((select sum(${leftValueSql("packs")}) from app.packs where status = 'active' and units_left > 0 and valid_until > now()), 0)::int as balance,
      (select count(*) from app.payments where status = 'paid' and created_at >= ${p.from})::int as payments,
      (select count(*) from app.pack_events where type in ('complaint_refund','use_cancelled') and created_at >= ${p.from})::int as refunds,
      coalesce((select sum(${leftValueSql("packs")}) from app.packs where units_left > 0 and valid_until < now() and valid_until > now() - interval '60 days'), 0)::int as expired`);
    return c.json({ ok: true, money: { sales: now.sales, salesGrowth: growth(now.sales, prev.sales), fee: now.fee, feeGrowth: growth(now.fee, prev.fee), venue: m.venue, uses: m.uses, balance: m.balance, payments: m.payments, refunds: m.refunds, expired: m.expired, testMode: cfg.PAYMENTS_MODE === "test" } });
  });

  // Төлемдер (Figma «Төлемдер»): барлығы / сәтті / күтуде / сәтсіз
  r.get("/admin/payments", async (c) => {
    const tab = c.req.query("tab") ?? "all";
    const st = tab === "paid" ? sql`and p.status = 'paid'` : tab === "pending" ? sql`and p.status in ('created','pending')` : tab === "failed" ? sql`and p.status = 'failed'` : sql``;
    const list = await rows<Row>(sql`select p.id, p.amount, p.status, p.method, p.created_at, u.first_name, u.last_name, o.title from app.payments p join app.users u on u.id = p.user_id
      left join app.packs pk on pk.id = p.pack_id left join app.offers o on o.id = pk.offer_id where true ${st} order by p.created_at desc limit 200`);
    const [n] = await rows<{ failed: number }>(sql`select count(*)::int as failed from app.payments where status = 'failed'`);
    return c.json({ ok: true, counts: n, payments: list.map((x) => ({ id: x.id, amount: x.amount, status: x.status, method: x.method, at: x.created_at, customer: short(String(x.first_name), x.last_name as string | null), title: x.title ? head(String(x.title)) : "—" })) });
  });
  // Есеп айырысу (Figma «Мекемелермен есеп»): айлар бойынша — ақша әр қолданған сайын мекемеге өтеді
  const settlements = async (month: string) => {
    const from = new Date(`${month}-01T00:00:00+05:00`); const to = new Date(from); to.setMonth(to.getMonth() + 1);
    // Мекемеге төленетін қызмет: кассадағы қолдану (бас тартылмаған) + тапсырыс/жоспар (орындалған не клиент келмеген — бірлік жұмсалды)
    return rows<{ id: string; name: string; status: string; fee: number; uses: number; amount: number; gross: number }>(sql`
      with u as (
        select b.venue_id, r.units, r.amount, r.fee_pct from app.redemptions r join app.branches b on b.id = r.branch_id where r.cancelled_at is null and r.created_at >= ${from} and r.created_at < ${to}
        union all
        select b.venue_id, 1, o.amount, o.fee_pct from app.orders o join app.branches b on b.id = o.branch_id where o.status in ${PAYABLE} and o.created_at >= ${from} and o.created_at < ${to})
      select v.id, v.name, v.status, coalesce(v.fee_pct, v.auto_fee_pct, ${cfg.MEDEO_FEE_PCT})::int as fee,
        coalesce(sum(u.units), 0)::int as uses, coalesce(sum(u.amount), 0)::int as gross,
        coalesce(sum(round(u.amount * (100 - u.fee_pct) / 100.0)), 0)::int as amount
      from app.venues v left join u on u.venue_id = v.id
      where v.status in ('active','paused','closed') group by v.id order by amount desc, v.name`);
  };
  r.get("/admin/settlements", async (c) => {
    const month = /^\d{4}-\d{2}$/.test(c.req.query("month") ?? "") ? c.req.query("month")! : new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }).slice(0, 7);
    return c.json({ ok: true, month, venues: await settlements(month) });
  });
  // Қайтарулар (Figma «Қайтарулар»): бірлік пакетке оралады, сомасы мекемеден ұсталады; ақшалай қайтару өшірулі
  const refunds = (from: Date) => rows<Row>(sql`select e.id, e.type, e.units_delta::int as units, e.created_at, e.meta, u.first_name, u.last_name, o.title, v.name as venue, round(p.value_total::numeric / p.units_total)::int as unit_price
      from app.pack_events e join app.packs p on p.id = e.pack_id join app.users u on u.id = p.user_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id
      where e.type in ('complaint_refund','use_cancelled') and e.created_at >= ${from} order by e.created_at desc limit 200`);
  const refundDto = (x: Row) => { const m = (x.meta ?? {}) as Record<string, unknown>; return { id: x.id, units: x.units, at: x.created_at, customer: short(String(x.first_name), x.last_name as string | null), title: head(String(x.title)), venue: x.venue,
    amount: Number(x.unit_price) * Number(x.units), why: x.type === "complaint_refund" ? (m.platform ? "шағым · платформа есебінен" : "шағым") : m.via === "admin" ? "Басқару қайтарды" : "кассир қатесі", platform: Boolean(m.platform) }; };
  r.get("/admin/refunds", async (c) => c.json({ ok: true, refunds: (await refunds(new Date(Date.now() - 90 * 86400_000))).map(refundDto) }));
  // Экспорт (Figma «Экспорт»): CSV (Excel ашады), UTF-8 BOM
  r.get("/admin/export", async (c) => {
    const p = periodOf(c.req.query("period") ?? "30");
    const parts = new Set((c.req.query("parts") ?? "payments,settlements").split(","));
    const esc = (v: unknown) => { const t = v === null || v === undefined ? "" : String(v); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const lines: string[] = [];
    const add = (r2: unknown[]) => lines.push(r2.map(esc).join(";"));
    if (parts.has("payments")) {
      add(["Төлемдер"]); add(["Күні", "Клиент", "Ұсыныс", "Тәсіл", "Сома", "Күйі"]);
      for (const x of await rows<Row>(sql`select p.created_at, p.amount, p.status, p.method, u.first_name, u.last_name, o.title from app.payments p join app.users u on u.id = p.user_id left join app.packs pk on pk.id = p.pack_id left join app.offers o on o.id = pk.offer_id where p.created_at >= ${p.from} order by p.created_at`))
        add([new Date(x.created_at as string).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }), short(String(x.first_name), x.last_name as string | null), x.title ? head(String(x.title)) : "", x.method, x.amount, x.status]);
      add([]);
    }
    if (parts.has("settlements")) {
      const month = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }).slice(0, 7);
      add([`Мекемелермен есеп · ${month}`]); add(["Мекеме", "Қолдану", "Жалпы сома", "Комиссия, %", "Мекемеге"]);
      for (const x of await settlements(month)) add([x.name, x.uses, x.gross, x.fee, x.amount]);
      add([]);
    }
    if (parts.has("refunds")) {
      add(["Қайтарулар"]); add(["Күні", "Клиент", "Ұсыныс", "Мекеме", "Бірлік", "Сома", "Себебі"]);
      for (const x of (await refunds(p.from)).map(refundDto)) add([new Date(x.at as string).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }), x.customer, x.title, x.venue, x.units, x.amount, x.why]);
    }
    await log(c, "Экспорт жүктелді", `${[...parts].join(", ")} · ${c.req.query("period") ?? "30"}`);
    return c.body("\uFEFF" + lines.join("\r\n"), 200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="medeo-export.csv"` });
  });

  // ── 08 · Шағымдар ──────────────────────────────────────────────
  // new — мекеме әлі жауап бермеген; review — мекеме қайтармаған (Medeo қайта қарай алады); done — шешілген
  r.get("/admin/complaints", async (c) => {
    const tab = c.req.query("tab") ?? "new"; const venueId = c.req.query("venue") ?? "";
    const s = await getSettings(db);
    const adminDecided = sql`exists (select 1 from app.admins a where a.user_id = c.decided_by)`;
    const cond = tab === "new" ? sql`c.status = 'new'` : tab === "review" ? sql`c.status = 'rejected' and not ${adminDecided} and c.decided_at > now() - interval '14 days'` : sql`(c.status = 'refunded' or (c.status = 'rejected' and (${adminDecided} or c.decided_at <= now() - interval '14 days')))`;
    const list = await rows<Row>(sql`select c.id, c.status, c.reason, c.created_at, c.decided_at, u.first_name, u.last_name, o.title, v.name as venue,
        (select count(*) from app.complaints c2 where c2.created_at <= c.created_at)::int as no
      from app.complaints c join app.users u on u.id = c.user_id join app.packs p on p.id = c.pack_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = c.venue_id
      where ${cond} and (${venueId} = '' or c.venue_id::text = ${venueId}) order by c.created_at ${tab === "done" ? sql`desc` : sql`asc`} limit 100`);
    const [n] = await rows<{ fresh: number; review: number; avg_min: number | null }>(sql`select count(*) filter (where c.status = 'new')::int as fresh,
        count(*) filter (where c.status = 'rejected' and not ${adminDecided} and c.decided_at > now() - interval '14 days')::int as review,
        (avg(extract(epoch from (c.decided_at - c.created_at)) / 60) filter (where c.decided_at is not null))::int as avg_min from app.complaints c`);
    const [rep] = await rows<{ n: number }>(sql`select count(*)::int as n from (select c.venue_id from app.complaints c where c.created_at > now() - interval '30 days' group by c.venue_id
        having count(*) * 100.0 / greatest(1, (select count(*) from app.redemptions r join app.branches b on b.id = r.branch_id where b.venue_id = c.venue_id and r.created_at > now() - interval '30 days')) > 5) t`);
    return c.json({ ok: true, counts: { new: n.fresh, review: n.review, avgMin: n.avg_min, repeat: rep.n }, complaints: list.map((x) => {
      const due = new Date(new Date(x.created_at as string).getTime() + s.complaintHours * 3600_000);
      return { id: x.id, no: x.no, status: x.status, reason: x.reason, at: x.created_at, customer: short(String(x.first_name), x.last_name as string | null), offer: head(String(x.title)), venue: x.venue, hoursLeft: Math.round((due.getTime() - Date.now()) / 3600_000) };
    }) });
  });
  r.get("/admin/complaints/:id", async (c) => {
    const [x] = await rows<Row>(sql`select c.*, u.first_name, u.last_name, o.title, v.name as venue, r.created_at as used_at, r.units as used_units, cu.first_name as cashier, cu.last_name as cashier_last,
        (select count(*) from app.packs p2 where p2.user_id = c.user_id and p2.status <> 'pending_payment')::int as client_packs,
        (select count(*) from app.complaints c3 where c3.user_id = c.user_id)::int as client_complaints,
        (select count(*) from app.complaints c2 where c2.created_at <= c.created_at)::int as no,
        exists (select 1 from app.admins a where a.user_id = c.decided_by) as by_admin,
        round(p.value_total::numeric / p.units_total)::int as unit_price
      from app.complaints c join app.users u on u.id = c.user_id join app.packs p on p.id = c.pack_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = c.venue_id
      left join app.redemptions r on r.id = c.redemption_id left join app.users cu on cu.id = r.cashier_id where c.id = ${c.req.param("id")}`);
    if (!x) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, complaint: { id: x.id, no: x.no, status: x.status, reason: x.reason, text: x.text, reply: x.reply, byAdmin: x.by_admin, at: x.created_at, decidedAt: x.decided_at,
      customer: short(String(x.first_name), x.last_name as string | null), userId: x.user_id, clientPacks: x.client_packs, firstComplaint: Number(x.client_complaints) <= 1, packId: x.pack_id,
      offer: head(String(x.title)), venue: x.venue, venueId: x.venue_id, usedAt: x.used_at, units: x.used_units ?? 1, cashier: x.cashier ? short(String(x.cashier), x.cashier_last as string | null) : null,
      amount: Number(x.unit_price) * Number(x.used_units ?? 1) } });
  });
  // Шешім (Figma «Шешім»): client — бірлік оралады (мекеме есебінен), venue — жабылады, partial — бірлік оралады, шығынды платформа көтереді
  r.post("/admin/complaints/:id/decide", async (c) => {
    const b = z.object({ side: z.enum(["client", "venue", "partial"]), reply: z.string().trim().min(3).max(400) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const id = c.req.param("id"); const by = c.get("user").id;
    let returned = 0;
    if (b.data.side === "partial") {
      const ok = await db.transaction(async (tx) => {
        const x = (await tx.execute(sql`select id, status, pack_id from app.complaints where id = ${id} for update`)).rows[0] as { id: string; status: string; pack_id: string } | undefined;
        if (!x || !["new", "rejected"].includes(x.status)) return false;
        await tx.execute(sql`update app.packs set units_left = least(units_total, units_left + 1), status = case when status = 'used' then 'active' else status end where id = ${x.pack_id}`);
        await tx.execute(sql`insert into app.pack_events (pack_id, type, units_delta, meta) values (${x.pack_id}, 'complaint_refund', 1, ${JSON.stringify({ complaintId: id, by, via: "admin", platform: true })}::jsonb)`);
        await tx.execute(sql`update app.complaints set status = 'refunded', reply = ${b.data.reply}, decided_by = ${by}, decided_at = now() where id = ${id}`);
        return true;
      });
      if (!ok) return c.json({ ok: false, error: "already_decided" }, 409);
      returned = 1;
    } else {
      const out = await decideComplaint(db, id, b.data.side === "client" ? "refund" : "reject", b.data.reply, by, undefined, true);
      if (out.status !== 200) return c.json({ ok: false, error: out.error }, out.status);
      returned = out.returned;
    }
    await log(c, "Шағым шешілді", `№${id.slice(0, 6)} · ${{ client: "клиент пайдасына", venue: "мекеме пайдасына", partial: "жартылай" }[b.data.side]}`, { complaintId: id, side: b.data.side });
    await notify?.complaintDone(id, returned);
    return c.json({ ok: true, returned });
  });

  // ── 15 · Баптаулар, журнал ─────────────────────────────────────
  r.get("/admin/settings", async (c) => c.json({ ok: true, settings: await getSettings(db, true), defaults: SETTING_DEFAULTS, feePct: cfg.MEDEO_FEE_PCT, paymentsMode: cfg.PAYMENTS_MODE }));
  const SetBody = z.object({ key: z.enum(["maintenance", "maintenanceText", "moderation", "graceDays", "complaintHours", "maxDiscount", "refusedPauseAt"]), value: z.union([z.boolean(), z.number().int().min(1).max(90), z.string().trim().min(5).max(200)]), pin: z.string().optional() });
  r.post("/admin/settings", async (c) => {
    const b = SetBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const expect = typeof SETTING_DEFAULTS[b.data.key];
    if (typeof b.data.value !== expect) return c.json({ ok: false, error: "bad_value" }, 400);
    if (b.data.key === "graceDays" && Number(b.data.value) > 14) return c.json({ ok: false, error: "bad_value" }, 400);
    if (b.data.key === "complaintHours" && ![12, 24, 48, 72].includes(Number(b.data.value))) return c.json({ ok: false, error: "bad_value" }, 400);
    if (b.data.key === "maxDiscount" && ![20, 30, 40, 50].includes(Number(b.data.value))) return c.json({ ok: false, error: "bad_value" }, 400);
    if (b.data.key === "refusedPauseAt" && ![3, 5, 7, 10].includes(Number(b.data.value))) return c.json({ ok: false, error: "bad_value" }, 400);
    // Техникалық жұмыстар мен ережелер — қауіпті: PIN
    const bad = await danger(c, b.data.pin); if (bad) return bad;
    const before = (await getSettings(db, true))[b.data.key];
    await setSetting(db, b.data.key, b.data.value as Settings[typeof b.data.key]);
    const names: Record<string, string> = { maintenance: "Техникалық жұмыстар", maintenanceText: "Техникалық жұмыстар мәтіні", moderation: "Модерация", graceDays: "Күту кезеңі", complaintHours: "Шағымға жауап мерзімі", maxDiscount: "Жеңілдік шегі", refusedPauseAt: "«Қабылдамады» шегі" };
    const fmt = (v: unknown) => (typeof v === "boolean" ? (v ? "қосулы" : "өшірулі") : String(v));
    await log(c, b.data.key === "maintenance" ? (b.data.value ? "Техникалық жұмыстар қосылды" : "Техникалық жұмыстар өшірілді") : `${names[b.data.key]} өзгерді`, `Бизнес-ережелер · ${fmt(before)} → ${fmt(b.data.value)}`);
    return c.json({ ok: true });
  });
  // Figma «18 · Хабарлама баптаулары»
  r.get("/admin/prefs", async (c) => {
    const [a] = await db.select({ p: admins.prefs }).from(admins).where(eq(admins.userId, c.get("user").id)).limit(1);
    return c.json({ ok: true, prefs: { ...adminPrefDefaults, ...((a?.p as object) ?? {}) } });
  });
  r.put("/admin/prefs", async (c) => {
    const b = z.object(Object.fromEntries(Object.keys(adminPrefDefaults).map((k) => [k, z.boolean()])) as Record<keyof typeof adminPrefDefaults, z.ZodBoolean>).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    await db.update(admins).set({ prefs: b.data }).where(eq(admins.userId, c.get("user").id));
    return c.json({ ok: true });
  });
  r.get("/admin/log", async (c) => c.json({ ok: true, log: await rows(sql`select l.id, l.action, l.target, l.created_at as at, u.first_name as author from app.admin_log l join app.users u on u.id = l.admin_id order by l.created_at desc limit 200`) }));

  return r;
}

/** Ашық маршрут: өтінім құжатын қолтаңбалы сілтемемен беру (5 минут) */
export function adminFileRoutes(cfg: Config, db: Db) {
  const r = new Hono();
  r.get("/admin-doc/:id", async (c) => {
    const id = c.req.param("id"); const e = Number(c.req.query("e")); const s = c.req.query("s") ?? "";
    const ok = e > Date.now() / 1000 && s === createHmac("sha256", cfg.BOT_TOKEN).update(`doc:${id}:${e}`).digest("hex").slice(0, 32);
    if (!ok || !/^[0-9a-f-]{36}$/.test(id)) return c.json({ ok: false, error: "not_found" }, 404);
    const [d] = (await db.execute(sql`select file_name, mime, bytes from app.venue_docs where id = ${id}`)).rows as { file_name: string; mime: string; bytes: Buffer }[];
    if (!d) return c.json({ ok: false, error: "not_found" }, 404);
    return c.body(new Uint8Array(d.bytes), 200, { "Content-Type": d.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(d.file_name)}"`, "Cache-Control": "private, no-store" });
  });
  return r;
}

/** Веб-кіру (Telegram Login Widget + PIN): Басқару тек веб арқылы ашылады. Жауаптағы token — «<userId>.<exp>.<sig>». */
export function adminWebRoutes(cfg: Config, db: Db) {
  const r = new Hono();
  const ids = adminIds(cfg);
  const Body = z.object({ auth: z.record(z.string(), z.union([z.string(), z.number()])), pin: z.string().regex(/^\d{4}$/).optional(), setup: z.boolean().optional() });
  r.post("/login", async (c) => {
    const b = Body.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const tokens = [cfg.MINIAPP_BOT_TOKEN, cfg.BOT_TOKEN].filter((t): t is string => Boolean(t));
    let v = validateLoginWidget(b.data.auth, tokens[0], 24 * 3600);
    for (const t of tokens.slice(1)) { if (v.ok || v.reason !== "bad_hash") break; v = validateLoginWidget(b.data.auth, t, 24 * 3600); }
    if (!v.ok) return c.json({ ok: false, error: "unauthorized", reason: v.reason }, 401);
    const u = v.user;
    if (!ids.has(String(u.id))) return c.json({ ok: false, error: "forbidden", telegramId: u.id }, 403);
    const [row] = await db.insert(users).values({ telegramId: u.id, firstName: u.first_name, lastName: u.last_name, username: u.username, photoUrl: u.photo_url })
      .onConflictDoUpdate({ target: users.telegramId, set: { firstName: u.first_name, lastName: u.last_name ?? null, username: u.username ?? null, lastSeenAt: sql`now()` } }).returning();
    await db.insert(admins).values({ userId: row.id }).onConflictDoNothing();
    const [a] = await db.select().from(admins).where(eq(admins.userId, row.id)).limit(1);
    if (!b.data.pin) return c.json({ ok: true, hasPin: Boolean(a.pinHash), name: row.firstName, lockedUntil: a.lockedUntil && a.lockedUntil.getTime() > Date.now() ? a.lockedUntil : null });
    if (!a.pinHash) {
      if (!b.data.setup) return c.json({ ok: false, error: "no_pin" }, 409);
      if (weakPin(b.data.pin)) return c.json({ ok: false, error: "weak_pin" }, 400);
      await db.update(admins).set({ pinHash: hashPin(b.data.pin) }).where(eq(admins.userId, row.id));
      await db.insert(adminLog).values({ adminId: row.id, action: "PIN орнатылды", target: `${row.firstName} · веб` });
    } else {
      const p = await checkPinDb(db, row.id, b.data.pin);
      if (!p.ok) return c.json({ ok: false, error: p.error, left: p.left ?? null, until: p.until ?? null }, p.error === "locked" ? 423 : 403);
    }
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
    await db.insert(adminLog).values({ adminId: row.id, action: "Вебке кірді", target: row.firstName });
    return c.json({ ok: true, token: `${row.id}.${exp}.${adminSig(cfg, row.id, exp)}`, name: row.firstName });
  });
  return r;
}
