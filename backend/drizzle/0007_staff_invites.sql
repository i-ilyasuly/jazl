CREATE TABLE "app"."staff_invites" (
	"code" text PRIMARY KEY NOT NULL,
	"venue_id" uuid NOT NULL,
	"role" "app"."staff_role" NOT NULL,
	"branch_id" uuid,
	"created_by" uuid NOT NULL,
	"used_by" uuid,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."staff_invites" ADD CONSTRAINT "staff_invites_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."staff_invites" ADD CONSTRAINT "staff_invites_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."staff_invites" ADD CONSTRAINT "staff_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."staff_invites" ADD CONSTRAINT "staff_invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_invites_venue" ON "app"."staff_invites" USING btree ("venue_id");