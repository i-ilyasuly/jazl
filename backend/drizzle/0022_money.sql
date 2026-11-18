ALTER TABLE "app"."orders" ADD COLUMN "amount" integer;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "fee_pct" smallint;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD COLUMN "value_total" integer;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD COLUMN "off_peak" jsonb;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD COLUMN "auto_renew" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD COLUMN "auto_renew_card" uuid;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD COLUMN "auto_renew_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD COLUMN "renewed_to" uuid;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "refunded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "refund_status" text;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "refund_failure" text;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD COLUMN "amount" integer;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD COLUMN "fee_pct" smallint;--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN "auto_fee_pct" smallint;--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN "reliability" smallint;--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN "reliability_n" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Бағалау: бір пакетке бір баға. Бұрынғы қайталанған бағалардан тек ең соңғысы қалады, мекеме рейтингі қайта есептеледі.
DELETE FROM "app"."ratings" r USING "app"."ratings" n WHERE r.pack_id IS NOT NULL AND r.user_id = n.user_id AND r.pack_id = n.pack_id AND (r.created_at, r.id) < (n.created_at, n.id);--> statement-breakpoint
UPDATE "app"."venues" v SET rating = s.a, reviews_count = s.n FROM (SELECT venue_id, round(avg(stars)::numeric, 1)::float8 AS a, count(*)::int AS n FROM "app"."ratings" GROUP BY venue_id) s WHERE s.venue_id = v.id;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_user_pack" ON "app"."ratings" USING btree ("user_id","pack_id") WHERE pack_id is not null;--> statement-breakpoint
-- Пакеттің толық құны: бұрынғы пакеттерге — төленген баға + көшірілген бірліктердің ескі пакеттегі құны
UPDATE "app"."packs" SET "value_total" = "price_paid";--> statement-breakpoint
UPDATE "app"."packs" p SET "value_total" = p."price_paid" + c.v FROM (
  SELECT e.pack_id, sum(e.units_delta * (op.price_paid / greatest(op.units_total, 1)))::int AS v FROM "app"."pack_events" e
  JOIN "app"."packs" op ON op.id = (e.meta->>'fromPackId')::uuid WHERE e.type = 'carry_in' GROUP BY e.pack_id) c WHERE c.pack_id = p.id;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."packs_value_default"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.value_total IS NULL THEN NEW.value_total := NEW.price_paid; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "packs_value_default" ON "app"."packs";--> statement-breakpoint
CREATE TRIGGER "packs_value_default" BEFORE INSERT ON "app"."packs" FOR EACH ROW EXECUTE FUNCTION "app"."packs_value_default"();--> statement-breakpoint
-- Бұрынғы қолданулар мен тапсырыстарға сома мен комиссияны жазу (бұрынғы есеппен бірдей: бірлік бағасы × бірлік, мекеменің комиссиясы)
UPDATE "app"."redemptions" r SET "amount" = r.units * (p.value_total / greatest(p.units_total, 1)), "fee_pct" = coalesce(v.fee_pct, 10)
  FROM "app"."packs" p JOIN "app"."offers" o ON o.id = p.offer_id JOIN "app"."venues" v ON v.id = o.venue_id WHERE p.id = r.pack_id AND r.amount IS NULL;--> statement-breakpoint
UPDATE "app"."orders" od SET "amount" = p.value_total / greatest(p.units_total, 1), "fee_pct" = coalesce(v.fee_pct, 10)
  FROM "app"."packs" p JOIN "app"."offers" o ON o.id = p.offer_id JOIN "app"."venues" v ON v.id = o.venue_id WHERE p.id = od.pack_id AND od.amount IS NULL;
