-- Сайттағы «Өтінім қалдырыңыз» формасы (2026-11-27): мекеме иесінің байланысы. Medeo хабарласып, 15 минутта көрсетеді.
-- Толық тіркеу (БСН, құжаттар) — бұрынғыдай мини апптағы venue_applications.
CREATE TABLE IF NOT EXISTS "app"."site_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" serial NOT NULL,
	"venue" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"pos" text,
	"lang" text DEFAULT 'kk' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "site_leads_created" ON "app"."site_leads" ("created_at");
