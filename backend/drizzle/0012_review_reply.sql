ALTER TABLE "app"."ratings" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "app"."ratings" ADD COLUMN "replied_at" timestamp with time zone;