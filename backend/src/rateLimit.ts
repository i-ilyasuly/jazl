// Сұраныс шегі (Қауіпсіздік аудиті, Алтай, 2026-11-21). Бұрын шек мүлдем болмаған: 4 таңбалы касса кодын (10 000 нұсқа, 45 с)
// бағдарламамен теріп табуға болатын. Әр Cloud Run данасы өз жадында санайды — жеке данаға шек дәл, жалпы шек шамамен
// (даналар саны × шек). Мақсат — тергішті (brute force) тоқтату; бұл үшін жеткілікті.
import type { Context, MiddlewareHandler } from "hono";

type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;
function hit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retry: number } {
  if (now - lastSweep > 60_000) { lastSweep = now; for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k); }
  let b = buckets.get(key);
  if (!b || b.reset <= now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return { ok: b.n <= max, retry: Math.ceil((b.reset - now) / 1000) };
}
/** Тесттерге: есептегішті тазалау */
export const resetRateLimits = () => buckets.clear();

/** Клиенттің IP-і (Cloud Run алдыңғы прокси X-Forwarded-For-дың бірінші мәнін қояды) */
export const clientIp = (c: Context) => (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim() || c.req.header("x-real-ip") || "unknown";

export type LimitRule = { name: string; max: number; windowSec: number; by: "user" | "ip" };
/** enabled=false (автосынақтар) — шек өшірулі */
export function rateLimit(rules: LimitRule[], enabled = true): MiddlewareHandler {
  return async (c, next) => {
    if (!enabled || c.req.method === "OPTIONS") return next();
    for (const r of rules) {
      const who = r.by === "ip" ? clientIp(c) : ((c.get as (k: string) => { id?: string } | undefined)("user")?.id ?? clientIp(c));
      const res = hit(`${r.name}:${r.by}:${who}`, r.max, r.windowSec * 1000);
      if (!res.ok) { c.header("Retry-After", String(res.retry)); return c.json({ ok: false, error: "too_many_requests", retryAfter: res.retry }, 429); }
    }
    await next();
  };
}
