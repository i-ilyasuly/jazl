-- Мекеме жапсырмасы (Патша, 2026-11-22): әр филиалға тұрақты қысқа код. QR ішінде — біздің сервердің сілтемесі …/b/<код>,
-- сервер оны қазір Telegram Mini App-қа, кейін қосымшаға бағыттайды — жапсырма ешқашан ауыстырылмайды.
-- venues.sticker_enabled — тұрақты жапсырма QR-ымен бірлік жұмсауға рұқсат (мекеме бойынша; әдепкіде өшірулі).
-- sticker_scans — әр сканерлеу (жеке дерек жоқ): филиал статистикасы үшін.
ALTER TABLE "app"."branches" ADD COLUMN IF NOT EXISTS "sticker_code" text;--> statement-breakpoint
UPDATE "app"."branches" SET "sticker_code" = upper(substr(md5(random()::text || "id"::text), 1, 6)) WHERE "sticker_code" IS NULL;--> statement-breakpoint
ALTER TABLE "app"."branches" ALTER COLUMN "sticker_code" SET DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "branches_sticker_code" ON "app"."branches" ("sticker_code");--> statement-breakpoint
ALTER TABLE "app"."venues" ADD COLUMN IF NOT EXISTS "sticker_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."sticker_scans" (
	"id" bigserial PRIMARY KEY,
	"branch_id" uuid NOT NULL REFERENCES "app"."branches"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sticker_scans_branch" ON "app"."sticker_scans" ("branch_id", "created_at");
