ALTER TABLE "app"."orders" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "done_by" uuid;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idem" ON "app"."orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_idem" ON "app"."redemptions" USING btree ("pack_id","idempotency_key");