ALTER TABLE "app"."redemptions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD CONSTRAINT "redemptions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;