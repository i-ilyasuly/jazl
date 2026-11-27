// Ұсыныстар каталогы (мини апппен бір API: GET /v1/catalog). Сайт құрастырылғанда алынады (беттің HTML-і толық болуы үшін),
// бет ашылғанда браузер қайта сұрап жаңартады (CORS: ALLOWED_ORIGINS-та сайт домені болса).
import { API_URL } from "./config";

export type SiteOffer = {
  slug: string; venue: string; kind: string; title: string; titleRu: string | null; units: number; unitName: string;
  price: number; oldPrice: number | null; off: number; validDays: number; photo: string | null;
};

type RawOffer = { slug: string; venueSlug: string; title: string; titleRu: string | null; kind: string; unitName: string; units: number; price: number; regularUnitPrice: number | null; validDays: number; status: string; photos: string[] | null };
type RawVenue = { slug: string; name: string };

/** Каталог жауабын сайт карточкасына айналдыру (браузердегі жаңартуда да осы логика — Offers.astro ішінде қайталанған) */
export function toSiteOffers(j: { offers: RawOffer[]; venues: RawVenue[] }): SiteOffer[] {
  const name = new Map(j.venues.map((v) => [v.slug, v.name]));
  return j.offers.filter((o) => o.status === "active").map((o) => {
    const old = o.regularUnitPrice ? o.regularUnitPrice * o.units : null;
    return {
      slug: o.slug, venue: name.get(o.venueSlug) ?? "", kind: o.kind, title: o.title.split(" · ")[0], titleRu: o.titleRu,
      units: o.units, unitName: o.unitName, price: o.price, oldPrice: old && old > o.price ? old : null,
      off: old && old > o.price ? Math.round((1 - o.price / old) * 100) : 0, validDays: o.validDays, photo: o.photos?.[0] ?? null,
    };
  });
}

export async function loadOffers(): Promise<SiteOffer[]> {
  try {
    const r = await fetch(`${API_URL}/v1/catalog`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return [];
    return toSiteOffers(await r.json());
  } catch {
    return [];
  }
}
