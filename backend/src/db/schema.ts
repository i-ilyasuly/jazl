// Jazl+ дерекқор құрылымы. Барлық кесте «app» схемасында — ескі боттың кестелеріне (public схема) тимейді,
// бір дерекқорда қатар тұра алады. Ақша — теңгемен бүтін сан (тиынсыз). Уақыт — timestamptz (UTC).
// Логикасы мен ID ережесі: Drive «14 Бэкенд логикасы».
import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, integer, jsonb, pgSchema, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const app = pgSchema("app");

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const kind = app.enum("kind", ["food", "coffee", "hair"]);
export const venueStatus = app.enum("venue_status", ["draft", "review", "active", "paused", "closed"]);
export const offerStatus = app.enum("offer_status", ["draft", "active", "paused", "ended"]);
export const packStatus = app.enum("pack_status", ["pending_payment", "active", "used", "expired", "refunded", "gifted"]);
export const orderType = app.enum("order_type", ["now", "plan"]);
export const orderStatus = app.enum("order_status", ["sent", "accepted", "ready", "done", "missed", "cancelled", "failed"]);
export const paymentStatus = app.enum("payment_status", ["created", "pending", "paid", "failed", "refunded"]);
export const staffRole = app.enum("staff_role", ["owner", "manager", "cashier"]);

/** Клиент (Telegram пайдаланушысы). Дербес дерек — 2-кезеңде Қазақстандағы дерекқорға көшеді. */
export const users = app.table("users", {
  id: id(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username"),
  photoUrl: text("photo_url"),
  lang: text("lang").notNull().default("kk"),
  city: text("city").notNull().default("karaganda"),
  phone: text("phone"),
  pinHash: text("pin_hash"),
  createdAt: created(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_telegram_id").on(t.telegramId)]);

export const venues = app.table("venues", {
  id: id(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  kind: kind("kind").notNull(),
  city: text("city").notNull(),
  about: text("about"),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  rating: doublePrecision("rating"),
  reviewsCount: integer("reviews_count").notNull().default(0),
  acceptsPreorder: boolean("accepts_preorder").notNull().default(true),
  status: venueStatus("status").notNull().default("draft"),
  createdAt: created(),
}, (t) => [uniqueIndex("venues_slug").on(t.slug)]);

export const branches = app.table("branches", {
  id: id(),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  address: text("address").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  /** {"mon":["09:00","22:00"], ...}; бос — 24/7 */
  hours: jsonb("hours"),
  phone: text("phone"),
  allowsCourier: boolean("allows_courier").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
}, (t) => [index("branches_venue").on(t.venueId)]);

/** Мекеменің персоналы: иесі, менеджер, кассир — мекеме бөлімі осы арқылы ашылады. */
export const venueStaff = app.table("venue_staff", {
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: staffRole("role").notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.venueId, t.userId] })]);

/** Ұсыныс (пакет үлгісі): мысалы «Тауық донері · 4 дана». */
export const offers = app.table("offers", {
  id: id(),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  kind: kind("kind").notNull(),
  unitName: text("unit_name").notNull(),
  units: smallint("units").notNull(),
  /** Пакет бағасы (₸) және бөлек сатып алғандағы бір бірлік бағасы (жеңілдікті есептеуге) */
  price: integer("price").notNull(),
  regularUnitPrice: integer("regular_unit_price").notNull(),
  validDays: smallint("valid_days").notNull().default(30),
  /** Басқа көлемдер: [{units, price}] */
  sizes: jsonb("sizes"),
  /** Сипаттама блоктары: includes, about, take, use (мини апптағы OfferDetails) */
  details: jsonb("details"),
  photos: text("photos").array().notNull().default(sql`'{}'::text[]`),
  promoted: boolean("promoted").notNull().default(false),
  status: offerStatus("status").notNull().default("draft"),
  createdAt: created(),
}, (t) => [uniqueIndex("offers_slug").on(t.slug), index("offers_venue").on(t.venueId)]);

/** Клиенттің пакеті. units_left өзгерісі тек транзакция ішінде (SELECT … FOR UPDATE) — екі рет жұмсалмайды. */
export const packs = app.table("packs", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  offerId: uuid("offer_id").notNull().references(() => offers.id),
  unitsTotal: smallint("units_total").notNull(),
  unitsLeft: smallint("units_left").notNull(),
  pricePaid: integer("price_paid").notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  status: packStatus("status").notNull().default("pending_payment"),
  /** purchase | gift | rebuy | carry */
  source: text("source").notNull().default("purchase"),
  createdAt: created(),
}, (t) => [index("packs_user").on(t.userId)]);

/** Пакет тарихы: сатып алу, пайдалану, көшу, ұзарту, қайтару — бәрі осында (мини апптағы «Пайдалану тарихы»). */
export const packEvents = app.table("pack_events", {
  id: id(),
  packId: uuid("pack_id").notNull().references(() => packs.id),
  type: text("type").notNull(),
  unitsDelta: smallint("units_delta").notNull().default(0),
  meta: jsonb("meta"),
  createdAt: created(),
}, (t) => [index("pack_events_pack").on(t.packId)]);

/** Тапсырыс (now — қазір) және жоспар/жазылу (plan — күн мен уақыт). Нөмірі адамға оқылатын, қайталанбайды. */
export const orders = app.table("orders", {
  id: id(),
  no: bigint("no", { mode: "number" }).notNull().generatedAlwaysAsIdentity({ startWith: 1000 }),
  type: orderType("type").notNull(),
  packId: uuid("pack_id").notNull().references(() => packs.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  /** Кассирге айтылатын 4 таңбалы код */
  code: text("code").notNull(),
  courier: boolean("courier").notNull().default(false),
  status: orderStatus("status").notNull().default("sent"),
  idempotencyKey: text("idempotency_key"),
  /** Кассир растаған сәт және кім растағаны */
  doneAt: timestamp("done_at", { withTimezone: true }),
  doneBy: uuid("done_by").references(() => users.id),
  createdAt: created(),
}, (t) => [uniqueIndex("orders_no").on(t.no), index("orders_branch_time").on(t.branchId, t.scheduledAt), uniqueIndex("orders_idem").on(t.userId, t.idempotencyKey)]);

/** Кассадағы QR арқылы бір бірлікті қолдану. */
export const redemptions = app.table("redemptions", {
  id: id(),
  packId: uuid("pack_id").notNull().references(() => packs.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  cashierId: uuid("cashier_id").references(() => users.id),
  bankRef: text("bank_ref"),
  /** Бір сканерлеуде неше бірлік (кассир енгізген не банк сомасынан есептелген) */
  units: smallint("units").notNull().default(1),
  idempotencyKey: text("idempotency_key"),
  createdAt: created(),
}, (t) => [index("redemptions_pack").on(t.packId), uniqueIndex("redemptions_idem").on(t.packId, t.idempotencyKey)]);

export const payments = app.table("payments", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  packId: uuid("pack_id").references(() => packs.id),
  provider: text("provider").notNull(),
  amount: integer("amount").notNull(),
  status: paymentStatus("status").notNull().default("created"),
  externalId: text("external_id"),
  /** Клиент таңдаған тәсіл: kaspi | card | test (сынақ режимінде провайдер — test) */
  method: text("method").notNull().default("test"),
  /** Қайталанған сұрау екінші рет төлем жасамауы үшін (клиент әр сатып алуға бір кілт жібереді) */
  idempotencyKey: text("idempotency_key"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [uniqueIndex("payments_external").on(t.provider, t.externalId), uniqueIndex("payments_idem").on(t.userId, t.idempotencyKey)]);

/** Чек. public — клиентке көрсетілетін бөлік; internal — тек біз үшін (комиссия, мекемеге төлем, құрылғы, баға көзі…).
 *  Чек өзгермейді: жазылған сәттегі деректердің суреті (мекеме атауы не баға кейін өзгерсе де чек сол күйі қалады). */
export const receipts = app.table("receipts", {
  id: id(),
  /** Адамға оқылатын нөмір: JZ-100001 */
  no: bigint("no", { mode: "number" }).notNull().generatedAlwaysAsIdentity({ startWith: 100001 }),
  /** purchase | use | order | refund | extend | gift */
  kind: text("kind").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id),
  packId: uuid("pack_id").references(() => packs.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  branchId: uuid("branch_id").references(() => branches.id),
  total: integer("total").notNull(),
  currency: text("currency").notNull().default("KZT"),
  public: jsonb("public").notNull(),
  internal: jsonb("internal").notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("receipts_no").on(t.no), index("receipts_user").on(t.userId)]);

export const gifts = app.table("gifts", {
  id: id(),
  packId: uuid("pack_id").notNull().references(() => packs.id),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id),
  toUserId: uuid("to_user_id").references(() => users.id),
  code: text("code").notNull(),
  message: text("message"),
  anonymous: boolean("anonymous").notNull().default(false),
  /** sent | accepted | returned | cancelled */
  status: text("status").notNull().default("sent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("gifts_code").on(t.code)]);

export const favorites = app.table("favorites", {
  userId: uuid("user_id").notNull().references(() => users.id),
  offerId: uuid("offer_id").notNull().references(() => offers.id),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.userId, t.offerId] })]);

export const venueFollows = app.table("venue_follows", {
  userId: uuid("user_id").notNull().references(() => users.id),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.userId, t.venueId] })]);

export const ratings = app.table("ratings", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  packId: uuid("pack_id").references(() => packs.id),
  stars: smallint("stars").notNull(),
  text: text("text"),
  createdAt: created(),
}, (t) => [index("ratings_venue").on(t.venueId)]);
