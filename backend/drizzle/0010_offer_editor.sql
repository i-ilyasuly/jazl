ALTER TYPE "app"."offer_status" ADD VALUE 'review' BEFORE 'active';--> statement-breakpoint
ALTER TABLE "app"."offers" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "app"."offers" ADD COLUMN "rules" jsonb;