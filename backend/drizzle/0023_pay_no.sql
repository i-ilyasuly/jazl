-- Төлемнің сандық нөмірі (Halyk ePay invoiceId: 6–15 цифр, соңғы 6 цифр бірегей). 100000001-ден басталады.
CREATE SEQUENCE IF NOT EXISTS "app"."pay_no_seq" START WITH 100000001;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN IF NOT EXISTS "no" bigint DEFAULT nextval('app.pay_no_seq') NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_no" ON "app"."payments" ("no");
