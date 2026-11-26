-- Пікір белгілері (Патша, 2026-11-26): «Тазалық», «Қызмет» т.б. бөлек сақталады — ұсыныс бетінде чип болып көрінеді
ALTER TABLE "app"."ratings" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
