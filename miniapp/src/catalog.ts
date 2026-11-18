// B1 · Каталогты серверден алу. Мини апп ашылғанда бір рет /v1/catalog шақырылады да, келген деректер
// үлгі тізімдерге (mocks/offers.ts) жазылады: баға, атау, бірлік, фото — енді серверден. Беттердің коды өзгермейді.
// Сервер 1,5 секундта жауап бермесе — қосымша үлгі деректермен ашылады (күту жоқ).
import { getLang, locTitle, locUnit } from "./i18n";
import { ruOf } from "./i18n/products";
import { api } from "./api";
import { categoryOffers, endedOffers, moreOffers, offers, type Offer, type OfferKind } from "./mocks/offers";
import { venues } from "./mocks/venues";

interface SrvVenue { slug: string; name: string; kind: OfferKind; rating: number | null; reviewsCount: number; trust?: number | null; branches: { id: string; address: string }[] }
interface SrvOffer { slug: string; venueSlug: string; title: string; titleRu?: string | null; kind: OfferKind; unitName: string; units: number; price: number; regularUnitPrice: number; photos: string[]; status: "active" | "ended"; details: { buyers?: number; promo?: "hot" | "top" | null; deadline?: string | null; about?: unknown; aboutRu?: unknown } | null; rules?: { planOnly?: boolean; offPeak?: { days: number[]; from: string; to: string; pct: number } } | null; sizes?: { units: number; price: number }[] | null }

export const catalogState: { source: "mock" | "server"; venues: number; offers: number; error?: string; ms?: number; branches: { venue: string; slug: string; branchId: string; address: string }[] } = { source: "mock", venues: 0, offers: 0, branches: [] };

export async function loadCatalog() {
  const t0 = performance.now();
  try {
    const j = await api<{ venues: SrvVenue[]; offers: SrvOffer[] }>("/v1/catalog", {}, 4000);
    const vName = new Map(j.venues.map((v) => [v.slug, v.name]));
    for (const v of j.venues) { const m = venues.find((x) => x.id === v.slug); if (m) { m.name = v.name; m.rating = v.rating ?? m.rating; m.reviews = v.reviewsCount; m.trust = v.trust ?? null; m.address = v.branches[0]?.address ?? m.address; } }
    const lists = [offers, moreOffers, categoryOffers, endedOffers];
    for (const o of j.offers) {
      const patch: Partial<Offer> = { // Орысша: мекеме жазған орысша атау (жоқ болса — өнім сөздігінен, i18n/products.ts) + сервердің «· 4 дана» бөлігі орысшаланады («Куриный донер · 4 шт.»)
        title: locTitle(getLang() === "ru" && (o.titleRu ?? ruOf(o.title.split(" · ")[0])) ? (o.titleRu ?? ruOf(o.title.split(" · ")[0])) + (/ · \d+ \S+$/.exec(o.title)?.[0] ?? "") : o.title), unitWord: locUnit(o.unitName), units: o.units, price: o.price, oldPrice: o.regularUnitPrice * o.units, kind: o.kind, venue: vName.get(o.venueSlug) ?? "", photo: o.photos[0] };
      if (o.details?.buyers !== undefined) patch.buyers = o.details.buyers;
      // Мекеменің өз сипаттамасы клиенттің тілінде (орысшасы жоқ ескі ұсыныста — қазақшасы)
      const about = getLang() === "ru" && typeof o.details?.aboutRu === "string" && o.details.aboutRu.trim() ? o.details.aboutRu : o.details?.about;
      if (typeof about === "string" && about.trim()) patch.about = about; // ескі (seed) ұсыныстарда сипаттама мәтін емес — онда санат үлгісі қалады
      // Бірнеше көлем (4 / 8 / 12 дана): карточкада «6 000 ₸-дан», ұсыныс бетінде таңдау
      if (o.sizes && o.sizes.length > 1) patch.sizes = o.sizes.map((x) => ({ units: x.units, price: x.price, oldPrice: o.regularUnitPrice * x.units }));
      if (o.rules?.planOnly) patch.planOnly = true;
      if (o.rules?.offPeak) patch.offPeak = o.rules.offPeak;
      const found = lists.flatMap((l) => l).find((x) => x.id === o.slug);
      if (found) Object.assign(found, patch);
      else (o.status === "ended" ? endedOffers : moreOffers).push({ id: o.slug, distance: "", favorite: false, rating: 0, ratingCount: 0, address: "", hours: "", buyers: 0, ...patch } as Offer);
    }
    Object.assign(catalogState, { source: "server", venues: j.venues.length, offers: j.offers.length, ms: Math.round(performance.now() - t0), error: undefined,
      branches: j.venues.flatMap((v) => v.branches.map((b) => ({ venue: v.name, slug: v.slug, branchId: b.id, address: b.address }))) });
  } catch (e) {
    Object.assign(catalogState, { source: "mock", error: (e as Error).message, ms: Math.round(performance.now() - t0) });
  }
}
