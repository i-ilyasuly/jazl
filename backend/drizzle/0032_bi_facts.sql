-- Looker Studio үшін БІР ортақ кесте (Патша, 2026-11-22): bi.facts — әр жол бір «факт» (жаңа клиент, пакет, қолдану,
-- төлем, оқиға, сыйлық, баға, шағым, күндік сурет, қаржы). Барлық графиктер бір деректер көзінен, «fact» сүзгісімен құрылады.
-- Әр жолға клиенттің көзі, платформасы, когорт аптасы қосылған — кез келген көрсеткішті көз бойынша бөлуге болады. Жеке дерек жоқ.
CREATE OR REPLACE VIEW bi.facts AS
WITH u AS (SELECT user_id, source, campaign, platform, created_week AS user_week, date_trunc('week', first_purchase_day)::date AS buyer_week FROM bi.users)
SELECT f.*, u.source, u.campaign, u.platform, u.user_week, u.buyer_week,
  date_trunc('week', f.day)::date AS week, date_trunc('month', f.day)::date AS month, extract(isodow FROM f.day)::int AS weekday
FROM (
  SELECT 'user'::text AS fact, ''::text AS sub, x.user_id, x.created_day AS day, extract(hour FROM x.created_at AT TIME ZONE 'Asia/Almaty')::int AS hour,
    NULL::text AS venue, NULL::text AS kind, NULL::text AS item, NULL::text AS status,
    0::numeric AS amount, 0::numeric AS revenue, 0::numeric AS units, CASE WHEN x.is_buyer THEN 1 ELSE 0 END AS flag, NULL::numeric AS value
  FROM bi.users x
  UNION ALL
  SELECT 'pack', p.source, p.user_id, p.day, p.hour, p.venue, p.kind, p.offer, p.status,
    p.price_paid, p.fee_booked, p.units_total, CASE WHEN p.is_first_purchase THEN 1 ELSE 0 END, p.used_pct
  FROM bi.packs p
  UNION ALL
  SELECT 'use', x.channel, x.user_id, x.day, x.hour, x.venue, x.kind, NULL, CASE WHEN x.cancelled THEN 'cancelled' ELSE 'ok' END,
    x.amount, x.revenue, x.units, CASE WHEN x.cancelled THEN 0 ELSE 1 END, NULL
  FROM bi.uses x
  UNION ALL
  SELECT 'payment', x.method, x.user_id, x.day, extract(hour FROM x.created_at AT TIME ZONE 'Asia/Almaty')::int, NULL, NULL, nullif(x.failure, ''), x.status,
    x.amount, 0, 0, CASE WHEN x.status IN ('paid', 'refunded') THEN 1 ELSE 0 END, x.refunded
  FROM bi.payments x WHERE x.provider <> 'test'
  UNION ALL
  SELECT 'event', e.kind, e.user_id, e.day, e.hour, NULL, NULL, coalesce(e.ref, e.error), coalesce(e.link_type, e.scan_type),
    0, 0, 0, CASE WHEN e.kind = 'search' AND e.results = 0 THEN 1 ELSE 0 END, e.results
  FROM bi.events e
  UNION ALL
  SELECT 'gift', g.status, g.from_user_id, g.day, extract(hour FROM g.created_at AT TIME ZONE 'Asia/Almaty')::int, g.venue, NULL, NULL, g.status,
    g.amount, 0, 1, CASE WHEN g.recipient_bought THEN 1 ELSE 0 END, NULL
  FROM bi.gifts g
  UNION ALL
  SELECT 'rating', '', NULL, r.day, NULL, r.venue, NULL, NULL, CASE WHEN r.replied THEN 'replied' ELSE '' END, 0, 0, 0, 1, r.stars
  FROM bi.ratings r
  UNION ALL
  SELECT 'complaint', c.reason, NULL, c.day, NULL, c.venue, NULL, NULL, c.status, 0, 0, 0, 1, c.hours_to_decide
  FROM bi.complaints c
  UNION ALL
  SELECT 'sticker', '', NULL, s.day, NULL, s.venue, NULL, s.address, NULL, 0, 0, 0, 1, NULL
  FROM bi.stickers s
  UNION ALL
  SELECT 'finance', fi.kind, NULL, fi.day, NULL, NULL, NULL, fi.category, NULL, fi.amount, 0, 0, 0, NULL
  FROM bi.finance fi
  UNION ALL
  SELECT 'snapshot', k.key, NULL, s.day, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, k.value
  FROM bi.snapshots s CROSS JOIN LATERAL (VALUES ('users', s.users), ('buyers', s.buyers), ('venues_active', s.venues_active), ('offers_active', s.offers_active),
    ('packs_active', s.packs_active), ('units_outstanding', s.units_outstanding), ('liability', s.liability), ('bonus_liability', s.bonus_liability), ('gmv_total', s.gmv_total)) AS k(key, value)
) f LEFT JOIN u ON u.user_id = f.user_id;--> statement-breakpoint
GRANT SELECT ON bi.facts TO looker_ro;
