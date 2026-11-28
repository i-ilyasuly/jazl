// Пилот көрсеткіштері (Патша, 2026-11-27; founder-skill кеңесі мен іске қосу жоспарының шарттары) — Басқару → Пульс → «Пилот».
// Бір сұраумен: сатылым, екінші пакет, жаңа клиент үлесі (0041 сұрағы), сыйлық, кассадағы уақыт, арналар. Шектер — 30-құжаттағы «өтті / өзгерту керек» сызықтары.
// Есеп тек дерекқордан — сыртқа ештеңе жіберілмейді.
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.js";

type Row = Record<string, unknown>;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
/** Пилот шектері (30-құжат, 9-бөлім): pass — өтті, fix — өзгерту керек */
export const PILOT_LINES = {
  secondPack: { pass: 40, fix: 25 },     // екінші пакетті алғандар, % (бірінші сатып алуынан ≥ 14 күн өткендер ішінде)
  newToVenue: { pass: 30, fix: 15 },     // «Medeo-ға дейін бармаған» деп жауап бергендер, %
  gifts: { pass: 10 },                   // сыйлық ретінде жіберілген пакеттер, % (барлық сатылымнан)
  tillMedianSec: { pass: 10 },           // кассадағы уақыт (QR ашылғаннан расталғанға дейін), медиана, секунд
  tillIncomplete: { pass: 2 },           // аяқталмаған QR сеанстары, %
} as const;

export async function pilotReport(db: Db, days: number) {
  const rows = async <T = Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
  const from = sql`now() - make_interval(days => ${days})`;
  const SOLD = sql.raw(`p.status <> 'pending_payment' and p.source <> 'carry' and p.price_paid > 0`);

  const [s] = await rows<{ packs: number; starter: number; buyers: number; venues: number; gifts: number }>(sql`
    select count(*)::int as packs, count(*) filter (where p.units_total <= 3)::int as starter, count(distinct p.user_id)::int as buyers,
      count(distinct o.venue_id)::int as venues,
      (select count(*) from app.gifts g where g.created_at > ${from} and g.status <> 'cancelled')::int as gifts
    from app.packs p join app.offers o on o.id = p.offer_id where ${SOLD} and p.created_at > ${from}`);
  // Екінші пакет: бірінші сатып алуы кемінде 14 күн бұрын болғандар ішінде — тағы бір (кез келген) пакет алғандар
  const [rep] = await rows<{ matured: number; repeat: number; all_buyers: number; all_repeat: number }>(sql`
    with b as (select p.user_id, min(p.created_at) as first_at, count(*) as n from app.packs p where ${SOLD} and p.source = 'purchase' group by p.user_id)
    select count(*) filter (where first_at < now() - interval '14 days')::int as matured,
      count(*) filter (where first_at < now() - interval '14 days' and n >= 2)::int as repeat,
      count(*)::int as all_buyers, count(*) filter (where n >= 2)::int as all_repeat from b where first_at > ${from} - interval '14 days'`);
  const [pv] = await rows<{ asked: number; n: number; s: number; r: number }>(sql`
    select count(*) filter (where prior_asked_at is not null)::int as asked, count(*) filter (where prior_visit = 'n')::int as n,
      count(*) filter (where prior_visit = 's')::int as s, count(*) filter (where prior_visit = 'r')::int as r
    from app.packs where prior_asked_at > ${from}`);
  // Кассадағы уақыт: кассир QR сеансын ашқаннан клиенттің бірлігі расталғанға дейін (жапсырма QR-ы мен тапсырыстар кірмейді).
  // Аяқталмаған — бас тартылған не мерзімі өткен, бірлік жұмсалмаған сеанс (әлі ашық тұрғандары есептелмейді)
  const [till] = await rows<{ done: number; open_done: number; incomplete: number; median: number | null; p90: number | null }>(sql`
    with q as (select s.id, s.created_at, s.cancelled_at, s.expires_at, r.created_at as paid_at from app.qr_sessions s
      left join app.redemptions r on r.id = s.redemption_id where s.created_at > ${from})
    select count(*) filter (where paid_at is not null)::int as done,
      count(*) filter (where paid_at is not null or cancelled_at is not null or expires_at < now())::int as open_done,
      count(*) filter (where paid_at is null and (cancelled_at is not null or expires_at < now()))::int as incomplete,
      (percentile_cont(0.5) within group (order by extract(epoch from paid_at - created_at)) filter (where paid_at is not null))::float as median,
      (percentile_cont(0.9) within group (order by extract(epoch from paid_at - created_at)) filter (where paid_at is not null))::float as p90
    from q`);
  // Арналар: ad_<код> сілтемелері (жапсырма, Telegram чат, HR) — users.source/source_ref, бірінші кіргенде жазылады (0030)
  const channels = await rows<{ channel: string; users: number; buyers: number; repeat: number }>(sql`
    with u as (select u.id, case when u.source = 'ad' then 'ad_' || coalesce(u.source_ref, '?') else coalesce(u.source, 'белгісіз') end as channel
      from app.users u where u.created_at > ${from}),
      b as (select p.user_id, count(*) as n from app.packs p where ${SOLD} and p.source = 'purchase' group by p.user_id)
    select u.channel, count(*)::int as users, count(b.user_id)::int as buyers, count(*) filter (where b.n >= 2)::int as repeat
    from u left join b on b.user_id = u.id group by u.channel order by users desc limit 20`);
  // Мекеме жауабы (0043): Medeo-дан алғаш келген клиент кейін пакетсіз қайта келе ме
  const [vf] = await rows<{ asked: number; n: number; s: number; r: number; u: number }>(sql`
    select count(*)::int as asked, count(*) filter (where answer = 'n')::int as n, count(*) filter (where answer = 's')::int as s,
      count(*) filter (where answer = 'r')::int as r, count(*) filter (where answer = 'u')::int as u from app.venue_feedback where asked_at > ${from}`);
  const byVenue = await rows<{ venue: string; packs: number; new_share: number | null }>(sql`
    select v.name as venue, count(*)::int as packs,
      round(100.0 * count(*) filter (where p.prior_visit = 'n') / nullif(count(*) filter (where p.prior_visit is not null), 0), 1)::float as new_share
    from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id
    where ${SOLD} and p.created_at > ${from} group by v.name order by packs desc limit 20`);

  const answered = pv.n + pv.s + pv.r;
  const secondPack = pct(rep.repeat, rep.matured);
  const newToVenue = pct(pv.n, answered);
  const gifts = pct(s.gifts, s.packs);
  const median = till.median == null ? null : Math.round(till.median * 10) / 10;
  const incomplete = pct(till.incomplete, till.open_done);
  const L = PILOT_LINES;
  const grade = (v: number | null, pass: number, fix?: number, lower = false) =>
    v == null ? "no_data" : (lower ? v <= pass : v >= pass) ? "pass" : fix != null && (lower ? v > fix : v < fix) ? "fix" : "watch";
  return {
    days,
    sales: { packs: s.packs, perDay: Math.round((s.packs / days) * 10) / 10, buyers: s.buyers, venues: s.venues, starterShare: pct(s.starter, s.packs) },
    secondPack: { value: secondPack, matured: rep.matured, repeat: rep.repeat, allBuyers: rep.all_buyers, allRepeat: rep.all_repeat, grade: grade(secondPack, L.secondPack.pass, L.secondPack.fix) },
    newToVenue: { value: newToVenue, asked: pv.asked, answered, first: pv.n, sometimes: pv.s, regular: pv.r, grade: grade(newToVenue, L.newToVenue.pass, L.newToVenue.fix) },
    gifts: { value: gifts, count: s.gifts, grade: grade(gifts, L.gifts.pass) },
    till: { medianSec: median, p90Sec: till.p90 == null ? null : Math.round(till.p90 * 10) / 10, done: till.done, incomplete: till.incomplete, incompleteShare: incomplete,
      grade: till.done < 5 ? "no_data" : median != null && median <= L.tillMedianSec.pass && (incomplete ?? 0) <= L.tillIncomplete.pass ? "pass" : "fix" },
    venueReturn: { asked: vf.asked, answered: vf.n + vf.s + vf.r + vf.u, none: vf.n, sometimes: vf.s, often: vf.r, unknown: vf.u,
      value: pct(vf.s + vf.r, vf.n + vf.s + vf.r) },
    channels, byVenue, lines: L,
  };
}
