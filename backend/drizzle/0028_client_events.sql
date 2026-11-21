-- Пилот көрсеткіштері мен қолданба қателері (Патша, 2026-11-21): ашу, ұсынысты көру, сатып алуды бастау, қате.
-- Жеке дерек сақталмайды: тек ішкі user_id, оқиға түрі, ұсыныс slug-ы және қысқа техникалық мәлімет. 180 күннен соң өшіріледі.
CREATE TABLE IF NOT EXISTS "app"."client_events" (
	"id" bigserial PRIMARY KEY,
	"user_id" uuid REFERENCES "app"."users"("id"),
	"kind" text NOT NULL,
	"ref" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_events_kind" ON "app"."client_events" ("kind", "created_at");
