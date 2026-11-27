-- Пилот өлшеуі (Патша, 2026-11-27; founder-skill кеңесінің шарты): пакет алушы бұл мекемеге Medeo-ға дейін барды ма.
-- Клиентке бір мекемедегі БІРІНШІ пакетінен кейін ботта бір сұрақ: n — алғаш рет, s — кейде, r — жиі. Каннибализацияны (жеңілдік тек тұрақтыларға кетіп жатыр ма) өлшейді.
ALTER TABLE "app"."packs" ADD COLUMN IF NOT EXISTS "prior_visit" text;
ALTER TABLE "app"."packs" ADD COLUMN IF NOT EXISTS "prior_asked_at" timestamp with time zone;
