// B1 · Каталог: мекемелер, филиалдар, ұсыныстар. Ашық (кірусіз) — сілтемемен бөліскенде де көрінуі үшін.
// Мини апп ашылғанда бір рет алады; жауап 60 секунд кэштеледі.
import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { branches, offers, venues } from "../db/schema.js";

export function catalogRoutes(db: Db) {
  const r = new Hono();
  r.get("/", async (c) => {
    const vs = await db.select().from(venues).where(eq(venues.status, "active")).orderBy(asc(venues.name));
    const vIds = vs.map((v) => v.id);
    const [bs, os] = vIds.length ? await Promise.all([
      db.select().from(branches).where(and(inArray(branches.venueId, vIds), eq(branches.active, true))),
      db.select().from(offers).where(and(inArray(offers.venueId, vIds), inArray(offers.status, ["active", "ended"]))).orderBy(desc(offers.promoted), asc(offers.createdAt)),
    ]) : [[], []];
    const slugOf = new Map(vs.map((v) => [v.id, v.slug]));
    c.header("Cache-Control", "public, max-age=60");
    return c.json({
      ok: true,
      venues: vs.map((v) => ({ slug: v.slug, name: v.name, kind: v.kind, city: v.city, rating: v.rating, reviewsCount: v.reviewsCount, acceptsPreorder: v.acceptsPreorder, about: v.about,
        branches: bs.filter((b) => b.venueId === v.id).map((b) => ({ id: b.id, address: b.address, lat: b.lat, lng: b.lng, hours: b.hours, allowsCourier: b.allowsCourier })) })),
      offers: os.map((o) => ({ slug: o.slug, venueSlug: slugOf.get(o.venueId), title: o.title, kind: o.kind, unitName: o.unitName, units: o.units, price: o.price,
        regularUnitPrice: o.regularUnitPrice, validDays: o.validDays, sizes: o.sizes, details: o.details, photos: o.photos, promoted: o.promoted, status: o.status })),
    });
  });
  return r;
}
