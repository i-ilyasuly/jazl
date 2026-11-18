-- «Қайта шыққанда хабарла»: ұсыныс қайта сатылымға шыққанда бот хабарлайтын клиенттер тізімі
CREATE TABLE IF NOT EXISTS "app"."offer_waits" (
  "user_id" uuid NOT NULL REFERENCES "app"."users"("id"),
  "offer_id" uuid NOT NULL REFERENCES "app"."offers"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "offer_waits_pk" ON "app"."offer_waits" ("user_id","offer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offer_waits_offer" ON "app"."offer_waits" ("offer_id");
