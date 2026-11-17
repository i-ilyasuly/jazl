CREATE TABLE "app"."bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'breakage' NOT NULL,
	"amount" integer NOT NULL,
	"left" integer NOT NULL,
	"pack_id" uuid,
	"units" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."bonuses" ADD CONSTRAINT "bonuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bonuses" ADD CONSTRAINT "bonuses_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bonuses_user" ON "app"."bonuses" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bonuses_pack" ON "app"."bonuses" USING btree ("pack_id");