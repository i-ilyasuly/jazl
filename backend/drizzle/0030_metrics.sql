-- Метрикалар үшін дерек жинау (Патша, 2026-11-22): «кейін басынан жинауымыз керек еді деп өкінбейтіндей».
-- 1) Клиент қайдан келді (бірінші ашқандағы start_param), 2) ұсыныс бағасының тарихы, 3) күндік сурет (кейін қайта есептеуге
-- болмайтын қор көрсеткіштері), 4) шығын, маркетинг, касса (CAC, burn, runway үшін қолмен енгізіледі).
ALTER TABLE "app"."users" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN IF NOT EXISTS "source_ref" text;--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN IF NOT EXISTS "first_platform" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created" ON "app"."users" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."offer_price_log" (
  "id" bigserial PRIMARY KEY,
  "offer_id" uuid NOT NULL REFERENCES "app"."offers"("id") ON DELETE CASCADE,
  "price" integer NOT NULL,
  "units" smallint NOT NULL,
  "regular_unit_price" integer NOT NULL,
  "sizes" jsonb,
  "status" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offer_price_log_offer" ON "app"."offer_price_log" ("offer_id", "created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."log_offer_price"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.price IS DISTINCT FROM OLD.price OR NEW.units IS DISTINCT FROM OLD.units
     OR NEW.regular_unit_price IS DISTINCT FROM OLD.regular_unit_price OR NEW.sizes IS DISTINCT FROM OLD.sizes OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO app.offer_price_log (offer_id, price, units, regular_unit_price, sizes, status) VALUES (NEW.id, NEW.price, NEW.units, NEW.regular_unit_price, NEW.sizes, NEW.status::text);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "offers_price_log" ON "app"."offers";--> statement-breakpoint
CREATE TRIGGER "offers_price_log" AFTER INSERT OR UPDATE ON "app"."offers" FOR EACH ROW EXECUTE FUNCTION "app"."log_offer_price"();--> statement-breakpoint
-- Бар ұсыныстардың бүгінгі күйі — тарихтың басы
INSERT INTO "app"."offer_price_log" (offer_id, price, units, regular_unit_price, sizes, status, created_at)
  SELECT id, price, units, regular_unit_price, sizes, status::text, created_at FROM "app"."offers" o
  WHERE NOT EXISTS (SELECT 1 FROM "app"."offer_price_log" l WHERE l.offer_id = o.id);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."metrics_daily" (
  "day" date PRIMARY KEY,
  "data" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."finance_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL,
  "category" text NOT NULL,
  "amount" integer NOT NULL,
  "day" date NOT NULL,
  "note" text,
  "created_by" uuid REFERENCES "app"."users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_entries_day" ON "app"."finance_entries" ("kind", "day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_events_ref" ON "app"."client_events" ("kind", "ref");
