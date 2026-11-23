-- Ақша алушы — заңды тұлға (Патша, 2026-11-23): франшиза желісінде әр филиал бөлек ЖШС/ЖК болуы мүмкін (өз шарты, БСН, IBAN).
-- Мекемеде бірнеше алушы; әр филиал біреуіне байланады (payee_id бос — мекеменің негізгі алушысы). Есеп пен аударым алушы бойынша.
CREATE TABLE IF NOT EXISTS "app"."venue_payees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "venue_id" uuid NOT NULL REFERENCES "app"."venues"("id"),
  "legal_name" text NOT NULL,
  "bin" text,
  "iban" text,
  "bank" text,
  "contract_no" text,
  "is_main" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_payees_venue" ON "app"."venue_payees" ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "venue_payees_main" ON "app"."venue_payees" ("venue_id") WHERE "is_main";--> statement-breakpoint
ALTER TABLE "app"."branches" ADD COLUMN IF NOT EXISTS "payee_id" uuid REFERENCES "app"."venue_payees"("id");--> statement-breakpoint
ALTER TABLE "app"."venue_payouts" ADD COLUMN IF NOT EXISTS "payee_id" uuid REFERENCES "app"."venue_payees"("id");--> statement-breakpoint
-- Бар мекемелер: мақұлданған өтінімнің деректерінен негізгі алушы
INSERT INTO "app"."venue_payees" ("venue_id", "legal_name", "bin", "iban", "is_main")
  SELECT DISTINCT ON (a.venue_id) a.venue_id, coalesce(nullif(a.data->>'legalName', ''), v.name), nullif(a.data->>'bin', ''), nullif(a.data->>'iban', ''), true
  FROM "app"."venue_applications" a JOIN "app"."venues" v ON v.id = a.venue_id
  WHERE a.status = 'approved' AND a.venue_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "app"."venue_payees" p WHERE p.venue_id = a.venue_id)
  ORDER BY a.venue_id, a.decided_at DESC NULLS LAST;
