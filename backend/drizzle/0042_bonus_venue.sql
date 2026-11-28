-- Medeo бонусы «Ә» нұсқасы (Патша, 2026-11-28): жаңа пакеттің күйген бірлігінен келген бонус тек СОЛ мекемеде жұмсалады, мерзімі қысқа (settings.bonusVenueMonths, 3 ай).
-- Бұрын сатылған пакеттер ескі ережемен (кез келген мекеме, 12 ай) қалады: бар жолдар 'any', жаңалары әдепкі 'venue'.
ALTER TABLE "app"."packs" ADD COLUMN IF NOT EXISTS "bonus_scope" text NOT NULL DEFAULT 'any';--> statement-breakpoint
ALTER TABLE "app"."packs" ALTER COLUMN "bonus_scope" SET DEFAULT 'venue';--> statement-breakpoint
ALTER TABLE "app"."bonuses" ADD COLUMN IF NOT EXISTS "venue_id" uuid REFERENCES "app"."venues"("id");
