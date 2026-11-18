// Figma «16»: клиенттің шағымы → мекеме қайтарады не қайтармайды (24 сағат); мерзімі өткен пакеттер (3 күн күту, сосын клиентке бонус).
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { Notifier } from "../notify.js";
import { getSettings } from "../settings.js";
import { leftValueSql } from "../value.js";
import { complaints, offers, packEvents, packs, redemptions, venueStaff } from "../db/schema.js";

const short = (f: string, l: string | null) => (l ? `${f} ${l.slice(0, 1)}.` : f);

export function complaintRoutes(cfg: Config, db: Db, notify?: Notifier) {
  const r = new Hono<Env>();
  const staffOk = async (userId: string, venueId: string, roles = ["owner", "manager"]) => {
    const [x] = await db.select({ role: venueStaff.role, status: venueStaff.status }).from(venueStaff).where(and(eq(venueStaff.userId, userId), eq(venueStaff.venueId, venueId))).limit(1);
    return Boolean(x && x.status === "active" && roles.includes(x.role));
  };

  // Клиент: пакет бойынша шағым (соңғы 7 күндегі қолданумен байланысады)
  const New = z.object({ packId: z.string().uuid(), reason: z.string().max(40).optional(), text: z.string().trim().min(5).max(500) }).strict();
  r.post("/complaints", async (c) => {
    const b = New.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const user = c.get("user");
    const [p] = await db.select({ p: packs, o: offers }).from(packs).innerJoin(offers, eq(packs.offerId, offers.id)).where(and(eq(packs.id, b.data.packId), eq(packs.userId, user.id))).limit(1);
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const open = await db.select({ id: complaints.id }).from(complaints).where(and(eq(complaints.packId, p.p.id), eq(complaints.status, "new"))).limit(1);
    if (open.length) return c.json({ ok: false, error: "already_open" }, 409);
    const [rd] = await db.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.packId, p.p.id), sql`${redemptions.cancelledAt} is null`, sql`${redemptions.createdAt} > now() - interval '7 days'`)).orderBy(desc(redemptions.createdAt)).limit(1);
    const refused = b.data.reason === "refused";
    const [x] = await db.insert(complaints).values({ userId: user.id, venueId: p.o.venueId, packId: p.p.id, redemptionId: refused ? null : rd?.id ?? null, reason: b.data.reason ?? null, text: b.data.text }).returning();
    const s = await getSettings(db);
    // «Мекеме қабылдамады» (жабық болды / орын бермеді): клиент кінәлі емес — пакет мерзімі бірден 7 күнге ұзарады (бір пакетке ең көбі 2 рет).
    // 30 күнде осындай шағым s.refusedPauseAt түрлі клиенттен түссе — мекеменің жаңа сатуы автоматты тоқтатылады (Басқару қайта қоса алады).
    let extended = 0; let paused = false;
    if (refused) {
      const [{ n }] = (await db.execute(sql`select count(*)::int as n from app.pack_events where pack_id = ${p.p.id} and type = 'refused_extend'`)).rows as { n: number }[];
      if (n < 2 && p.p.unitsLeft > 0 && ["active", "expired"].includes(p.p.status)) {
        await db.execute(sql`update app.packs set valid_until = greatest(valid_until, now()) + interval '7 days', status = 'active' where id = ${p.p.id} and units_left > 0`);
        await db.insert(packEvents).values({ packId: p.p.id, type: "refused_extend", unitsDelta: 0, meta: { complaintId: x.id, days: 7 } });
        extended = 7;
      }
      const [{ users: who }] = (await db.execute(sql`select count(distinct c.user_id)::int as users from app.complaints c where c.venue_id = ${p.o.venueId} and c.reason = 'refused'
        and c.created_at > now() - interval '30 days' and not (c.status = 'rejected' and exists (select 1 from app.admins a where a.user_id = c.decided_by))`)).rows as { users: number }[];
      if (who >= s.refusedPauseAt) {
        const res = await db.execute(sql`update app.venues set status = 'paused' where id = ${p.o.venueId} and status = 'active'`);
        if (res.rowCount) {
          paused = true;
          await notify?.adminAutoPause(p.o.venueId, who);
          await notify?.venueStatus(p.o.venueId, true, `30 күнде ${who} клиент «мекеме қабылдамады» деп шағымданды. Medeo тексергенше жаңа сату тоқтатылды`);
        }
      }
    }
    await notify?.complaint(x.id);
    await notify?.adminComplaint(x.id, s.complaintHours);
    return c.json({ ok: true, complaint: { id: x.id, status: x.status }, extended, venuePaused: paused });
  });

  // Мекеме: шағымдар тізімі
  r.get("/venue/:venueId/complaints", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await staffOk(c.get("user").id, venueId))) return c.json({ ok: false, error: "forbidden" }, 403);
    const rows = (await db.execute(sql`select c.id, c.status, c.text, c.reason, c.reply, c.created_at, c.decided_at, u.first_name, u.last_name, o.title,
        r.created_at as used_at, r.units as used_units, coalesce(r.amount / greatest(r.units, 1), round(p.value_total::numeric / p.units_total))::int as unit_price
      from app.complaints c join app.users u on u.id = c.user_id join app.packs p on p.id = c.pack_id join app.offers o on o.id = p.offer_id
      left join app.redemptions r on r.id = c.redemption_id where c.venue_id = ${venueId} order by (c.status = 'new') desc, c.created_at desc limit 100`)).rows as {
        id: string; status: string; text: string; reason: string | null; reply: string | null; created_at: Date; decided_at: Date | null; first_name: string; last_name: string | null; title: string; used_at: Date | null; used_units: number | null; unit_price: number }[];
    return c.json({ ok: true, complaints: rows.map((x) => ({ id: x.id, status: x.status, text: x.text, reason: x.reason, reply: x.reply, at: x.created_at, decidedAt: x.decided_at,
      customer: short(x.first_name, x.last_name), offer: x.title.split(" · ")[0], usedAt: x.used_at, units: x.used_units ?? 1, amount: x.unit_price * (x.used_units ?? 1),
      dueAt: new Date(new Date(x.created_at).getTime() + 24 * 3600_000) })) });
  });

  // Мекеме: қайтару (бірлік пакетке оралады) не қайтармау (жауабымен)
  const Resolve = z.object({ action: z.enum(["refund", "reject"]), reply: z.string().trim().max(300).default("") }).strict();
  r.post("/venue/:venueId/complaints/:id/resolve", async (c) => {
    const venueId = c.req.param("venueId"); const staff = c.get("user");
    if (!(await staffOk(staff.id, venueId))) return c.json({ ok: false, error: "forbidden" }, 403);
    const b = Resolve.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    if (b.data.action === "reject" && b.data.reply.length < 3) return c.json({ ok: false, error: "reply_required" }, 400);
    const out = await decideComplaint(db, c.req.param("id"), b.data.action, b.data.reply, staff.id, venueId);
    if (out.status !== 200) return c.json({ ok: false, error: out.error }, out.status);
    await notify?.complaintDone(c.req.param("id"), out.returned);
    return c.json({ ok: true, returned: out.returned });
  });

  // Мерзімі өткен пакеттер: 3 күн күту (клиент қайта алса — қалғаны көшеді), сосын қалған сома КЛИЕНТКЕ бонус болып қайтады.
  // Мекемеге күйген ақшадан үлес жоқ (Патша, 2026-11-17): мекеме тек көрсеткен қызметі үшін алады — клиентке кедергі жасаудан пайда жоқ.
  r.get("/venue/:venueId/expired", async (c) => {
    const venueId = c.req.param("venueId");
    if (!(await staffOk(c.get("user").id, venueId))) return c.json({ ok: false, error: "forbidden" }, 403);
    const grace = (await getSettings(db)).graceDays;
    const rows = (await db.execute(sql`select p.id, coalesce(b.units, p.units_left)::int as left, p.valid_until, round(p.value_total::numeric / p.units_total)::int as unit_price, b.amount::int as bonus_amount, ${leftValueSql()} as left_value, o.title, u.first_name, u.last_name,
        exists (select 1 from app.pack_events e where e.pack_id = p.id and e.type = 'carry_out') as carried, b.id is not null as bonus
      from app.packs p join app.offers o on o.id = p.offer_id join app.users u on u.id = p.user_id left join app.bonuses b on b.pack_id = p.id
      where o.venue_id = ${venueId} and p.valid_until < now() and p.valid_until > now() - interval '60 days' and p.status in ('active','expired','used')
        and (p.units_left > 0 or b.id is not null or exists (select 1 from app.pack_events e where e.pack_id = p.id and e.type = 'carry_out'))
      order by p.valid_until desc limit 100`)).rows as { id: string; left: number; valid_until: Date; unit_price: number; title: string; first_name: string; last_name: string | null; carried: boolean; bonus: boolean; bonus_amount: number | null; left_value: number }[];
    const now = Date.now();
    const items = rows.map((x) => {
      const graceEnd = new Date(x.valid_until).getTime() + grace * 86400_000;
      const state = x.carried ? "carried" : x.bonus || graceEnd <= now ? "bonus" : "waiting";
      return { id: x.id, title: x.title.split(" · ")[0], customer: short(x.first_name, x.last_name), units: x.left, expiredAt: x.valid_until, state,
        daysLeft: Math.max(0, Math.ceil((graceEnd - now) / 86400_000)), amount: x.bonus_amount ?? x.left_value };
    });
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const waiting = items.filter((x) => x.state === "waiting");
    const bonus = items.filter((x) => x.state === "bonus" && new Date(x.expiredAt).getTime() + grace * 86400_000 >= month.getTime());
    return c.json({ ok: true, summary: { waitingPacks: waiting.length, waitingUnits: waiting.reduce((a, x) => a + x.units, 0), bonusMonth: bonus.reduce((a, x) => a + x.amount, 0), bonusUnits: bonus.reduce((a, x) => a + x.units, 0) }, items });
  });
  return r;
}

/** Шағым шешімі: refund — байланысты қолдану жойылып, бірлік пакетке оралады; reject — шағым жабылады.
 *  Мекеме (venueId беріледі) не Medeo Басқару (override: мекеме қайтармаған шағымды клиент пайдасына қайта шешу). */
export async function decideComplaint(db: Db, id: string, action: "refund" | "reject", reply: string, by: string, venueId?: string, override = false) {
  return db.transaction(async (tx) => {
    const x = (await tx.execute(sql`select * from app.complaints where id = ${id} ${venueId ? sql`and venue_id = ${venueId}` : sql``} for update`)).rows[0] as { id: string; status: string; pack_id: string; redemption_id: string | null } | undefined;
    if (!x) return { status: 404 as const, error: "not_found" };
    if (x.status !== "new" && !(override && x.status === "rejected")) return { status: 409 as const, error: "already_" + x.status };
    let returned = 0;
    if (action === "refund") {
      const rd = x.redemption_id ? (await tx.execute(sql`select id, units, cancelled_at from app.redemptions where id = ${x.redemption_id} for update`)).rows[0] as { id: string; units: number; cancelled_at: Date | null } | undefined : undefined;
      returned = rd && !rd.cancelled_at ? rd.units : 1;
      if (rd && !rd.cancelled_at) {
        await tx.update(redemptions).set({ cancelledAt: new Date(), cancelledBy: by }).where(eq(redemptions.id, rd.id));
        await tx.execute(sql`update app.receipts set internal = jsonb_set(jsonb_set(internal, '{status,current}', '"cancelled"'), '{status,history}', (internal->'status'->'history') || jsonb_build_object('status','cancelled','at', now(), 'by', ${by}::text, 'via', 'complaint')) where internal->>'redemptionId' = ${rd.id}`);
      }
      await tx.execute(sql`update app.packs set units_left = least(units_total, units_left + ${returned}), status = case when status = 'used' then 'active' else status end where id = ${x.pack_id}`);
      await tx.insert(packEvents).values({ packId: x.pack_id, type: "complaint_refund", unitsDelta: returned, meta: { complaintId: x.id, by: by } });
    }
    await tx.update(complaints).set({ status: action === "refund" ? "refunded" : "rejected", reply: reply || null, decidedBy: by, decidedAt: new Date() }).where(eq(complaints.id, x.id));
    return { status: 200 as const, returned };
  });
}
