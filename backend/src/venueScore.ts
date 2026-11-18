// Мекеме көрсеткіштері (Патша, 2026-11-18) — жоспарлы тапсырма (/cron/tick) есептейді, сұрау сайын емес:
//  • Сенімділік: соңғы 90 күнде шағымсыз өткен қызмет үлесі. Қызмет = кассадағы қолдану + орындалған тапсырыс;
//    сәтсіз = мекеме орындамаған тапсырыс (failed) + «Мекеме қабылдамады» шағымы + клиент пайдасына шешілген шағым.
//    Жағдай саны reliabilityMinN-нен (20) аз болса — белгі көрсетілмейді (аз деректен жасалған пайыз алдайды).
//  • Комиссия деңгейі: рейтинг пен пікір саны feeTiers шегіне жетсе — комиссия азаяды (мысалы 4,7★ және 20 пікір → −1%).
//    Басқару мекемеге қолмен комиссия қойса (fee_pct), сол басым. Комиссия қолдану сәтінде жазылады — өткен есеп өзгермейді.
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { Notifier } from "./notify.js";
import { getSettings, refreshFees } from "./settings.js";

export function tierFee(base: number, rating: number | null, reviews: number, tiers: { rating: number; reviews: number; minus: number }[]): number | null {
  if (rating == null) return null;
  const hit = tiers.filter((t) => rating >= t.rating && reviews >= t.reviews).sort((a, b) => b.minus - a.minus)[0];
  return hit ? Math.max(0, base - hit.minus) : null;
}

export async function refreshVenueScores(db: Db, cfg: Config, notify?: Notifier) {
  const s = await getSettings(db);
  await db.execute(sql`
    with served as (
      select b.venue_id, count(*)::int as n from app.redemptions r join app.branches b on b.id = r.branch_id where r.cancelled_at is null and r.created_at > now() - interval '90 days' group by 1
      union all
      select b.venue_id, count(*)::int from app.orders o join app.branches b on b.id = o.branch_id where o.status = 'done' and o.created_at > now() - interval '90 days' group by 1),
    bad as (
      select b.venue_id, count(*)::int as n from app.orders o join app.branches b on b.id = o.branch_id where o.status = 'failed' and o.created_at > now() - interval '90 days' group by 1
      union all
      select venue_id, count(*)::int from app.complaints where (reason = 'refused' or status = 'refunded') and created_at > now() - interval '90 days' group by 1),
    agg as (
      select v.id, coalesce((select sum(n) from served x where x.venue_id = v.id), 0)::int as ok, coalesce((select sum(n) from bad x where x.venue_id = v.id), 0)::int as bad from app.venues v)
    update app.venues v set reliability_n = a.ok + a.bad, reliability = case when a.ok + a.bad > 0 then floor(100.0 * a.ok / (a.ok + a.bad))::int end
    from agg a where a.id = v.id`);
  const rows = (await db.execute(sql`select id, rating, reviews_count, auto_fee_pct, fee_pct from app.venues where status in ('active','paused')`)).rows as { id: string; rating: number | null; reviews_count: number; auto_fee_pct: number | null; fee_pct: number | null }[];
  let changed = false;
  for (const v of rows) {
    const next = tierFee(cfg.MEDEO_FEE_PCT, v.rating == null ? null : Number(v.rating), Number(v.reviews_count), s.feeTiers);
    if (next === (v.auto_fee_pct ?? null)) continue;
    await db.execute(sql`update app.venues set auto_fee_pct = ${next} where id = ${v.id}`);
    changed = true;
    // Хабар тек Басқару қолмен комиссия қоймаған мекемеге (әйтпесе нақты комиссия өзгермейді)
    if (v.fee_pct == null) await notify?.feeTier(v.id, next ?? cfg.MEDEO_FEE_PCT, v.auto_fee_pct ?? cfg.MEDEO_FEE_PCT, Number(v.rating ?? 0));
  }
  if (changed) await refreshFees(db);
}
