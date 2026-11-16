// Мини апптағы үлгі деректерден (miniapp/src/mocks) бастапқы каталогты (seed/catalog.json) жасайды.
// Іске қосу: npx tsx scripts/build-seed.ts. Нақты мекемелер қосылғанда бұл файл қажет болмайды.
import { writeFileSync } from "node:fs";
import { offers, moreOffers, categoryOffers, endedOffers, detailsOf, type Offer } from "../../miniapp/src/mocks/offers";
import { venues, lngLat } from "../../miniapp/src/mocks/venues";
import { galleryOf } from "../../miniapp/src/mocks/photos";

const hours = (h: string) => { const [a, b] = h.split("–"); return { daily: [a, b] }; };
const vOut = venues.map((v) => {
  const [lng, lat] = lngLat(v);
  return { slug: v.id, name: v.name, kind: v.kind, city: "karaganda", rating: v.rating, reviewsCount: v.reviews, acceptsPreorder: v.status !== "nopay",
    branches: [{ address: v.address, lat: +lat.toFixed(6), lng: +lng.toFixed(6), hours: hours(v.hours), allowsCourier: v.kind === "food" }] };
});
const venueSlug = (name: string) => venues.find((v) => v.name === name)?.id;
const all: [Offer, string][] = [...offers, ...moreOffers, ...categoryOffers].map((o) => [o, "active"] as [Offer, string]).concat(endedOffers.map((o) => [o, "ended"]));
const seen = new Set<string>();
const oOut = all.filter(([o]) => !seen.has(o.id) && seen.add(o.id)).map(([o, status]) => {
  const d = detailsOf(o);
  const slug = venueSlug(o.venue); if (!slug) throw new Error("мекеме табылмады: " + o.venue);
  return { slug: o.id, venueSlug: slug, title: o.title, kind: o.kind, unitName: o.unitWord, units: o.units, price: o.price,
    regularUnitPrice: Math.round(o.oldPrice / o.units), validDays: d.days ?? 30,
    sizes: o.sizes ?? null, details: { take: d.take, use: d.use, includes: d.includes, about: d.about, duration: d.duration ?? null, service: d.service ?? null, buyers: o.buyers, promo: o.promo ?? null, deadline: o.deadline ?? null },
    photos: galleryOf(o.id, o.kind), promoted: Boolean(o.promo), status };
});
writeFileSync(new URL("../seed/catalog.json", import.meta.url), JSON.stringify({ venues: vOut, offers: oOut }, null, 1));
console.log(`seed: ${vOut.length} мекеме, ${oOut.length} ұсыныс`);
