// C1 · Мекеме бөлімі (кассир, менеджер, иесі): кім екенін білу, бүгінгі қорытынды, қызметкерді шақыру/шығару.
// Кассаның өз әрекеттері (QR, тапсырыс, код, бас тарту) — usage.ts ішіндегі /venue/* маршруттарында.
// Рөлдер: owner — бәрі; manager — кассир шақырады/шығарады; cashier — тек касса.
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { branches, staffInvites, users, venueStaff, venues } from "../db/schema.js";

type Role = "owner" | "manager" | "cashier";
const INVITE_MS = 48 * 3600_000;
const rank: Record<Role, number> = { cashier: 0, manager: 1, owner: 2 };

export function venueRoutes(cfg: Config, db: Db) {
  const r = new Hono<Env>();
  const roleIn = async (userId: string, venueId: string) =>
    (await db.select({ role: venueStaff.role, branchId: venueStaff.branchId }).from(venueStaff).where(and(eq(venueStaff.userId, userId), eq(venueStaff.venueId, venueId))).limit(1))[0];

  // Мен қай мекеменің қызметкерімін? Бос тізім — қарапайым клиент (403 емес: мини апп әр ашылғанда тексереді)
  r.get("/venue/me", async (c) => {
    const rows = await db.select({ s: venueStaff, v: venues }).from(venueStaff).innerJoin(venues, eq(venueStaff.venueId, venues.id)).where(eq(venueStaff.userId, c.get("user").id));
    const out = await Promise.all(rows.map(async (x) => {
      const brs = await db.select({ id: branches.id, address: branches.address }).from(branches).where(and(eq(branches.venueId, x.v.id), eq(branches.active, true))).orderBy(asc(branches.createdAt));
      return { venue: { id: x.v.id, slug: x.v.slug, name: x.v.name, kind: x.v.kind, logoUrl: x.v.logoUrl }, role: x.s.role, branchId: x.s.branchId,
        branches: x.s.branchId ? brs.filter((b) => b.id === x.s.branchId) : brs };
    }));
    return c.json({ ok: true, staff: out });
  });

  // Бүгінгі қорытынды (Алматы уақыты): QR-мен қолданулар, берілген тапсырыстар, күтіп тұрғандар, бүгінгі жоспарлар
  r.get("/venue/:venueId/today", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await roleIn(c.get("user").id, venueId))) return c.json({ ok: false, error: "not_staff" }, 403);
    const day = sql`(date_trunc('day', now() at time zone 'Asia/Almaty') at time zone 'Asia/Almaty')`;
    const res = await db.execute(sql`
      select
        (select count(*) from app.redemptions r join app.branches b on b.id = r.branch_id where b.venue_id = ${venueId} and r.cancelled_at is null and r.created_at >= ${day})::int as scans,
        (select coalesce(sum(r.units), 0) from app.redemptions r join app.branches b on b.id = r.branch_id where b.venue_id = ${venueId} and r.cancelled_at is null and r.created_at >= ${day})::int as units,
        (select count(*) from app.orders o join app.branches b on b.id = o.branch_id where b.venue_id = ${venueId} and o.status = 'done' and o.done_at >= ${day})::int as done,
        (select count(*) from app.orders o join app.branches b on b.id = o.branch_id where b.venue_id = ${venueId} and o.status in ('sent','accepted','ready'))::int as open,
        (select count(*) from app.orders o join app.branches b on b.id = o.branch_id where b.venue_id = ${venueId} and o.type = 'plan' and o.status in ('sent','accepted','ready')
           and o.scheduled_at >= ${day} and o.scheduled_at < ${day} + interval '1 day')::int as plans`);
    return c.json({ ok: true, today: res.rows[0] });
  });

  // Шақыру сілтемесі: иесі — менеджер не кассир; менеджер — тек кассир
  const Invite = z.object({ role: z.enum(["manager", "cashier"]), branchId: z.string().uuid().optional() }).strict();
  r.post("/venue/:venueId/invites", async (c) => {
    const venueId = c.req.param("venueId");
    const b = Invite.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const me = await roleIn(c.get("user").id, venueId);
    if (!me || me.role === "cashier" || rank[b.data.role] >= rank[me.role]) return c.json({ ok: false, error: "forbidden" }, 403);
    if (b.data.branchId) {
      const [br] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, b.data.branchId), eq(branches.venueId, venueId))).limit(1);
      if (!br) return c.json({ ok: false, error: "not_found" }, 404);
    }
    const code = randomBytes(9).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_MS);
    await db.insert(staffInvites).values({ code, venueId, role: b.data.role, branchId: b.data.branchId ?? null, createdBy: c.get("user").id, expiresAt });
    return c.json({ ok: true, code, link: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=staff_${code}`, expiresAt });
  });

  // Шақыруды ашқанда: кім шақырды, қай мекеме, қандай рөл (қабылдамай тұрып көрсету үшін)
  r.get("/venue/invites/:code", async (c) => {
    const [x] = await db.select({ i: staffInvites, v: venues }).from(staffInvites).innerJoin(venues, eq(staffInvites.venueId, venues.id)).where(eq(staffInvites.code, c.req.param("code"))).limit(1);
    if (!x) return c.json({ ok: false, error: "invite_not_found" }, 404);
    const state = x.i.usedAt ? "used" : x.i.expiresAt.getTime() < Date.now() ? "expired" : "open";
    return c.json({ ok: true, invite: { venue: x.v.name, role: x.i.role, state, expiresAt: x.i.expiresAt } });
  });

  r.post("/venue/invites/:code/accept", async (c) => {
    const user = c.get("user");
    const out = await db.transaction(async (tx) => {
      const res = await tx.execute(sql`select * from app.staff_invites where code = ${c.req.param("code")} for update`);
      const i = res.rows[0] as { code: string; venue_id: string; role: Role; branch_id: string | null; used_at: Date | null; expires_at: Date } | undefined;
      if (!i) return { status: 404 as const, error: "invite_not_found" };
      if (i.used_at) return { status: 409 as const, error: "invite_used" };
      if (new Date(i.expires_at).getTime() < Date.now()) return { status: 409 as const, error: "invite_expired" };
      const [cur] = await tx.select().from(venueStaff).where(and(eq(venueStaff.venueId, i.venue_id), eq(venueStaff.userId, user.id))).limit(1);
      // Бұрыннан жоғары рөлі болса — төмендетпейміз (иесі өз кассир сілтемесін ашып қойса да иесі болып қалады)
      if (!cur) await tx.insert(venueStaff).values({ venueId: i.venue_id, userId: user.id, role: i.role, branchId: i.branch_id });
      else if (rank[i.role] > rank[cur.role]) await tx.update(venueStaff).set({ role: i.role, branchId: i.branch_id }).where(and(eq(venueStaff.venueId, i.venue_id), eq(venueStaff.userId, user.id)));
      await tx.update(staffInvites).set({ usedBy: user.id, usedAt: new Date() }).where(eq(staffInvites.code, i.code));
      const [v] = await tx.select({ name: venues.name }).from(venues).where(eq(venues.id, i.venue_id));
      return { status: 200 as const, venue: v.name, role: cur && rank[cur.role] >= rank[i.role] ? cur.role : i.role };
    });
    if (out.status !== 200) return c.json({ ok: false, error: out.error }, out.status);
    return c.json({ ok: true, venue: out.venue, role: out.role });
  });

  // Қызметкерлер тізімі және ашық шақырулар (иесі мен менеджерге)
  r.get("/venue/:venueId/staff", async (c) => {
    const venueId = c.req.param("venueId");
    const me = await roleIn(c.get("user").id, venueId);
    if (!me || me.role === "cashier") return c.json({ ok: false, error: "forbidden" }, 403);
    const rows = await db.select({ s: venueStaff, u: users, b: branches }).from(venueStaff).innerJoin(users, eq(venueStaff.userId, users.id)).leftJoin(branches, eq(venueStaff.branchId, branches.id))
      .where(eq(venueStaff.venueId, venueId)).orderBy(asc(venueStaff.createdAt));
    const inv = await db.select().from(staffInvites).where(and(eq(staffInvites.venueId, venueId), isNull(staffInvites.usedAt), gt(staffInvites.expiresAt, new Date()))).orderBy(asc(staffInvites.createdAt));
    return c.json({ ok: true, me: c.get("user").id,
      staff: rows.map((x) => ({ userId: x.u.id, name: [x.u.firstName, x.u.lastName].filter(Boolean).join(" "), username: x.u.username, photoUrl: x.u.photoUrl, role: x.s.role, branch: x.b?.address ?? null, since: x.s.createdAt })),
      invites: inv.map((i) => ({ code: i.code, role: i.role, expiresAt: i.expiresAt, link: `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=staff_${i.code}` })) });
  });

  // Қызметкерді шығару: өзінен төмен рөлдегіні ғана; иесін ешкім шығармайды; өзін-өзі шығармайды
  r.post("/venue/:venueId/staff/:userId/remove", async (c) => {
    const venueId = c.req.param("venueId"); const target = c.req.param("userId");
    const me = await roleIn(c.get("user").id, venueId);
    const t = await roleIn(target, venueId);
    if (!me || !t) return c.json({ ok: false, error: "not_found" }, 404);
    if (target === c.get("user").id || rank[t.role] >= rank[me.role]) return c.json({ ok: false, error: "forbidden" }, 403);
    await db.delete(venueStaff).where(and(eq(venueStaff.venueId, venueId), eq(venueStaff.userId, target)));
    return c.json({ ok: true });
  });

  // Шақыруды жою (әлі қолданылмаған)
  r.post("/venue/:venueId/invites/:code/revoke", async (c) => {
    const venueId = c.req.param("venueId");
    const me = await roleIn(c.get("user").id, venueId);
    if (!me || me.role === "cashier") return c.json({ ok: false, error: "forbidden" }, 403);
    await db.delete(staffInvites).where(and(eq(staffInvites.code, c.req.param("code")), eq(staffInvites.venueId, venueId), isNull(staffInvites.usedAt)));
    return c.json({ ok: true });
  });

  // Сынақ режимі ғана: өзіңді мекеменің иесі қылу (кассир экрандарын телефоннан сынау үшін). Нақты режимде 404.
  r.post("/venue/dev-join", async (c) => {
    if (cfg.PAYMENTS_MODE !== "test") return c.json({ ok: false, error: "disabled" }, 404);
    const b = z.object({ venueSlug: z.string().min(1).max(64), leave: z.boolean().optional() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const [v] = await db.select().from(venues).where(eq(venues.slug, b.data.venueSlug)).limit(1);
    if (!v) return c.json({ ok: false, error: "not_found" }, 404);
    const userId = c.get("user").id;
    if (b.data.leave) await db.delete(venueStaff).where(and(eq(venueStaff.venueId, v.id), eq(venueStaff.userId, userId)));
    else await db.insert(venueStaff).values({ venueId: v.id, userId, role: "owner" }).onConflictDoUpdate({ target: [venueStaff.venueId, venueStaff.userId], set: { role: "owner", branchId: null } });
    return c.json({ ok: true, venue: v.name });
  });

  return r;
}
