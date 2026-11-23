// B1 · Каталог: мекемелер, филиалдар, ұсыныстар. Ашық (кірусіз) — сілтемемен бөліскенде де көрінуі үшін.
// Мини апп ашылғанда бір рет алады; жауап 60 секунд кэштеледі.
import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { branches, offers, venues } from "../db/schema.js";
import { getSettings } from "../settings.js";
import { limitsOf, soldThisMonth } from "../limits.js";

/** Клиентке көрінетін ережелер: «Тек жоспар бойынша» және бос сағат терезесі (қалғаны — ішкі) */
const rulesOut = (r: unknown, installmentOn: boolean) => {
  const x = (r ?? {}) as { planOnly?: boolean; offPeak?: unknown; installment?: number[] | null };
  // Бөліп төлеу — тек банк қосқанда (HALYK_INSTALLMENT=on): әйтпесе клиентке жоқ мүмкіндікті уәде етпейміз
  const inst = installmentOn && x.installment?.length ? { installment: x.installment } : {};
  const out = { ...(x.planOnly ? { planOnly: true, ...(x.offPeak ? { offPeak: x.offPeak } : {}) } : {}), ...inst };
  return Object.keys(out).length ? out : null;
};

export function catalogRoutes(db: Db, opts: { installment?: boolean } = {}) {
  const r = new Hono();
  r.get("/", async (c) => {
    const vs = await db.select().from(venues).where(eq(venues.status, "active")).orderBy(asc(venues.name));
    const vIds = vs.map((v) => v.id);
    const [bs, os] = vIds.length ? await Promise.all([
      db.select().from(branches).where(and(inArray(branches.venueId, vIds), eq(branches.active, true))),
      db.select().from(offers).where(and(inArray(offers.venueId, vIds), inArray(offers.status, ["active", "ended"]))).orderBy(desc(offers.promoted), asc(offers.createdAt)),
    ]) : [[], []];
    const slugOf = new Map(vs.map((v) => [v.id, v.slug]));
    const st = await getSettings(db);
    // Сату лимиті: «Қалды: 12 / 50» (айлық, 1-інде жаңарады); бір адамға шек — сатып алу парағында ескертіледі
    const month = await soldThisMonth(db, os.filter((o) => limitsOf(o.rules).monthlyLimit).map((o) => o.id));
    const limitOut = (o: (typeof os)[number]) => { const l = limitsOf(o.rules);
      return l.monthlyLimit || l.perUserLimit ? { monthly: l.monthlyLimit, left: l.monthlyLimit ? Math.max(0, l.monthlyLimit - (month.get(o.id) ?? 0)) : null, perUser: l.perUserLimit } : null; };
    // Сенімділік белгісі (venueScore.ts): тек жеткілікті дерек (≥ reliabilityMinN) және жоғары үлес (≥ reliabilityBadgeAt) болса
    const trust = (v: { reliability: number | null; reliabilityN: number }) => v.reliability != null && v.reliabilityN >= st.reliabilityMinN && v.reliability >= st.reliabilityBadgeAt ? v.reliability : null;
    c.header("Cache-Control", "public, max-age=30"); // «Қалды» санағы үшін қысқарақ
    return c.json({
      ok: true,
      venues: vs.map((v) => ({ slug: v.slug, name: v.name, kind: v.kind, city: v.city, rating: v.rating, reviewsCount: v.reviewsCount, acceptsPreorder: v.acceptsPreorder, about: v.about, trust: trust(v),
        branches: bs.filter((b) => b.venueId === v.id).map((b) => ({ id: b.id, address: b.address, lat: b.lat, lng: b.lng, hours: b.hours, allowsCourier: b.allowsCourier })) })),
      offers: os.map((o) => ({ slug: o.slug, venueSlug: slugOf.get(o.venueId), title: o.title, titleRu: o.titleRu, kind: o.kind, unitName: o.unitName, units: o.units, price: o.price,
        regularUnitPrice: o.regularUnitPrice, validDays: o.validDays, sizes: o.sizes, details: o.details, photos: o.photos, promoted: o.promoted, status: o.status, rules: rulesOut(o.rules, Boolean(opts.installment)), limit: limitOut(o), saleUntil: (o.rules as { saleUntil?: string | null } | null)?.saleUntil ?? null, createdAt: o.createdAt })),
    });
  });
  return r;
}
