// Стартап метрикалары (Патша, 2026-11-22): Басқару → «Метрикалар». Бір сұраумен барлық көрсеткіш: өсу, белсенділік,
// ұстау (когорттар), unit economics, нарық (marketplace), көздер, сыйлық, төлем, сапа, қаржы (burn, runway), сұраныс.
// Есеп тек дерекқордан — сырттан ештеңе жіберілмейді. Күндік сурет (metrics_daily) — кейін қайта есептелмейтін қор көрсеткіштері.
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.js";
import { leftValueSql } from "./value.js";

type Row = Record<string, unknown>;
const TZ = "Asia/Almaty";
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const growth = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);

// Сатылған пакет (GMV-ге кіреді): төленген, көшірілмеген, бағасы бар. Сатып алушы — тек «purchase».
const SOLD = sql.raw(`p.status <> 'pending_payment' and p.source <> 'carry' and p.price_paid > 0`);
const UNIT_LEFT_VALUE = leftValueSql("p"); // value.ts-тегі ереже: қалдық құн

export async function snapshot(db: Db) {
  const rows = async <T = Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
  const [x] = await rows(sql`select
    (select count(*) from app.users)::int as users,
    (select count(distinct user_id) from app.packs p where ${SOLD} and p.source = 'purchase')::int as buyers,
    (select count(*) from app.venues where status = 'active')::int as venues_active,
    (select count(*) from app.offers where status = 'active')::int as offers_active,
    (select count(*) from app.packs p where p.status = 'active' and p.valid_until > now() and p.units_left > 0)::int as packs_active,
    (select coalesce(sum(p.units_left), 0) from app.packs p where p.status = 'active' and p.valid_until > now())::int as units_outstanding,
    (select coalesce(sum(${UNIT_LEFT_VALUE}), 0) from app.packs p where p.status = 'active' and p.valid_until > now())::int as liability,
    (select coalesce(sum("left"), 0) from app.bonuses where expires_at > now())::int as bonus_liability,
    (select coalesce(sum(p.price_paid), 0) from app.packs p where ${SOLD})::int as gmv_total`);
  await db.execute(sql`insert into app.metrics_daily (day, data, updated_at) values ((now() at time zone ${TZ})::date, ${JSON.stringify(x)}::jsonb, now())
    on conflict (day) do update set data = excluded.data, updated_at = now()`);
  return x;
}

export async function metricsReport(db: Db, defaultFee: number, days: number) {
  const rows = async <T = Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
  const one = async <T = Row>(q: ReturnType<typeof sql>) => (await rows<T>(q))[0];
  const fee = sql.raw(`coalesce(v.fee_pct, v.auto_fee_pct, ${Number(defaultFee)})`);
  const now = sql`now()`;
  const from = sql`now() - make_interval(days => ${days})`;
  const prevFrom = sql`now() - make_interval(days => ${days * 2})`;
  const fromDay = sql`((now() - make_interval(days => ${days})) at time zone ${TZ})::date`;
  const prevDay = sql`((now() - make_interval(days => ${days * 2})) at time zone ${TZ})::date`;

  // ── Өсу: GMV, табыс, take rate, AOV ──
  const sales = (a: ReturnType<typeof sql>, b: ReturnType<typeof sql>) => one<{ gmv: number; booked: number; packs: number; buyers: number }>(sql`
    select coalesce(sum(p.price_paid), 0)::int as gmv, coalesce(sum(round(p.price_paid * ${fee} / 100.0)), 0)::int as booked, count(*)::int as packs,
      count(distinct p.user_id) filter (where p.source = 'purchase')::int as buyers
    from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where ${SOLD} and p.created_at >= ${a} and p.created_at < ${b}`);
  // Танылған табыс: бірлік қолданылғанда мекемеге беріледі, біздің үлес сол сәтте танылады (redemptions + orders, сол сәттегі %)
  const earned = (a: ReturnType<typeof sql>, b: ReturnType<typeof sql>) => one<{ revenue: number; units: number; value: number }>(sql`
    select coalesce(sum(round(x.amount * x.fee_pct / 100.0)), 0)::int as revenue, coalesce(sum(x.units), 0)::int as units, coalesce(sum(x.amount), 0)::int as value from (
      select coalesce(amount, 0) as amount, coalesce(fee_pct, 0) as fee_pct, units::int as units from app.redemptions where cancelled_at is null and created_at >= ${a} and created_at < ${b}
      union all select coalesce(amount, 0), coalesce(fee_pct, 0), 1 from app.orders where status not in ('cancelled','failed') and created_at >= ${a} and created_at < ${b}) x`);
  const newBuyers = (a: ReturnType<typeof sql>, b: ReturnType<typeof sql>) => one<{ n: number }>(sql`
    select count(*)::int as n from (select user_id, min(created_at) as f from app.packs p where ${SOLD} and p.source = 'purchase' group by user_id) t where f >= ${a} and f < ${b}`);
  const newUsers = (a: ReturnType<typeof sql>, b: ReturnType<typeof sql>) => one<{ n: number }>(sql`select count(*)::int as n from app.users where created_at >= ${a} and created_at < ${b}`);
  const [s, sp, e, ep, nb, nbp, nu, nup] = await Promise.all([sales(from, now), sales(prevFrom, from), earned(from, now), earned(prevFrom, from), newBuyers(from, now), newBuyers(prevFrom, from), newUsers(from, now), newUsers(prevFrom, from)]);
  // North Star: аптасына қолданылған бірлік (клиент нақты алған құндылық)
  const [ns, nsp] = await Promise.all([earned(sql`now() - interval '7 days'`, now), earned(sql`now() - interval '14 days'`, sql`now() - interval '7 days'`)]);

  // ── Белсенділік: DAU / WAU / MAU (мини апп ашылымы бойынша) ──
  const act = await one<{ dau: number; wau: number; mau: number }>(sql`select
    count(distinct user_id) filter (where created_at > now() - interval '1 day')::int as dau,
    count(distinct user_id) filter (where created_at > now() - interval '7 days')::int as wau,
    count(distinct user_id) filter (where created_at > now() - interval '30 days')::int as mau
    from app.client_events where kind = 'open' and created_at > now() - interval '30 days'`);
  const daily = await rows<{ d: string; dau: number; gmv: number; units: number; users: number }>(sql`
    with g as (select generate_series((now() at time zone ${TZ})::date - ${days - 1}::int, (now() at time zone ${TZ})::date, interval '1 day')::date as d)
    select to_char(g.d, 'YYYY-MM-DD') as d,
      (select count(distinct user_id) from app.client_events ce where ce.kind = 'open' and (ce.created_at at time zone ${TZ})::date = g.d)::int as dau,
      (select coalesce(sum(p.price_paid), 0) from app.packs p where ${SOLD} and (p.created_at at time zone ${TZ})::date = g.d)::int as gmv,
      ((select coalesce(sum(units), 0) from app.redemptions r where r.cancelled_at is null and (r.created_at at time zone ${TZ})::date = g.d)
        + (select count(*) from app.orders od where od.status not in ('cancelled','failed') and (od.created_at at time zone ${TZ})::date = g.d))::int as units,
      (select count(*) from app.users u where (u.created_at at time zone ${TZ})::date = g.d)::int as users
    from g order by g.d`);

  // ── Ұстау: пайдаланушы D1/D7/D30 (тіркелгеннен N күннен кейін қайта ашқандар), сатып алушы когорттары (апта) ──
  const ret = await one<{ c1: number; r1: number; c7: number; r7: number; c30: number; r30: number }>(sql`
    with u as (select id, created_at from app.users where created_at > now() - interval '120 days')
    select count(*) filter (where created_at < now() - interval '1 day')::int as c1,
      count(*) filter (where created_at < now() - interval '1 day' and exists (select 1 from app.client_events ce where ce.user_id = u.id and ce.kind = 'open' and ce.created_at >= u.created_at + interval '1 day'))::int as r1,
      count(*) filter (where created_at < now() - interval '7 days')::int as c7,
      count(*) filter (where created_at < now() - interval '7 days' and exists (select 1 from app.client_events ce where ce.user_id = u.id and ce.kind = 'open' and ce.created_at >= u.created_at + interval '7 days'))::int as r7,
      count(*) filter (where created_at < now() - interval '30 days')::int as c30,
      count(*) filter (where created_at < now() - interval '30 days' and exists (select 1 from app.client_events ce where ce.user_id = u.id and ce.kind = 'open' and ce.created_at >= u.created_at + interval '30 days'))::int as r30
    from u`);
  const cohorts = await rows<{ week: string; size: number; w1: number; w2: number; w3: number; w4: number }>(sql`
    with p as (select p.user_id, p.created_at from app.packs p where ${SOLD} and p.source = 'purchase'),
      f as (select user_id, date_trunc('week', min(created_at) at time zone ${TZ}) as wk from p group by user_id),
      c as (select f.user_id, f.wk, floor(extract(epoch from (date_trunc('week', p.created_at at time zone ${TZ}) - f.wk)) / 604800)::int as n from f join p on p.user_id = f.user_id)
    select to_char(wk, 'YYYY-MM-DD') as week, count(distinct user_id)::int as size,
      count(distinct user_id) filter (where n = 1)::int as w1, count(distinct user_id) filter (where n = 2)::int as w2,
      count(distinct user_id) filter (where n = 3)::int as w3, count(distinct user_id) filter (where n = 4)::int as w4
    from c where wk > (now() at time zone ${TZ}) - interval '9 weeks' group by wk order by wk desc`);
  const repeat = await one<{ buyers: number; rep: number; churned: number; active: number }>(sql`
    with b as (select user_id, count(*) as n, max(created_at) as last from app.packs p where ${SOLD} and p.source = 'purchase' group by user_id)
    select count(*)::int as buyers, count(*) filter (where n >= 2)::int as rep,
      count(*) filter (where last < now() - interval '45 days' and not exists (select 1 from app.packs p where p.user_id = b.user_id and p.status = 'active' and p.valid_until > now() and p.units_left > 0))::int as churned,
      count(*) filter (where exists (select 1 from app.packs p where p.user_id = b.user_id and p.status = 'active' and p.valid_until > now() and p.units_left > 0))::int as active
    from b`);

  // ── Unit economics: LTV, CAC, LTV/CAC, қайтарылу мерзімі ──
  const life = await one<{ gmv: number; revenue: number; buyers: number }>(sql`select
    (select coalesce(sum(p.price_paid), 0) from app.packs p where ${SOLD})::int as gmv,
    (select coalesce(sum(round(x.amount * x.fee_pct / 100.0)), 0) from (select coalesce(amount,0) as amount, coalesce(fee_pct,0) as fee_pct from app.redemptions where cancelled_at is null union all select coalesce(amount,0), coalesce(fee_pct,0) from app.orders where status not in ('cancelled','failed')) x)::int as revenue,
    (select count(distinct user_id) from app.packs p where ${SOLD} and p.source = 'purchase')::int as buyers`);
  const fin = await one<{ mkt: number; mkt_prev: number; cost: number; cost30: number; mkt30: number; cash: number | null; cash_day: string | null }>(sql`select
    (select coalesce(sum(amount), 0) from app.finance_entries where kind = 'marketing' and day >= ${fromDay})::int as mkt,
    (select coalesce(sum(amount), 0) from app.finance_entries where kind = 'marketing' and day >= ${prevDay} and day < ${fromDay})::int as mkt_prev,
    (select coalesce(sum(amount), 0) from app.finance_entries where kind = 'cost' and day >= ${fromDay})::int as cost,
    (select coalesce(sum(amount), 0) from app.finance_entries where kind = 'cost' and day >= (now() at time zone ${TZ})::date - 30)::int as cost30,
    (select coalesce(sum(amount), 0) from app.finance_entries where kind = 'marketing' and day >= (now() at time zone ${TZ})::date - 30)::int as mkt30,
    (select amount from app.finance_entries where kind = 'cash' order by day desc, created_at desc limit 1)::int as cash,
    (select to_char(day, 'YYYY-MM-DD') from app.finance_entries where kind = 'cash' order by day desc, created_at desc limit 1) as cash_day`);
  const rev30 = await earned(sql`now() - interval '30 days'`, now);
  const ltvRevenue = life.buyers ? Math.round(life.revenue / life.buyers) : null;
  const cac = nb.n ? Math.round(fin.mkt / nb.n) : null;
  const activeBuyers30 = (await one<{ n: number }>(sql`select count(distinct p.user_id)::int as n from app.redemptions r join app.packs p on p.id = r.pack_id where r.cancelled_at is null and r.created_at > now() - interval '30 days'`)).n;
  const arpu30 = activeBuyers30 ? rev30.revenue / activeBuyers30 : 0;
  const burn = fin.cost30 + fin.mkt30 - rev30.revenue; // net burn: айлық шығын − айлық табыс

  // ── Қолдану: утилизация, міндеттеме, күйген құн, бірінші қолдануға дейін ──
  const use = await one<{ sold_units: number; used_units: number; liability: number; outstanding: number; bonus_liab: number; breakage: number; first_h: number | null }>(sql`select
    (select coalesce(sum(p.units_total), 0) from app.packs p where ${SOLD} and p.created_at >= ${from})::int as sold_units,
    (select coalesce(sum(p.units_total - p.units_left), 0) from app.packs p where ${SOLD} and p.created_at >= ${from})::int as used_units,
    (select coalesce(sum(${UNIT_LEFT_VALUE}), 0) from app.packs p where p.status = 'active' and p.valid_until > now())::int as liability,
    (select coalesce(sum(p.units_left), 0) from app.packs p where p.status = 'active' and p.valid_until > now())::int as outstanding,
    (select coalesce(sum("left"), 0) from app.bonuses where expires_at > now())::int as bonus_liab,
    (select coalesce(sum(amount), 0) from app.bonuses where kind = 'breakage' and created_at >= ${from})::int as breakage,
    (select percentile_cont(0.5) within group (order by extract(epoch from f.first_at - f.created_at) / 3600) from (
      select p.created_at, min(e.created_at) as first_at from app.packs p join app.pack_events e on e.pack_id = p.id and e.units_delta < 0
      where ${SOLD} and p.created_at >= ${from} group by p.id, p.created_at) f)::float as first_h`);

  // ── Нарық (marketplace): мекемелер, өтімділік, шоғырлану ──
  const mk = await one<{ venues: number; venues_sale: number; offers: number; offers_sale: number }>(sql`select
    (select count(*) from app.venues where status = 'active')::int as venues,
    (select count(distinct o.venue_id) from app.packs p join app.offers o on o.id = p.offer_id where ${SOLD} and p.created_at >= ${from})::int as venues_sale,
    (select count(*) from app.offers where status = 'active')::int as offers,
    (select count(distinct p.offer_id) from app.packs p join app.offers o on o.id = p.offer_id where ${SOLD} and p.created_at >= ${from} and o.status = 'active')::int as offers_sale`);
  const topVenues = await rows<{ name: string; gmv: number; packs: number; buyers: number }>(sql`
    select v.name, coalesce(sum(p.price_paid), 0)::int as gmv, count(*)::int as packs, count(distinct p.user_id)::int as buyers
    from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where ${SOLD} and p.created_at >= ${from}
    group by v.id, v.name order by gmv desc limit 8`);
  const byKind = await rows<{ kind: string; gmv: number; packs: number }>(sql`
    select o.kind::text as kind, coalesce(sum(p.price_paid), 0)::int as gmv, count(*)::int as packs
    from app.packs p join app.offers o on o.id = p.offer_id where ${SOLD} and p.created_at >= ${from} group by o.kind order by gmv desc`);

  // ── Көздер (acquisition): қайдан келді → қаншасы сатып алды ──
  const sources = await rows<{ source: string; users: number; buyers: number }>(sql`
    select coalesce(u.source, 'белгісіз') as source, count(*)::int as users,
      count(*) filter (where exists (select 1 from app.packs p where p.user_id = u.id and ${SOLD} and p.source = 'purchase'))::int as buyers
    from app.users u where u.created_at >= ${from} group by 1 order by users desc`);
  const campaigns = await rows<{ ref: string; users: number; buyers: number }>(sql`
    select u.source_ref as ref, count(*)::int as users,
      count(*) filter (where exists (select 1 from app.packs p where p.user_id = u.id and ${SOLD} and p.source = 'purchase'))::int as buyers
    from app.users u where u.source = 'ad' and u.created_at >= ${from} group by 1 order by users desc limit 10`);
  const platforms = await rows<{ platform: string; users: number }>(sql`
    select coalesce(first_platform, 'белгісіз') as platform, count(*)::int as users from app.users where created_at >= ${from} group by 1 order by users desc`);

  // ── Сыйлық (вирустық өсу): жіберілді → қабылданды → алушы өзі сатып алды ──
  const gifts = await one<{ sent: number; accepted: number; converted: number; senders: number }>(sql`select
    count(*)::int as sent, count(*) filter (where g.status = 'accepted')::int as accepted, count(distinct g.from_user_id)::int as senders,
    count(distinct g.to_user_id) filter (where g.to_user_id is not null and exists (select 1 from app.packs p where p.user_id = g.to_user_id and ${SOLD} and p.source = 'purchase' and p.created_at > g.created_at))::int as converted
    from app.gifts g where g.created_at >= ${from}`);

  // ── Төлем: сәттілік, сәтсіздік себептері, қайтару ──
  const pay = await one<{ total: number; paid: number; failed: number; refunds: number; refunded: number }>(sql`select
    count(*)::int as total, count(*) filter (where status in ('paid','refunded'))::int as paid, count(*) filter (where status = 'failed')::int as failed,
    count(*) filter (where refunded > 0)::int as refunds, coalesce(sum(refunded), 0)::int as refunded
    from app.payments where created_at >= ${from} and provider <> 'test'`);
  const payMethods = await rows<{ method: string; total: number; paid: number }>(sql`
    select method, count(*)::int as total, count(*) filter (where status in ('paid','refunded'))::int as paid from app.payments where created_at >= ${from} group by method order by total desc`);
  const payFail = await rows<{ reason: string; n: number }>(sql`
    select coalesce(failure, 'белгісіз') as reason, count(*)::int as n from app.payments where status = 'failed' and created_at >= ${from} group by 1 order by n desc limit 6`);

  // ── Сапа: шағым, баға, қате ──
  const q = await one<{ complaints: number; refunded_c: number; stars: number | null; ratings: number; err_users: number; open_users: number }>(sql`select
    (select count(*) from app.complaints where created_at >= ${from})::int as complaints,
    (select count(*) from app.complaints where created_at >= ${from} and status = 'refunded')::int as refunded_c,
    (select round(avg(stars)::numeric, 2) from app.ratings where created_at >= ${from})::float as stars,
    (select count(*) from app.ratings where created_at >= ${from})::int as ratings,
    (select count(distinct user_id) from app.client_events where kind = 'error' and created_at >= ${from})::int as err_users,
    (select count(distinct user_id) from app.client_events where kind = 'open' and created_at >= ${from})::int as open_users`);
  const renewOff = await rows<{ reason: string; n: number }>(sql`select reason, count(*)::int as n from app.feedback where kind = 'renew_off' and created_at >= ${from} group by reason order by n desc limit 6`);

  // ── Уақыт: қай сағатта, қай күні қолданады (Алматы уақыты) ──
  const hours = await rows<{ h: number; n: number }>(sql`
    select extract(hour from created_at at time zone ${TZ})::int as h, sum(n)::int as n from (
      select created_at, units::int as n from app.redemptions where cancelled_at is null and created_at >= ${from}
      union all select created_at, 1 from app.orders where status not in ('cancelled','failed') and created_at >= ${from}) x group by 1 order by 1`);
  const weekdays = await rows<{ d: number; n: number }>(sql`
    select extract(isodow from created_at at time zone ${TZ})::int as d, sum(n)::int as n from (
      select created_at, units::int as n from app.redemptions where cancelled_at is null and created_at >= ${from}
      union all select created_at, 1 from app.orders where status not in ('cancelled','failed') and created_at >= ${from}) x group by 1 order by 1`);

  // ── Сұраныс: не іздейді, нені таппайды ──
  const searches = await rows<{ q: string; n: number; users: number; zero: number }>(sql`
    select lower(ref) as q, count(*)::int as n, count(distinct user_id)::int as users, count(*) filter (where (meta->>'n')::int = 0)::int as zero
    from app.client_events where kind = 'search' and ref is not null and created_at >= ${from} group by 1 order by users desc, n desc limit 15`);
  const shares = await one<{ n: number; users: number }>(sql`select count(*)::int as n, count(distinct user_id)::int as users from app.client_events where kind = 'share' and created_at >= ${from}`);
  const prices = await one<{ changes: number; offers: number }>(sql`
    select count(*)::int as changes, count(distinct offer_id)::int as offers from app.offer_price_log l
    where l.created_at >= ${from} and exists (select 1 from app.offer_price_log x where x.offer_id = l.offer_id and x.created_at < l.created_at)`);

  // ── Күндік сурет тарихы (міндеттеме, белсенді пакеттер, мекемелер…) ──
  const snaps = await rows<{ day: string; data: Row }>(sql`select to_char(day, 'YYYY-MM-DD') as day, data from app.metrics_daily where day > (now() at time zone ${TZ})::date - ${days}::int order by day`);

  return {
    days,
    northStar: { units: ns.units, growth: growth(ns.units, nsp.units), prev: nsp.units },
    growth: {
      gmv: s.gmv, gmvGrowth: growth(s.gmv, sp.gmv), revenue: e.revenue, revenueGrowth: growth(e.revenue, ep.revenue), booked: s.booked,
      takeRate: pct(s.booked, s.gmv), packs: s.packs, packsGrowth: growth(s.packs, sp.packs), aov: s.packs ? Math.round(s.gmv / s.packs) : null,
      newUsers: nu.n, newUsersGrowth: growth(nu.n, nup.n), newBuyers: nb.n, newBuyersGrowth: growth(nb.n, nbp.n), buyers: s.buyers,
      conversion: pct(nb.n, nu.n),
    },
    activity: { ...act, stickiness: pct(act.dau, act.mau), daily },
    retention: {
      d1: pct(ret.r1, ret.c1), d7: pct(ret.r7, ret.c7), d30: pct(ret.r30, ret.c30), base: { d1: ret.c1, d7: ret.c7, d30: ret.c30 },
      repeat: pct(repeat.rep, repeat.buyers), buyers: repeat.buyers, activeBuyers: repeat.active, churn: pct(repeat.churned, repeat.buyers), cohorts,
    },
    unit: {
      ltvGmv: life.buyers ? Math.round(life.gmv / life.buyers) : null, ltvRevenue, cac, ltvCac: cac && ltvRevenue ? Math.round((ltvRevenue / cac) * 10) / 10 : null,
      payback: cac && arpu30 > 0 ? Math.round((cac / arpu30) * 10) / 10 : null, marketing: fin.mkt, marketingGrowth: growth(fin.mkt, fin.mkt_prev), arpu30: Math.round(arpu30),
    },
    usage: {
      soldUnits: use.sold_units, usedUnits: use.used_units, utilization: pct(use.used_units, use.sold_units), unitsUsed: e.units, valueUsed: e.value,
      liability: use.liability, outstanding: use.outstanding, bonusLiability: use.bonus_liab, breakage: use.breakage,
      firstUseHours: use.first_h == null ? null : Math.round(use.first_h * 10) / 10,
    },
    market: {
      venues: mk.venues, venuesWithSale: mk.venues_sale, venueLiquidity: pct(mk.venues_sale, mk.venues), offers: mk.offers, offersWithSale: mk.offers_sale,
      offerLiquidity: pct(mk.offers_sale, mk.offers), gmvPerVenue: mk.venues_sale ? Math.round(s.gmv / mk.venues_sale) : null,
      topShare: s.gmv && topVenues[0] ? pct(topVenues[0].gmv, s.gmv) : null, topVenues, byKind,
    },
    acquisition: { sources, campaigns, platforms },
    gifts: { ...gifts, acceptRate: pct(gifts.accepted, gifts.sent), convRate: pct(gifts.converted, gifts.accepted) },
    payments: { ...pay, successRate: pct(pay.paid, pay.total), refundRate: pct(pay.refunds, pay.paid), methods: payMethods, failures: payFail },
    quality: {
      complaints: q.complaints, complaintRate: e.units ? Math.round((q.complaints / e.units) * 1000) / 10 : null, complaintsRefunded: q.refunded_c,
      stars: q.stars, ratings: q.ratings, errorShare: pct(q.err_users, q.open_users), renewOff,
    },
    finance: {
      marketing: fin.mkt, costs: fin.cost, revenue: e.revenue, burn30: burn, cash: fin.cash, cashDay: fin.cash_day,
      runway: fin.cash != null && burn > 0 ? Math.round((fin.cash / burn) * 10) / 10 : null, profitable: burn <= 0 && (fin.cost30 + fin.mkt30) > 0,
    },
    time: { hours, weekdays },
    demand: { searches, shares, priceChanges: prices },
    snapshots: snaps,
  };
}
