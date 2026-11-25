// B1 · Каталогты серверден алу. Мини апп ашылғанда бір рет /v1/catalog шақырылады да, келген деректер
// үлгі тізімдерге (mocks/offers.ts) жазылады: баға, атау, бірлік, фото — енді серверден. Беттердің коды өзгермейді.
// Сервер 1,5 секундта жауап бермесе — қосымша үлгі деректермен ашылады (күту жоқ).
import { getLang, locTitle, locUnit } from "./i18n";
import { ruOf } from "./i18n/products";
import { api } from "./api";
import { catBoth } from "./categories";
import { categoryOffers, endedOffers, moreOffers, offers, type Offer, type OfferKind } from "./mocks/offers";
import { venues } from "./mocks/venues";

interface SrvVenue { slug: string; name: string; kind: OfferKind; rating: number | null; reviewsCount: number; trust?: number | null; branches: { id: string; address: string }[] }
interface SrvOffer { slug: string; venueSlug: string; title: string; titleRu?: string | null; kind: OfferKind; unitName: string; units: number; price: number; regularUnitPrice: number; photos: string[]; status: "active" | "ended"; details: { buyers?: number; promo?: "hot" | "top" | null; deadline?: string | null; about?: unknown; aboutRu?: unknown; composition?: string | null; compositionRu?: string | null; packName?: string | null; packNameRu?: string | null; bonus?: string | null; bonusRu?: string | null; perk?: string | null; perkRu?: string | null; portion?: Offer["portion"] | null; keywords?: string[] | null } | null; category?: string | null; limit?: Offer["limit"]; saleUntil?: string | null; createdAt?: string; rules?: { planOnly?: boolean; offPeak?: { days: number[]; from: string; to: string; pct: number }; installment?: number[] } | null; sizes?: { units: number; price: number }[] | null; stats?: { sold: number; active: number } }

export const catalogState: { source: "mock" | "cache" | "server"; venues: number; offers: number; error?: string; ms?: number; branches: { venue: string; slug: string; branchId: string; address: string }[] } = { source: "mock", venues: 0, offers: 0, branches: [] };

type Catalog = { venues: SrvVenue[]; offers: SrvOffer[] };
// Патша (2026-11-21): соңғы каталог телефонда сақталады. Келесі ашылғанда бірден сол көрінеді (үлгі деректер
// жыпылықтамайды), жаңасы серверден фонда келіп, үстінен жазылады.
const KEY = "medeo_catalog_v1";
function readCache(): Catalog | null { try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as Catalog) : null; } catch { return null; } }
function writeCache(j: Catalog) { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch { /* орын жоқ / жеке терезе */ } }

export async function loadCatalog() {
  const t0 = performance.now();
  try {
    const j = await api<Catalog>("/v1/catalog", {}, 4000);
    applyCatalog(j, t0, "server");
    writeCache(j);
  } catch (e) {
    Object.assign(catalogState, { source: catalogState.source === "cache" ? "cache" : "mock", error: (e as Error).message, ms: Math.round(performance.now() - t0) });
  }
}

function applyCatalog(j: Catalog, t0: number, source: "cache" | "server") {
  {
    const vName = new Map(j.venues.map((v) => [v.slug, v.name]));
    for (const v of j.venues) { const m = venues.find((x) => x.id === v.slug); if (m) { m.name = v.name; m.rating = v.rating ?? m.rating; m.reviews = v.reviewsCount; m.trust = v.trust ?? null; m.address = v.branches[0]?.address ?? m.address; } }
    const lists = [offers, moreOffers, categoryOffers, endedOffers];
    for (const o of j.offers) {
      const patch: Partial<Offer> = { // Орысша: мекеме жазған орысша атау (жоқ болса — өнім сөздігінен, i18n/products.ts) + сервердің «· 4 дана» бөлігі орысшаланады («Куриный донер · 4 шт.»)
        title: locTitle(getLang() === "ru" && (o.titleRu ?? ruOf(o.title.split(" · ")[0])) ? (o.titleRu ?? ruOf(o.title.split(" · ")[0])) + (/ · \d+ \S+$/.exec(o.title)?.[0] ?? "") : o.title), unitWord: locUnit(o.unitName), units: o.units, price: o.price, oldPrice: o.regularUnitPrice * o.units, kind: o.kind, venue: vName.get(o.venueSlug) ?? "", photo: o.photos[0] };
      if (o.details?.buyers !== undefined) patch.buyers = o.details.buyers;
      // Нақты санақ (сервер): сатылған пакеттер және қазір белсенділер — үлгі сандардың орнына
      if (o.stats) { patch.buyers = o.stats.sold; patch.active = o.stats.active; }
      // Мекеменің өз сипаттамасы клиенттің тілінде (орысшасы жоқ ескі ұсыныста — қазақшасы)
      const about = getLang() === "ru" && typeof o.details?.aboutRu === "string" && o.details.aboutRu.trim() ? o.details.aboutRu : o.details?.about;
      if (typeof about === "string" && about.trim()) patch.about = about; // ескі (seed) ұсыныстарда сипаттама мәтін емес — онда санат үлгісі қалады
      // Бірнеше көлем (4 / 8 / 12 дана): карточкада «6 000 ₸-дан», ұсыныс бетінде таңдау
      if (o.sizes && o.sizes.length > 1) patch.sizes = o.sizes.map((x) => ({ units: x.units, price: x.price, oldPrice: o.regularUnitPrice * x.units }));
      // Құрамы (клиент тілінде; орысшасы жоқ болса — қазақшасы) және порциясы
      const comp = getLang() === "ru" && o.details?.compositionRu?.trim() ? o.details.compositionRu : o.details?.composition;
      if (comp?.trim()) patch.composition = comp;
      if (o.details?.portion) patch.portion = o.details.portion;
      const pn = getLang() === "ru" && o.details?.packNameRu?.trim() ? o.details.packNameRu : o.details?.packName;
      patch.packName = pn?.trim() || undefined;
      // Іздеу екі тілде де табуы үшін (Патша, 2026-11-25): «Тойымды», «суши», «ролл»
      const both = (...xs: (string | null | undefined)[]) => xs.filter((x): x is string => Boolean(x?.trim())).join(" ");
      patch.idx = { name: both(o.details?.packName, o.details?.packNameRu), title: both(o.title.split(" · ")[0], o.titleRu, ruOf(o.title.split(" · ")[0])),
        cat: both(catBoth(o.category), ...(o.details?.keywords ?? [])), comp: both(o.details?.composition, o.details?.compositionRu), venue: vName.get(o.venueSlug) ?? "" };
      const loc = (kk?: string | null, ru?: string | null) => ((getLang() === "ru" && ru?.trim() ? ru : kk)?.trim() || undefined);
      patch.bonus = loc(o.details?.bonus, o.details?.bonusRu); patch.perk = loc(o.details?.perk, o.details?.perkRu);
      // Сатылым соңы: 7 күннен аз қалса карточкада шынайы мерзім белгісі («2 күн қалды» — енді нақты деректен)
      patch.saleUntil = o.saleUntil ?? null;
      if (o.createdAt) patch.createdAt = o.createdAt;
      patch.deadline = undefined; // үлгі деректегі «2 күн қалды» нақты мерзімсіз көрсетілмейді
      if (o.saleUntil) { const days = Math.round((Date.parse(o.saleUntil) - Date.parse(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }))) / 86400000); /* күнтізбелік күн (Алматы) */ if (days >= 0 && days <= 7) patch.deadline = days === 0 ? "Бүгін соңғы күн" : `${days} күн қалды`; }
      patch.limit = o.limit ?? null;
      if (o.rules?.planOnly) patch.planOnly = true;
      if (o.rules?.offPeak) patch.offPeak = o.rules.offPeak;
      // Пилотқа дейін (Патша, 2026-11-24): мекеме қоспаса да үлгі деректегі бөліп төлеу көрініп тұрады — дизайнды көру үшін.
      // Пилот алдында: `else patch.installment = undefined` қосу керек (badges.ts-тегі DEMO сияқты)
      if (o.rules?.installment?.length) patch.installment = o.rules.installment;
      const found = lists.flatMap((l) => l).find((x) => x.id === o.slug);
      if (found) Object.assign(found, patch);
      else (o.status === "ended" ? endedOffers : moreOffers).push({ id: o.slug, distance: "", favorite: false, rating: 0, ratingCount: 0, address: "", hours: "", buyers: 0, ...patch } as Offer);
    }
    Object.assign(catalogState, { source, venues: j.venues.length, offers: j.offers.length, ms: Math.round(performance.now() - t0), error: undefined,
      branches: j.venues.flatMap((v) => v.branches.map((b) => ({ venue: v.name, slug: v.slug, branchId: b.id, address: b.address }))) });
  }
}

// Модуль жүктелгенде (React салынбай тұрып) сақталған каталогты бірден қолданамыз
{ const c = readCache(); if (c) { try { applyCatalog(c, performance.now(), "cache"); } catch { /* ескі пішім — елемейміз */ } } }
