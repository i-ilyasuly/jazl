-- Пакет картасы (Bot API 10.4 HTML widget): клиенттің жеке чатындағы виджет хабарламасы және соңғы жіберілген күйі
ALTER TABLE "app"."packs" ADD COLUMN IF NOT EXISTS "widget_msg_id" integer;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD COLUMN IF NOT EXISTS "widget_state" text;
