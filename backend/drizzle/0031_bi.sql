-- Looker Studio үшін есеп көріністері (Патша, 2026-11-22). «bi» схемасы — тек оқуға, ЖЕКЕ ДЕРЕКСІЗ:
-- клиенттің аты, тегі, @username, телефоны, Telegram ID-сы, PIN, карта, пікір мәтіні мұнда ЖОҚ (тек ішкі uuid).
-- Кіру: looker_ro рөлі (NOLOGIN). Құпия сөзді Патша Neon-да өзі қояды: ALTER ROLE looker_ro LOGIN PASSWORD '…';
-- Уақыт — Алматы (Asia/Almaty). Комиссия: мекеменің fee_pct → auto_fee_pct → 10%.
CREATE SCHEMA IF NOT EXISTS bi;--> statement-breakpoint

-- Клиенттер: қайдан келді, қашан, сатып алды ма
CREATE OR REPLACE VIEW bi.users AS
SELECT u.id AS user_id,
  u.created_at, (u.created_at AT TIME ZONE 'Asia/Almaty')::date AS created_day,
  date_trunc('week', u.created_at AT TIME ZONE 'Asia/Almaty')::date AS created_week,
  coalesce(u.source, 'белгісіз') AS source, u.source_ref AS campaign, coalesce(u.first_platform, 'белгісіз') AS platform,
  u.lang, u.city, u.last_seen_at, (u.last_seen_at AT TIME ZONE 'Asia/Almaty')::date AS last_seen_day,
  b.first_purchase_at, (b.first_purchase_at AT TIME ZONE 'Asia/Almaty')::date AS first_purchase_day,
  coalesce(b.packs, 0) AS packs_bought, coalesce(b.gmv, 0) AS gmv,
  (b.packs IS NOT NULL) AS is_buyer, (coalesce(b.packs, 0) >= 2) AS is_repeat,
  extract(epoch FROM b.first_purchase_at - u.created_at) / 3600 AS hours_to_first_purchase
FROM app.users u
LEFT JOIN (SELECT p.user_id, min(p.created_at) AS first_purchase_at, count(*) AS packs, sum(p.price_paid) AS gmv
  FROM app.packs p WHERE p.status <> 'pending_payment' AND p.source = 'purchase' AND p.price_paid > 0 GROUP BY p.user_id) b ON b.user_id = u.id;--> statement-breakpoint

-- Мекемелер
CREATE OR REPLACE VIEW bi.venues AS
SELECT v.id AS venue_id, v.name AS venue, v.slug, v.kind::text AS kind, v.city, v.status::text AS status,
  coalesce(v.fee_pct, v.auto_fee_pct, 10) AS fee_pct, v.rating, v.reviews_count, v.reliability, v.sticker_enabled, v.created_at,
  (SELECT count(*) FROM app.branches br WHERE br.venue_id = v.id AND br.active) AS branches,
  (SELECT count(*) FROM app.offers o WHERE o.venue_id = v.id AND o.status = 'active') AS offers_active
FROM app.venues v;--> statement-breakpoint

-- Ұсыныстар (жеңілдік % бірге)
CREATE OR REPLACE VIEW bi.offers AS
SELECT o.id AS offer_id, o.slug, o.title, v.id AS venue_id, v.name AS venue, o.kind::text AS kind, o.category,
  o.units, o.price, o.regular_unit_price, round(100 - 100.0 * o.price / nullif(o.units * o.regular_unit_price, 0), 1) AS discount_pct,
  round(o.price::numeric / nullif(o.units, 0)) AS unit_price, o.valid_days, o.status::text AS status, o.promoted, o.created_at
FROM app.offers o JOIN app.venues v ON v.id = o.venue_id;--> statement-breakpoint

-- Сатылған пакеттер (GMV): әр жол — бір пакет
CREATE OR REPLACE VIEW bi.packs AS
SELECT p.id AS pack_id, p.user_id, o.id AS offer_id, o.title AS offer, v.id AS venue_id, v.name AS venue, o.kind::text AS kind, o.category,
  p.source, p.status::text AS status, p.units_total, p.units_left, p.units_total - p.units_left AS units_used,
  round(100.0 * (p.units_total - p.units_left) / nullif(p.units_total, 0), 1) AS used_pct,
  p.price_paid, coalesce(p.value_total, p.price_paid) AS value_total, coalesce(v.fee_pct, v.auto_fee_pct, 10) AS fee_pct,
  round(p.price_paid * coalesce(v.fee_pct, v.auto_fee_pct, 10) / 100.0) AS fee_booked,
  p.created_at, (p.created_at AT TIME ZONE 'Asia/Almaty')::date AS day, date_trunc('week', p.created_at AT TIME ZONE 'Asia/Almaty')::date AS week,
  date_trunc('month', p.created_at AT TIME ZONE 'Asia/Almaty')::date AS month,
  extract(hour FROM p.created_at AT TIME ZONE 'Asia/Almaty')::int AS hour, extract(isodow FROM p.created_at AT TIME ZONE 'Asia/Almaty')::int AS weekday,
  p.valid_until, (p.off_peak IS NOT NULL) AS off_peak, p.auto_renew,
  (row_number() OVER (PARTITION BY p.user_id, (p.source = 'purchase') ORDER BY p.created_at) = 1 AND p.source = 'purchase') AS is_first_purchase,
  (p.valid_until > now() AND p.status = 'active' AND p.units_left > 0) AS is_active
FROM app.packs p JOIN app.offers o ON o.id = p.offer_id JOIN app.venues v ON v.id = o.venue_id
WHERE p.status <> 'pending_payment' AND p.source <> 'carry';--> statement-breakpoint

-- Қолдану (бірлік жұмсалды): кассадағы QR + тапсырыс. Табыс осы сәтте танылады.
CREATE OR REPLACE VIEW bi.uses AS
SELECT r.id AS use_id, 'scan' AS channel, r.pack_id, p.user_id, v.id AS venue_id, v.name AS venue, o.kind::text AS kind, r.branch_id,
  r.units::int AS units, coalesce(r.amount, 0) AS amount, coalesce(r.fee_pct, 0) AS fee_pct, round(coalesce(r.amount, 0) * coalesce(r.fee_pct, 0) / 100.0) AS revenue,
  r.created_at, (r.created_at AT TIME ZONE 'Asia/Almaty')::date AS day, date_trunc('week', r.created_at AT TIME ZONE 'Asia/Almaty')::date AS week,
  extract(hour FROM r.created_at AT TIME ZONE 'Asia/Almaty')::int AS hour, extract(isodow FROM r.created_at AT TIME ZONE 'Asia/Almaty')::int AS weekday,
  (r.cancelled_at IS NOT NULL) AS cancelled
FROM app.redemptions r JOIN app.packs p ON p.id = r.pack_id JOIN app.offers o ON o.id = p.offer_id JOIN app.venues v ON v.id = o.venue_id
UNION ALL
SELECT od.id, od.type::text, od.pack_id, od.user_id, v.id, v.name, o.kind::text, od.branch_id,
  1, coalesce(od.amount, 0), coalesce(od.fee_pct, 0), round(coalesce(od.amount, 0) * coalesce(od.fee_pct, 0) / 100.0),
  od.created_at, (od.created_at AT TIME ZONE 'Asia/Almaty')::date, date_trunc('week', od.created_at AT TIME ZONE 'Asia/Almaty')::date,
  extract(hour FROM od.created_at AT TIME ZONE 'Asia/Almaty')::int, extract(isodow FROM od.created_at AT TIME ZONE 'Asia/Almaty')::int,
  (od.status IN ('cancelled', 'failed'))
FROM app.orders od JOIN app.packs p ON p.id = od.pack_id JOIN app.offers o ON o.id = p.offer_id JOIN app.venues v ON v.id = o.venue_id;--> statement-breakpoint

-- Төлем әрекеттері (сәтті, сәтсіз, қайтару)
CREATE OR REPLACE VIEW bi.payments AS
SELECT pm.id AS payment_id, pm.user_id, pm.provider, pm.method, pm.amount, pm.status::text AS status, coalesce(pm.failure, '') AS failure,
  pm.refunded, coalesce(pm.refund_status, '') AS refund_status, pm.created_at, (pm.created_at AT TIME ZONE 'Asia/Almaty')::date AS day, pm.paid_at,
  extract(epoch FROM pm.paid_at - pm.created_at) AS seconds_to_pay
FROM app.payments pm;--> statement-breakpoint

-- Мини апп оқиғалары (ашу, көру, сатып алуды бастау, іздеу, бөлісу, сыйлық, сканер, қате)
CREATE OR REPLACE VIEW bi.events AS
SELECT e.id AS event_id, e.user_id, e.kind, e.ref,
  e.meta->>'sp' AS link_type, e.meta->>'platform' AS platform, e.meta->>'ver' AS app_version, e.meta->>'via' AS scan_type,
  CASE WHEN e.kind = 'search' THEN (e.meta->>'n')::int END AS results, e.meta->>'route' AS route,
  CASE WHEN e.kind = 'error' THEN left(e.meta->>'msg', 120) END AS error,
  e.created_at, (e.created_at AT TIME ZONE 'Asia/Almaty')::date AS day, extract(hour FROM e.created_at AT TIME ZONE 'Asia/Almaty')::int AS hour
FROM app.client_events e;--> statement-breakpoint

-- Күн сайынғы негізгі көрсеткіштер (бір жол — бір күн; бос күндер де бар)
CREATE OR REPLACE VIEW bi.daily AS
WITH g AS (SELECT generate_series(date '2026-11-01', (now() AT TIME ZONE 'Asia/Almaty')::date, interval '1 day')::date AS day)
SELECT g.day,
  (SELECT count(DISTINCT user_id) FROM app.client_events e WHERE e.kind = 'open' AND (e.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS dau,
  (SELECT count(*) FROM app.users u WHERE (u.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS new_users,
  (SELECT count(*) FROM bi.users u WHERE u.first_purchase_day = g.day) AS new_buyers,
  (SELECT coalesce(sum(price_paid), 0) FROM bi.packs p WHERE p.day = g.day AND p.price_paid > 0) AS gmv,
  (SELECT count(*) FROM bi.packs p WHERE p.day = g.day AND p.price_paid > 0) AS packs,
  (SELECT coalesce(sum(fee_booked), 0) FROM bi.packs p WHERE p.day = g.day) AS fee_booked,
  (SELECT coalesce(sum(units), 0) FROM bi.uses x WHERE x.day = g.day AND NOT x.cancelled) AS units_used,
  (SELECT coalesce(sum(revenue), 0) FROM bi.uses x WHERE x.day = g.day AND NOT x.cancelled) AS revenue,
  (SELECT count(*) FROM app.payments pm WHERE pm.status = 'failed' AND (pm.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS payments_failed,
  (SELECT count(*) FROM app.gifts gf WHERE (gf.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS gifts_sent,
  (SELECT count(*) FROM app.complaints c WHERE (c.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS complaints,
  (SELECT count(DISTINCT user_id) FROM app.client_events e WHERE e.kind = 'error' AND (e.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS error_users,
  (SELECT count(*) FROM app.client_events e WHERE e.kind = 'search' AND (e.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS searches,
  (SELECT count(*) FROM app.client_events e WHERE e.kind = 'view' AND (e.created_at AT TIME ZONE 'Asia/Almaty')::date = g.day) AS offer_views
FROM g;--> statement-breakpoint

-- Сатып алушы когорттары: алғаш сатып алған аптасы × неше аптадан кейін қайта алды
CREATE OR REPLACE VIEW bi.cohorts AS
WITH p AS (SELECT user_id, created_at FROM bi.packs WHERE source = 'purchase'),
  f AS (SELECT user_id, date_trunc('week', min(created_at) AT TIME ZONE 'Asia/Almaty')::date AS cohort_week FROM p GROUP BY user_id)
SELECT f.cohort_week, floor(extract(epoch FROM (date_trunc('week', p.created_at AT TIME ZONE 'Asia/Almaty') - f.cohort_week)) / 604800)::int AS weeks_after,
  count(DISTINCT p.user_id) AS buyers,
  (SELECT count(*) FROM f f2 WHERE f2.cohort_week = f.cohort_week) AS cohort_size
FROM f JOIN p ON p.user_id = f.user_id GROUP BY f.cohort_week, 2;--> statement-breakpoint

-- Күндік сурет (міндеттеме, белсенді пакеттер, мекемелер) — metrics_daily бағандарға жайылған
CREATE OR REPLACE VIEW bi.snapshots AS
SELECT day, (data->>'users')::int AS users, (data->>'buyers')::int AS buyers, (data->>'venues_active')::int AS venues_active,
  (data->>'offers_active')::int AS offers_active, (data->>'packs_active')::int AS packs_active, (data->>'units_outstanding')::int AS units_outstanding,
  (data->>'liability')::int AS liability, (data->>'bonus_liability')::int AS bonus_liability, (data->>'gmv_total')::int AS gmv_total
FROM app.metrics_daily;--> statement-breakpoint

CREATE OR REPLACE VIEW bi.price_log AS
SELECT l.offer_id, o.title AS offer, v.name AS venue, l.price, l.units, l.regular_unit_price,
  round(100 - 100.0 * l.price / nullif(l.units * l.regular_unit_price, 0), 1) AS discount_pct, l.status, l.created_at, (l.created_at AT TIME ZONE 'Asia/Almaty')::date AS day
FROM app.offer_price_log l JOIN app.offers o ON o.id = l.offer_id JOIN app.venues v ON v.id = o.venue_id;--> statement-breakpoint

CREATE OR REPLACE VIEW bi.finance AS
SELECT kind, category, amount, day, date_trunc('month', day)::date AS month, created_at FROM app.finance_entries;--> statement-breakpoint

CREATE OR REPLACE VIEW bi.gifts AS
SELECT g.id AS gift_id, g.from_user_id, g.to_user_id, g.status, g.anonymous, v.name AS venue, p.price_paid AS amount, g.created_at,
  (g.created_at AT TIME ZONE 'Asia/Almaty')::date AS day,
  EXISTS (SELECT 1 FROM bi.packs x WHERE x.user_id = g.to_user_id AND x.source = 'purchase' AND x.created_at > g.created_at) AS recipient_bought
FROM app.gifts g JOIN app.packs p ON p.id = g.pack_id JOIN app.offers o ON o.id = p.offer_id JOIN app.venues v ON v.id = o.venue_id;--> statement-breakpoint

-- Баға мен шағым (мәтінсіз)
CREATE OR REPLACE VIEW bi.ratings AS
SELECT r.venue_id, v.name AS venue, r.stars, (r.text IS NOT NULL AND r.text <> '') AS has_text, (r.reply IS NOT NULL) AS replied, r.created_at, (r.created_at AT TIME ZONE 'Asia/Almaty')::date AS day
FROM app.ratings r JOIN app.venues v ON v.id = r.venue_id;--> statement-breakpoint
CREATE OR REPLACE VIEW bi.complaints AS
SELECT c.venue_id, v.name AS venue, coalesce(c.reason, 'басқа') AS reason, c.status, c.created_at, (c.created_at AT TIME ZONE 'Asia/Almaty')::date AS day,
  extract(epoch FROM c.decided_at - c.created_at) / 3600 AS hours_to_decide
FROM app.complaints c JOIN app.venues v ON v.id = c.venue_id;--> statement-breakpoint

CREATE OR REPLACE VIEW bi.stickers AS
SELECT s.branch_id, b.address, v.name AS venue, s.created_at, (s.created_at AT TIME ZONE 'Asia/Almaty')::date AS day
FROM app.sticker_scans s JOIN app.branches b ON b.id = s.branch_id JOIN app.venues v ON v.id = b.venue_id;--> statement-breakpoint

-- Тек оқитын рөл: тек bi схемасы
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'looker_ro') THEN CREATE ROLE looker_ro NOLOGIN; END IF;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA bi TO looker_ro;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA bi TO looker_ro;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA bi GRANT SELECT ON TABLES TO looker_ro;--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM looker_ro;--> statement-breakpoint
-- Looker Studio кестелер тізімінде bi көріністері тікелей көрінуі үшін
ALTER ROLE looker_ro SET search_path = bi;
