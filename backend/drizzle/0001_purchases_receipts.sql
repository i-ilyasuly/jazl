CREATE TABLE "app"."receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" bigint GENERATED ALWAYS AS IDENTITY (sequence name "app"."receipts_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1),
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" uuid,
	"payment_id" uuid,
	"venue_id" uuid NOT NULL,
	"branch_id" uuid,
	"total" integer NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"public" jsonb NOT NULL,
	"internal" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "method" text DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "app"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_no" ON "app"."receipts" USING btree ("no");--> statement-breakpoint
CREATE INDEX "receipts_user" ON "app"."receipts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idem" ON "app"."payments" USING btree ("user_id","idempotency_key");