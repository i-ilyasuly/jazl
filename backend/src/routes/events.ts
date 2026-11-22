// Мини апп оқиғалары (Патша, 2026-11-21): пилот воронкасы (ашты → ұсынысты көрді → сатып алуды бастады) және
// қолданба қателері. Сатып алу мен қолдану — дерекқордың өзінде (packs, redemptions), мұнда тек серверге жетпейтіндері.
// Жеке дерек қабылданбайды: мәтіндер қысқартылады, сілтемелерден параметрлер (Telegram initData) алынып тасталады.
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { clientEvents } from "../db/schema.js";
import type { Env } from "../app.js";

const Ev = z.object({
  k: z.enum(["open", "view", "buy_start", "error", "search", "share", "gift_start", "scan"]),
  ref: z.string().max(80).optional(),
  m: z.record(z.string().max(40), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
const Body = z.object({ events: z.array(Ev).min(1).max(20) });

/** Мәтіндегі сілтемелерден сұрау бөлігін (?…, #…) алып тастау — initData, токендер кетпесін */
const clean = (v: unknown, max: number) => typeof v === "string" ? v.replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g, "$1").replace(/tgWebAppData=[^\s&]*/g, "").slice(0, max) : v;
const KEEP: Record<string, number> = { msg: 300, stack: 1200, route: 80, ver: 40, platform: 20, src: 120, line: 10, sp: 20, n: 10, filters: 10, via: 20 };

export function eventRoutes(db: Db) {
  const r = new Hono<Env>();
  r.post("/events", async (c) => {
    const b = Body.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request" }, 400);
    const userId = c.get("user").id;
    const values = b.data.events.map((e) => {
      const meta: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e.m ?? {})) if (k in KEEP) meta[k] = clean(v, KEEP[k]);
      return { userId, kind: e.k, ref: e.ref ?? null, meta: Object.keys(meta).length ? meta : null };
    });
    await db.insert(clientEvents).values(values);
    // Бірінші платформа (метрикалар): ios / android / tdesktop / web…
    const pl = b.data.events.find((e) => e.k === "open" && typeof e.m?.platform === "string")?.m?.platform;
    if (pl) await db.execute(sql`update app.users set first_platform = ${String(pl).slice(0, 20)} where id = ${userId} and first_platform is null`);
    // Тек қате жазбалары 180 күннен кейін тазаланады. Қалған оқиғалар (ашу, көру, іздеу) — метрикалардың тарихы, өшірілмейді (Патша, 2026-11-22).
    if (Math.random() < 0.01) await db.execute(sql`delete from app.client_events where kind = 'error' and created_at < now() - interval '180 days'`);
    return c.json({ ok: true });
  });
  return r;
}
