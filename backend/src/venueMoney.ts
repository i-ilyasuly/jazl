// Мекеменің ақшасы (Патша, 2026-11-23): есептелді (қолдану кезінде мекеме үлесі), аударылды (venue_payouts), қалдық.
// Мекеме үлесі әр қолданудың өз сәтіндегі комиссиясымен есептеледі (venue.ts → payout), кейін комиссия өзгерсе де өткені өзгермейді.
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.js";

/** Мекеме үлесі (₸): берілген уақыт аралығындағы барлық жарамды қолдану (QR + алдын ала тапсырыс) */
export async function accrued(db: Db, venueId: string, from?: Date | null, to?: Date | null): Promise<number> {
  const f = from ?? new Date(0), t = to ?? new Date("2999-01-01");
  const r = (await db.execute(sql`select coalesce((
      select sum(round(r.amount::numeric * (100 - r.fee_pct) / 100)) from app.redemptions r join app.branches b on b.id = r.branch_id
       where b.venue_id = ${venueId} and r.cancelled_at is null and r.created_at >= ${f} and r.created_at < ${t}), 0)
    + coalesce((
      select sum(round(od.amount::numeric * (100 - od.fee_pct) / 100)) from app.orders od join app.branches b on b.id = od.branch_id
       where b.venue_id = ${venueId} and od.status not in ('cancelled','failed') and od.created_at >= ${f} and od.created_at < ${t}), 0) as v`)).rows[0] as { v: string | number };
  return Math.round(Number(r.v));
}

export interface PayoutRow { id: string; amount: number; from: string; to: string; paidAt: string; ref: string | null; note: string | null }

export async function payoutsOf(db: Db, venueId: string, limit = 50): Promise<PayoutRow[]> {
  return (await db.execute(sql`select id, amount, to_char(period_from, 'YYYY-MM-DD') as "from", to_char(period_to, 'YYYY-MM-DD') as "to",
      to_char(paid_at, 'YYYY-MM-DD') as "paidAt", ref, note from app.venue_payouts where venue_id = ${venueId} order by period_to desc, created_at desc limit ${limit}`)).rows as unknown as PayoutRow[];
}

/** Жиынтық: барлық уақытта есептелді, аударылды, қалдық (аударуды күтуде) */
export async function balance(db: Db, venueId: string) {
  const [earned, paidRow] = await Promise.all([
    accrued(db, venueId),
    db.execute(sql`select coalesce(sum(amount), 0)::int as v, to_char(max(period_to), 'YYYY-MM-DD') as last from app.venue_payouts where venue_id = ${venueId}`),
  ]);
  const p = paidRow.rows[0] as { v: number; last: string | null };
  return { earned, paid: p.v, due: Math.max(0, earned - p.v), paidThrough: p.last };
}

/** Күн аударым кезеңінің ішінде ме (күн — 'YYYY-MM-DD', Алматы уақыты) */
export const dayPaid = (day: string, list: PayoutRow[]) => list.some((p) => p.from <= day && day <= p.to);

/** Алматыдағы бүгінгі күннің басы (UTC+5, 2024 жылдан бүкіл Қазақстан бір белдеуде), мс */
export const almatyDayStart = (now = Date.now()) => { const off = 5 * 3600_000; return Math.floor((now + off) / 86400_000) * 86400_000 - off; };
