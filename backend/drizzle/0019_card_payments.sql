CREATE TABLE "app"."payment_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"token" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"exp_month" smallint NOT NULL,
	"exp_year" smallint NOT NULL,
	"holder" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "app"."payment_cards" ADD CONSTRAINT "payment_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_cards_token" ON "app"."payment_cards" USING btree ("provider","token");--> statement-breakpoint
CREATE INDEX "payment_cards_user" ON "app"."payment_cards" USING btree ("user_id");