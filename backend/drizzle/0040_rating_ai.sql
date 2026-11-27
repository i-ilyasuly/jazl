-- Пікірдің Gemini тексерісі (Патша, 2026-11-27; 28-құжат): сайтқа тек «оң әрі таза» пікір шығады.
-- ai_status: pending — тексерілмеді; ok — жариялауға болады; negative — сын/наразылық; unsafe — балағат, жеке дерек, жарнама, спам;
-- error — Gemini жауап бермеді (кейін қайталанады); skip — тексеру қажет емес (мәтін жоқ не 1–3 жұлдыз)
ALTER TABLE "app"."ratings" ADD COLUMN IF NOT EXISTS "ai_status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "app"."ratings" ADD COLUMN IF NOT EXISTS "ai_confidence" real;
ALTER TABLE "app"."ratings" ADD COLUMN IF NOT EXISTS "ai_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "app"."ratings" ADD COLUMN IF NOT EXISTS "ai_checked_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "ratings_ai_status" ON "app"."ratings" ("ai_status");
