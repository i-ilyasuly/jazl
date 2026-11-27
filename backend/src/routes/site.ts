// Сайттың ашық API-і (кірусіз). Өтінім формасы: мекеме иесі байланысын қалдырады → app.site_leads + Басқаруға хабарлама.
// Спамнан қорғау: IP бойынша шек (app.ts), «website» тұзақ-өрісі (адам толтырмайды), келісім міндетті.
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import type { Notifier } from "../notify.js";
import { clientIp } from "../rateLimit.js";

const Lead = z.object({
  venue: z.string().trim().min(2).max(80),
  kind: z.enum(["coffee", "food", "hair"]),
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().regex(/^\+?[\d\s()-]{10,20}$/),
  pos: z.string().trim().max(60).optional().default(""),
  consent: z.literal(true),
  lang: z.enum(["kk", "ru"]).optional().default("kk"),
  website: z.string().max(0).optional(),
});

export function siteRoutes(db: Db, notify?: Notifier) {
  const r = new Hono();
  r.post("/lead", async (c) => {
    const b = Lead.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request", fields: [...new Set(b.error.issues.map((i) => String(i.path[0])))] }, 400);
    const d = b.data;
    const digits = d.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 12) return c.json({ ok: false, error: "bad_request", fields: ["phone"] }, 400);
    const [row] = (await db.execute(sql`insert into app.site_leads (venue, kind, name, phone, pos, lang, ip)
      values (${d.venue}, ${d.kind}, ${d.name}, ${d.phone}, ${d.pos || null}, ${d.lang}, ${clientIp(c)}) returning no`)).rows as { no: number }[];
    await notify?.adminSiteLead({ no: row.no, venue: d.venue, kind: d.kind, name: d.name, phone: d.phone, pos: d.pos || null, lang: d.lang });
    return c.json({ ok: true, no: row.no });
  });
  return r;
}
