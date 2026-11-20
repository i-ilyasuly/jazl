-- Қауіпсіздік аудиті (2026-11-21): клиент PIN-і енді серверде тексеріледі — қате әрекет санағы, бұғаттау, биометрия кілтінің хэші
ALTER TABLE "app"."users" ADD COLUMN IF NOT EXISTS "pin_failed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN IF NOT EXISTS "pin_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN IF NOT EXISTS "bio_hash" text;
