CREATE TABLE "app"."qr_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"offer_id" uuid,
	"units" smallint NOT NULL,
	"extra" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"redemption_id" uuid,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."venue_staff" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."qr_sessions" ADD CONSTRAINT "qr_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."qr_sessions" ADD CONSTRAINT "qr_sessions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "app"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."qr_sessions" ADD CONSTRAINT "qr_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."qr_sessions" ADD CONSTRAINT "qr_sessions_redemption_id_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "app"."redemptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_sessions_code" ON "app"."qr_sessions" USING btree ("code","expires_at");