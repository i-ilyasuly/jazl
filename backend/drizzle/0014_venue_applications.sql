CREATE TABLE "app"."venue_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"venue_id" uuid,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."venue_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."venue_applications" ADD CONSTRAINT "venue_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue_applications" ADD CONSTRAINT "venue_applications_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue_docs" ADD CONSTRAINT "venue_docs_application_id_venue_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."venue_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_applications_user" ON "app"."venue_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "venue_docs_app" ON "app"."venue_docs" USING btree ("application_id");