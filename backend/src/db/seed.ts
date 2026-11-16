// Бастапқы каталогты (seed/catalog.json) дерекқорға жазады. Қайта іске қосуға болады: slug бойынша жаңартады, екі еселемейді.
// Іске қосу: node dist/db/seed.js (Cloud Run job) немесе npm run db:seed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config.js";
import { createDb, type Db } from "./client.js";
import { branches, offers, venues } from "./schema.js";

type Kind = "food" | "coffee" | "hair";
interface SeedVenue { slug: string; name: string; kind: Kind; city: string; rating: number; reviewsCount: number; acceptsPreorder: boolean; branches: { address: string; lat: number; lng: number; hours: unknown; allowsCourier: boolean }[] }
interface SeedOffer { slug: string; venueSlug: string; title: string; kind: Kind; unitName: string; units: number; price: number; regularUnitPrice: number; validDays: number; sizes: unknown; details: unknown; photos: string[]; promoted: boolean; status: "active" | "ended" }

export async function seedCatalog(db: Db, file = fileURLToPath(new URL("../../seed/catalog.json", import.meta.url))) {
  const data = JSON.parse(readFileSync(file, "utf8")) as { venues: SeedVenue[]; offers: SeedOffer[] };
  const ids = new Map<string, string>();
  await db.transaction(async (tx) => {
    for (const v of data.venues) {
      const row = { slug: v.slug, name: v.name, kind: v.kind, city: v.city, rating: v.rating, reviewsCount: v.reviewsCount, acceptsPreorder: v.acceptsPreorder, status: "active" as const };
      const [saved] = await tx.insert(venues).values(row).onConflictDoUpdate({ target: venues.slug, set: row }).returning({ id: venues.id });
      ids.set(v.slug, saved.id);
      const existing = await tx.select({ id: branches.id }).from(branches).where(eq(branches.venueId, saved.id)).limit(1);
      const b = v.branches[0];
      if (existing.length) await tx.update(branches).set({ ...b }).where(eq(branches.id, existing[0].id));
      else await tx.insert(branches).values({ venueId: saved.id, ...b });
    }
    for (const o of data.offers) {
      const venueId = ids.get(o.venueSlug); if (!venueId) throw new Error("seed: мекеме жоқ " + o.venueSlug);
      const { venueSlug: _v, ...rest } = o;
      const row = { ...rest, venueId };
      await tx.insert(offers).values(row).onConflictDoUpdate({ target: offers.slug, set: row });
    }
  });
  return { venues: data.venues.length, offers: data.offers.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  const { db, pool } = createDb(cfg);
  const r = await seedCatalog(db);
  await pool.end();
  console.log(`seed: ${r.venues} мекеме, ${r.offers} ұсыныс`);
}
