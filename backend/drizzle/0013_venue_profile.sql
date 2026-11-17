ALTER TABLE "app"."venue_staff" ADD COLUMN "prefs" jsonb;--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN "gallery" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;