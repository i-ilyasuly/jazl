CREATE TABLE "app"."complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"redemption_id" uuid,
	"reason" text,
	"text" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reply" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."offers" ADD COLUMN "review_note" jsonb;--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "app"."complaints" ADD CONSTRAINT "complaints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."complaints" ADD CONSTRAINT "complaints_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."complaints" ADD CONSTRAINT "complaints_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."complaints" ADD CONSTRAINT "complaints_redemption_id_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "app"."redemptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."complaints" ADD CONSTRAINT "complaints_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaints_venue" ON "app"."complaints" USING btree ("venue_id","status");