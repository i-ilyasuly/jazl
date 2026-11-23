// Мекеменің ақшасы (Патша, 2026-11-23): есептелді (қолдану кезінде мекеме үлесі), аударылды (venue_payouts), қалдық.
// Мекеме үлесі әр қолданудың өз сәтіндегі комиссиясымен есептеледі (venue.ts → payout), кейін комиссия өзгерсе де өткені өзгермейді.
// Ақша алушы (0034): франшиза желісінде әр филиал өз заңды тұлғасына байланады — есеп пен аударым алушы бойынша бөлінеді.
// Филиалдың payee_id бос болса — мекеменің негізгі алушысы; аударымның payee_id бос болса (ескі жазба) — да негізгісі.
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.js";

/** Мекеме үлесі (₸): берілген уақыт аралығындағы барлық жарамды қолдану (QR + алдын ала тапсырыс); branchIds — тек осы филиалдар */
export async function accrued(db: Db, venueId: string, from?: Date | null, to?: Date | null, branchIds?: string[]): Promise<number> {
  if (branchIds && !branchIds.length) return 0;
  const f = from ?? new Date(0), t = to ?? new Date("2999-01-01");
  const only = branchIds ? sql`and b.id in ${branchIds}` : sql``;
  const r = (await db.execute(sql`select coalesce((
      select sum(round(r.amount::numeric * (100 - r.fee_pct) / 100)) from app.redemptions r join app.branches b on b.id = r.branch_id
       where b.venue_id = ${venueId} ${only} and r.cancelled_at is null and r.created_at >= ${f} and r.created_at < ${t}), 0)
    + coalesce((
      select sum(round(od.amount::numeric * (100 - od.fee_pct) / 100)) from app.orders od join app.branches b on b.id = od.branch_id
       where b.venue_id = ${venueId} ${only} and od.status not in ('cancelled','failed') and od.created_at >= ${f} and od.created_at < ${t}), 0) as v`)).rows[0] as { v: string | number };
  return Math.round(Number(r.v));
}

export interface PayoutRow { id: string; amount: number; from: string; to: string; paidAt: string; ref: string | null; note: string | null; payeeId: string | null }
export interface Payee { id: string; legalName: string; bin: string | null; iban: string | null; bank: string | null; contractNo: string | null; isMain: boolean }

/** Мекеменің аударымдары; payee берілсе — тек сол алушыныкі (негізгі алушыға payee_id бос ескі жазбалар да кіреді) */
export async function payoutsOf(db: Db, venueId: string, limit = 50, payee?: { id: string; isMain: boolean } | null): Promise<PayoutRow[]> {
  const only = payee ? (payee.isMain ? sql`and (payee_id = ${payee.id} or payee_id is null)` : sql`and payee_id = ${payee.id}`) : sql``;
  return (await db.execute(sql`select id, amount, to_char(period_from, 'YYYY-MM-DD') as "from", to_char(period_to, 'YYYY-MM-DD') as "to",
      to_char(paid_at, 'YYYY-MM-DD') as "paidAt", ref, note, payee_id as "payeeId" from app.venue_payouts where venue_id = ${venueId} ${only} order by period_to desc, created_at desc limit ${limit}`)).rows as unknown as PayoutRow[];
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

export async function payeesOf(db: Db, venueId: string): Promise<Payee[]> {
  return (await db.execute(sql`select id, legal_name as "legalName", bin, iban, bank, contract_no as "contractNo", is_main as "isMain" from app.venue_payees
    where venue_id = ${venueId} order by is_main desc, created_at`)).rows as unknown as Payee[];
}

/** Алушы топтары: әр алушыға қай филиалдар тиесілі. Алушы тіркелмеген мекемеде — бір топ (payee: null), барлық филиал. */
export async function payeeGroups(db: Db, venueId: string) {
  const [ps, bs] = await Promise.all([
    payeesOf(db, venueId),
    db.execute(sql`select id, address, payee_id as "payeeId" from app.branches where venue_id = ${venueId} and active order by created_at`),
  ]);
  const main = ps.find((p) => p.isMain) ?? null;
  const brs = bs.rows as { id: string; address: string; payeeId: string | null }[];
  const keyOf = (pid: string | null) => (pid && ps.some((p) => p.id === pid) ? pid : main?.id ?? null);
  const groups = (ps.length ? ps : [null]).map((p) => ({ payee: p, branches: brs.filter((b) => keyOf(b.payeeId) === (p?.id ?? null)).map(({ id, address }) => ({ id, address })) }));
  // Негізгі алушы жоқ, бірақ алушысы жоқ филиал бар — «Белгіленбеген» тобы
  const lost = brs.filter((b) => keyOf(b.payeeId) === null);
  if (ps.length && lost.length) groups.push({ payee: null, branches: lost.map(({ id, address }) => ({ id, address })) });
  return groups;
}

/** Әр алушының есебі: есептелді, аударылды, қалдық, қай күнге дейін аударылды */
export async function balances(db: Db, venueId: string) {
  const groups = await payeeGroups(db, venueId);
  return Promise.all(groups.map(async (g) => {
    const list = g.payee ? await payoutsOf(db, venueId, 500, g.payee) : groups.length === 1 ? await payoutsOf(db, venueId, 500) : [];
    const earned = await accrued(db, venueId, null, null, g.branches.map((b) => b.id));
    const paid = list.reduce((a, x) => a + Number(x.amount), 0);
    return { ...g, earned, paid, due: Math.max(0, earned - paid), paidThrough: list.map((x) => x.to).sort().at(-1) ?? null };
  }));
}

/** Күн аударым кезеңінің ішінде ме (күн — 'YYYY-MM-DD', Алматы уақыты). keys берілсе — әр алушыға аударылған болуы керек */
export const dayPaid = (day: string, list: PayoutRow[], keys?: (string | null)[], mainId?: string | null) => {
  const cover = list.filter((p) => p.from <= day && day <= p.to);
  if (!keys || keys.length < 2) return cover.length > 0;
  const got = new Set(cover.map((p) => p.payeeId ?? mainId ?? null));
  return keys.every((k) => got.has(k));
};

/** Алматыдағы бүгінгі күннің басы (UTC+5, 2024 жылдан бүкіл Қазақстан бір белдеуде), мс */
export const almatyDayStart = (now = Date.now()) => { const off = 5 * 3600_000; return Math.floor((now + off) / 86400_000) * 86400_000 - off; };
