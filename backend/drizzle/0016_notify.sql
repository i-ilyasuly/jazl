CREATE TABLE "app"."notify_log" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN "notify" jsonb;