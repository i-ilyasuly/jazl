// B1 · Каталог: мекемелер, филиалдар, ұсыныстар. Ашық (кірусіз) — сілтемемен бөліскенде де көрінуі үшін.
// Мини апп ашылғанда бір рет алады; жауап 60 секунд кэштеледі.
import { Hono } from "hono";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { branches, offers, venues } from "../db/schema.js";
import { getSettings } from "../settings.js";
import { limitsOf, soldThisMonth } from "../limits.js";

/** Клиентке көрінетін ережелер: «Тек жоспар бойынша» және бос сағат терезесі (қалғаны — ішкі) */
const rulesOut = (r: unknown, installmentOn: boolean) => {
  const x = (r ?? {}) as { planOnly?: boolean; offPeak?: unknown; installment?: number[] | null };
  // Бөліп төлеу: Патша (2026-11-24) — пилотқа дейін интерфейсте көрінеді. Пилот алдында банк қоспаса — HALYK_INSTALLMENT
  // сияқты шартпен жасыру керек (installmentOn). Төлем бетіне жіберу бәрібір тек HALYK_INSTALLMENT=on болғанда.
  void installmentOn;
  const inst = x.installment?.length ? { installment: x.installment } : {};
  const out = { ...(x.planOnly ? { planOnly: true, ...(x.offPeak ? { offPeak: x.offPeak } : {}) } : {}), ...inst };
  return Object.keys(out).length ? out : null;
};

export function catalogRoutes(db: Db, opts: { installment?: boolean } = {}) {
  const r = new Hono();
  // Ұсыныс бетіндегі пікірлер (Патша, 2026-11-26): тірі — клиенттер қойған жұлдыз, белгілер, мәтін, мекеме жауабы.
  // Аты — «Аты Ж.» ғана (тегі толық көрсетілмейді). Мәтінсіз баға да тізімде («5 жұлдыз қойды» — мини апп жазады).
  r.get("/reviews", async (c) => {
    const slug = c.req.query("offer") ?? "";
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return c.json({ ok: false, error: "bad_request" }, 400);
    const rows = (await db.execute(sql`select r.stars::int as stars, r.tags, r.text, r.reply, r.created_at, u.first_name, u.last_name
      from app.ratings r join app.packs p on p.id = r.pack_id join app.offers o on o.id = p.offer_id join app.users u on u.id = r.user_id
      where o.slug = ${slug} order by r.created_at desc limit 50`)).rows as { stars: number; tags: string[] | null; text: string | null; reply: string | null; created_at: Date; first_name: string | null; last_name: string | null }[];
    const [agg] = (await db.execute(sql`select count(*)::int as n, round(avg(r.stars)::numeric, 1)::float as a from app.ratings r join app.packs p on p.id = r.pack_id join app.offers o on o.id = p.offer_id where o.slug = ${slug}`)).rows as { n: number; a: number | null }[];
    c.header("Cache-Control", "public, max-age=20");
    return c.json({ ok: true, count: agg?.n ?? 0, avg: agg?.a ?? null, reviews: rows.map((x) => ({ name: [x.first_name?.trim() || "Клиент", x.last_name?.trim() ? x.last_name.trim()[0] + "." : ""].filter(Boolean).join(" "),
      stars: x.stars, tags: x.tags ?? [], text: x.text, reply: x.reply, at: x.created_at })) });
  });
  // Сайттағы «Пікірді тек сатып алғандар қалдырады» блогы (28-құжат, 2026-11-27): мини апптағы нақты пікірлер.
  // Сайтқа тек 4–5 жұлдыз және мәтіні барлары шығады (жаман пікір мини апптың ұсыныс бетінде көрінеді, сайтта — жоқ).
  // Жалпы баға мен сан — БАРЛЫҚ бағаның шынайы орташасы. Gemini «оң әрі таза» тексерісі әлі қосылмаған.
  r.get("/site-reviews", async (c) => {
    const rows = (await db.execute(sql`select r.stars::int as stars, r.text, r.created_at, u.first_name, u.last_name, v.name as venue, v.kind::text as kind
      from app.ratings r join app.users u on u.id = r.user_id join app.venues v on v.id = r.venue_id
      where r.stars >= 4 and char_length(btrim(coalesce(r.text, ''))) >= 10
      order by r.created_at desc limit 12`)).rows as { stars: number; text: string; created_at: Date; first_name: string | null; last_name: string | null; venue: string; kind: string }[];
    const [agg] = (await db.execute(sql`select count(*)::int as n, round(avg(stars)::numeric, 1)::float as a from app.ratings`)).rows as { n: number; a: number | null }[];
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ ok: true, count: agg?.n ?? 0, avg: agg?.a ?? null, reviews: rows.map((x) => ({
      name: [x.first_name?.trim() || "Клиент", x.last_name?.trim() ? x.last_name.trim()[0] + "." : ""].filter(Boolean).join(" "),
      stars: x.stars, text: x.text.trim().slice(0, 280), venue: x.venue, kind: x.kind, at: x.created_at })) });
  });
  r.get("/", async (c) => {
    const vs = await db.select().from(venues).where(eq(venues.status, "active")).orderBy(asc(venues.name));
    const vIds = vs.map((v) => v.id);
    const [bs, os] = vIds.length ? await Promise.all([
      db.select().from(branches).where(and(inArray(branches.venueId, vIds), eq(branches.active, true))),
      db.select().from(offers).where(and(inArray(offers.venueId, vIds), inArray(offers.status, ["active", "ended"]))).orderBy(desc(offers.promoted), asc(offers.createdAt)),
    ]) : [[], []];
    const slugOf = new Map(vs.map((v) => [v.id, v.slug]));
    // Әлеуметтік дәлел (Патша, 2026-11-24): осы уақытқа дейін сатылған пакет саны және қазір белсенді пакеттер (бірлігі бар, мерзімі өтпеген)
    const counts = new Map<string, { sold: number; active: number }>();
    if (os.length) for (const x of (await db.execute(sql`select offer_id, count(*) filter (where status not in ('pending_payment','refunded') and source <> 'carry')::int as sold,
        count(*) filter (where status = 'active' and units_left > 0 and valid_until > now())::int as active
      from app.packs where offer_id in (${sql.join(os.map((o) => sql`${o.id}`), sql`, `)}) group by offer_id`)).rows as { offer_id: string; sold: number; active: number }[]) counts.set(x.offer_id, { sold: x.sold, active: x.active });
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
      offers: os.map((o) => ({ slug: o.slug, venueSlug: slugOf.get(o.venueId), title: o.title, titleRu: o.titleRu, category: o.category, kind: o.kind, unitName: o.unitName, units: o.units, price: o.price,
        regularUnitPrice: o.regularUnitPrice, validDays: o.validDays, sizes: o.sizes, details: o.details, photos: o.photos, promoted: o.promoted, status: o.status, rules: rulesOut(o.rules, Boolean(opts.installment)), stats: counts.get(o.id) ?? { sold: 0, active: 0 }, limit: limitOut(o), saleUntil: (o.rules as { saleUntil?: string | null } | null)?.saleUntil ?? null, createdAt: o.createdAt })),
    });
  });
  return r;
}
