-- Мекеме тәуекелі (Патша, 2026-11-28; 31-құжат Ж3–Ж5, 32-құжат): айлық табыс (міндеттеме шегі үшін), Басқару қолмен қойған шек,
-- ай сайынғы «Medeo клиенті пакетсіз де қайта келді ме» сұрауы.
ALTER TABLE "app"."venues" ADD COLUMN IF NOT EXISTS "monthly_revenue" integer;--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN IF NOT EXISTS "liability_cap" integer;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."venue_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "venue_id" uuid NOT NULL REFERENCES "app"."venues"("id"),
  "user_id" uuid REFERENCES "app"."users"("id"),
  "month" text NOT NULL,
  "answer" text,
  "asked_at" timestamptz NOT NULL DEFAULT now(),
  "answered_at" timestamptz
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "venue_feedback_month" ON "app"."venue_feedback" ("venue_id", "month");
