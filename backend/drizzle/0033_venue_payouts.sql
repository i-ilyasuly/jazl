-- Мекемеге ақша аудару есебі (Патша, 2026-11-23): бұрын мекеменің «Есеп» бетінде әр күн «Түсті» деп қатаң жазылатын —
-- нақты аударым тіркелмейтін. Енді Басқару әр аударымды (сомасы, қай кезең үшін, банк құжатының нөмірі) PIN-мен тіркейді,
-- мекеме «есептелді / аударылды / күтуде» деп нақты көреді.
CREATE TABLE IF NOT EXISTS "app"."venue_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "venue_id" uuid NOT NULL REFERENCES "app"."venues"("id"),
  "amount" integer NOT NULL CHECK ("amount" > 0),
  "period_from" date NOT NULL,
  "period_to" date NOT NULL,
  "paid_at" date NOT NULL DEFAULT (now() at time zone 'Asia/Almaty')::date,
  "ref" text,
  "note" text,
  "created_by" uuid REFERENCES "app"."users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CHECK ("period_from" <= "period_to")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_payouts_venue" ON "app"."venue_payouts" ("venue_id", "period_to");--> statement-breakpoint
CREATE OR REPLACE VIEW bi.payouts AS
  SELECT id, venue_id, amount, period_from, period_to, paid_at, created_at FROM app.venue_payouts;--> statement-breakpoint
GRANT SELECT ON bi.payouts TO looker_ro;
