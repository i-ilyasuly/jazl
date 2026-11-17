ALTER TABLE "app"."branches" ADD COLUMN "is_247" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD COLUMN "closed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD COLUMN "closed_reason" text;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD COLUMN "holidays" jsonb;