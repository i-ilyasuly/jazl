// Сату лимиті (Патша, 2026-11-18): мекеме ұсыныстың айлық сатылым санын шектей алады (мыс. Bahandi — айына 50 жазылым).
// Лимит әр айдың 1-інде (Алматы уақыты) қайта ашылады. Бір адамға шекті де мекеме өзі қояды (бір кісі бәрін алып қоймауы үшін).
// Ережелер offers.rules ішінде: { monthlyLimit?: number | null, perUserLimit?: number | null }.
// Есеп: осы айда жасалған пакеттер (қайтарылғандар мен «көшу» пакеттерінен басқа). Төлемі шешілмеген пакет 2 сағатқа дейін
// орынды ұстайды (екі адам соңғы орынды бір мезетте алмауы және кеш расталған төлем артық сатылмауы үшін).
import { sql } from "drizzle-orm";

type Exec = { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> };
export type Limits = { monthlyLimit: number | null; perUserLimit: number | null };

export const limitsOf = (rules: unknown): Limits => {
  const r = (rules ?? {}) as { monthlyLimit?: unknown; perUserLimit?: unknown };
  const n = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : null);
  return { monthlyLimit: n(r.monthlyLimit), perUserLimit: n(r.perUserLimit) };
};

/** Осы айдың басы (Алматы) */
const MONTH = sql`(date_trunc('month', now() at time zone 'Asia/Almaty') at time zone 'Asia/Almaty')`;
/** Пакет орын алады: төленген (кейін пайдаланылған/мерзімі өткен/сыйланған да) не төлемі әлі шешілмеген «күтуде» пакет.
 *  Күтудегі пакет өз төлемі «created/pending» күйінде тұрғанда 2 сағат бойы орын ұстайды (банк беті / 3-D Secure кеш расталса да
 *  лимиттен артық сатылмауы үшін); төлем өтпесе не 2 сағат өтсе — орын босайды. Корпоративтік сыйлықта төлем meta.packIds арқылы табылады. */
const HOLDS = sql`p.status <> 'refunded' and p.source <> 'carry' and p.created_at >= ${MONTH}
  and (p.status <> 'pending_payment' or (p.created_at > now() - interval '2 hours'
    and exists (select 1 from app.payments y where (y.pack_id = p.id or (y.meta->'packIds') @> to_jsonb(p.id::text)) and y.status in ('created','pending'))))`;

/** Ұсыныстар бойынша осы айда сатылғаны */
export async function soldThisMonth(db: Exec, offerIds: string[]): Promise<Map<string, number>> {
  if (!offerIds.length) return new Map();
  const rows = (await db.execute(sql`select p.offer_id, count(*)::int as n from app.packs p
    where p.offer_id in (${sql.join(offerIds.map((x) => sql`${x}`), sql`, `)}) and ${HOLDS} group by p.offer_id`)).rows as { offer_id: string; n: number }[];
  return new Map(rows.map((x) => [x.offer_id, x.n]));
}

/** Клиент осы айда осы ұсыныстан алған пакеттер саны: өзіне алғандары және өзгеге сыйлағандары (өзіне келген сыйлық санға кірмейді) */
export async function boughtByUser(db: Exec, offerId: string, userId: string): Promise<number> {
  const [r] = (await db.execute(sql`select count(*)::int as n from app.packs p
    where p.offer_id = ${offerId} and ${HOLDS}
      and ((p.user_id = ${userId} and p.source <> 'gift') or exists (select 1 from app.gifts g where g.pack_id = p.id and g.from_user_id = ${userId}))`)).rows as { n: number }[];
  return r?.n ?? 0;
}

/** Сатып алар алдында тексеру. Шақырушы ұсыныс жолын FOR UPDATE құлыптап тұруы керек (бір мезеттегі соңғы орын). */
export async function checkLimits(db: Exec, offer: { id: string; rules: unknown }, userId: string, count: number):
  Promise<null | { code: "sold_out" | "user_limit"; extra: Record<string, unknown> }> {
  const lim = limitsOf(offer.rules);
  if (lim.monthlyLimit) {
    const sold = (await soldThisMonth(db, [offer.id])).get(offer.id) ?? 0;
    const left = Math.max(0, lim.monthlyLimit - sold);
    if (left < count) return { code: "sold_out", extra: { left, limit: lim.monthlyLimit } };
  }
  if (lim.perUserLimit) {
    const mine = await boughtByUser(db, offer.id, userId);
    const left = Math.max(0, lim.perUserLimit - mine);
    if (left < count) return { code: "user_limit", extra: { left, limit: lim.perUserLimit } };
  }
  return null;
}

/** Бір мекемедегі міндеттеме шегі (Патша, 2026-11-28; inKind/True Food Kitchen сабағы, 32-құжат): мекемеде әлі жұмсалмаған бірліктердің
 *  жалпы құны (белсенді пакеттер + 2 сағаттан жас «күтуде» пакеттер) жаңа сатылыммен бірге шектен аспайды.
 *  Шек: Басқару қолмен қойса — liability_cap; әйтпесе айлық табыстың pct %-ы; табыс белгісіз болса — fallback ₸. */
export async function venueOutstanding(db: Exec, venueId: string): Promise<number> {
  const [r] = (await db.execute(sql`select coalesce(sum(${sql.raw("(p.value_total - floor(p.value_total::numeric * (p.units_total - p.units_left) / greatest(p.units_total, 1)))")}), 0)::bigint as v
    from app.packs p join app.offers o on o.id = p.offer_id
    where o.venue_id = ${venueId} and p.units_left > 0 and (p.status = 'active' or (p.status = 'pending_payment' and p.created_at > now() - interval '2 hours'))`)).rows as { v: string }[];
  return Number(r?.v ?? 0);
}
export const venueCapOf = (v: { monthlyRevenue: number | null; liabilityCap: number | null }, s: { venueLiabilityPct: number; venueLiabilityDefault: number }) =>
  v.liabilityCap ?? (v.monthlyRevenue ? Math.round((v.monthlyRevenue * s.venueLiabilityPct) / 100) : s.venueLiabilityDefault);
export async function checkVenueCap(db: Exec, v: { id: string; monthlyRevenue: number | null; liabilityCap: number | null }, add: number, s: { venueLiabilityPct: number; venueLiabilityDefault: number }) {
  const cap = venueCapOf(v, s);
  const out = await venueOutstanding(db, v.id);
  return out + add > cap ? { code: "venue_cap" as const, extra: { left: Math.max(0, cap - out) } } : null;
}
