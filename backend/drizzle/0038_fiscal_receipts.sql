-- Фискалдық чектер (ReKassa, 2026-11-27): төлем расталғанда сатылым чегі, ақша қайтарылғанда қайтару чегі кезекке қойылады.
-- status: pending | ok | offline | failed (дерек қатесі) | reconcile (жауап жоғалып, ауысым ауысты — қолмен салыстыру керек)
-- request_id — ReKassa X-Request-ID (ауысым ішінде қайталанудан қорғау). Бір төлемге бір сатылым чегі; әр қайтаруға жеке чек.
CREATE TABLE IF NOT EXISTS "app"."fiscal_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "app"."payments"("id"),
  "kind" text NOT NULL,
  "amount" integer NOT NULL,
  "title" text NOT NULL,
  "request_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_try_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ticket_id" bigint,
  "ticket_number" text,
  "qr_url" text,
  "shift_number" integer,
  "offline" boolean DEFAULT false NOT NULL,
  -- Жіберер алдындағы ауысым нөмірі және соңғы әрекеттің нәтижесі белгісіз бе (жауап жоғалды / процесс тоқтады)
  "sent_shift" integer,
  "last_unknown" boolean DEFAULT false NOT NULL,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_receipts_request" ON "app"."fiscal_receipts" ("request_id");
CREATE INDEX IF NOT EXISTS "fiscal_receipts_due" ON "app"."fiscal_receipts" ("status", "next_try_at");
CREATE INDEX IF NOT EXISTS "fiscal_receipts_payment" ON "app"."fiscal_receipts" ("payment_id");
