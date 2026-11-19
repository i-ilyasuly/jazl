-- Автожаңарту сату лимитіне тірелсе — келесі айдың 1-інде қайта көреміз (тоқтатпаймыз)
ALTER TABLE "app"."packs" ADD COLUMN IF NOT EXISTS "renew_retry_at" timestamp with time zone;--> statement-breakpoint
-- Клиенттің қысқа кері байланысы (мыс. автожаңартуды неге өшірді)
CREATE TABLE IF NOT EXISTS "app"."feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "app"."users"("id"),
  "kind" text NOT NULL,
  "reason" text NOT NULL,
  "pack_id" uuid REFERENCES "app"."packs"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_kind" ON "app"."feedback" ("kind","created_at");
