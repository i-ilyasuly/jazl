// Medeo дерекқор құрылымы. Барлық кесте «app» схемасында — ескі боттың кестелеріне (public схема) тимейді,
// бір дерекқорда қатар тұра алады. Ақша — теңгемен бүтін сан (тиынсыз). Уақыт — timestamptz (UTC).
// Логикасы мен ID ережесі: Drive «14 Бэкенд логикасы».
import { sql } from "drizzle-orm";
import { bigint, boolean, customType, doublePrecision, index, integer, jsonb, pgSchema, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const app = pgSchema("app");

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const kind = app.enum("kind", ["food", "coffee", "hair"]);
export const venueStatus = app.enum("venue_status", ["draft", "review", "active", "paused", "closed"]);
export const offerStatus = app.enum("offer_status", ["draft", "review", "active", "paused", "ended"]);
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
  /** Клиенттің бот хабарландыру баптаулары (Figma «Хабарландырулар»): { expiry, rating, offers, promo } */
  notify: jsonb("notify"),
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
  /** Figma «Мекеме профилі»: фото галерея және санат белгілері (Тағам, Донер, Фастфуд) */
  gallery: text("gallery").array().notNull().default(sql`'{}'::text[]`),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  status: venueStatus("status").notNull().default("draft"),
  /** Medeo мекемені тоқтатса — себебі (Figma «Мекеме уақытша тоқтатылды») */
  statusNote: text("status_note"),
  /** Medeo комиссиясы, % (Figma «Комиссия»: 10 — негізгі, 8 — жоғары рейтинг). null — әдепкі (MEDEO_FEE_PCT) */
  feePct: smallint("fee_pct"),
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
  /** Figma «07 · Филиалдар»: 24/7, уақытша жабу (дейін, себебі), мереке/ерекше күндер [{ name, from, to, closed, open?, close? }] */
  is247: boolean("is_247").notNull().default(false),
  closedUntil: timestamp("closed_until", { withTimezone: true }),
  closedReason: text("closed_reason"),
  holidays: jsonb("holidays"),
  createdAt: created(),
}, (t) => [index("branches_venue").on(t.venueId)]);

/** Мекеменің персоналы: иесі, менеджер, кассир — мекеме бөлімі осы арқылы ашылады. */
export const venueStaff = app.table("venue_staff", {
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: staffRole("role").notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
  /** Қызметкердің баптаулары (Figma «Баптаулар»): хабарландырулар, кассир режиміне PIN */
  prefs: jsonb("prefs"),
  /** pending — шақыру кодымен кірді, иесі әлі растамады (Figma «Кассир: растау күтілуде»); active — жұмыс істейді */
  status: text("status").notNull().default("active"),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.venueId, t.userId] })]);

/** Кассир шақыру коды (Figma «Кассир шақыру»): 6 таңбалы, 24 сағат, бірнеше кассир қолдана алады; әр кірген — иесінің растауын күтеді. */
export const staffInvites = app.table("staff_invites", {
  code: text("code").primaryKey(),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  role: staffRole("role").notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  usedBy: uuid("used_by").references(() => users.id),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
}, (t) => [index("staff_invites_venue").on(t.venueId)]);

/** Ұсыныс (пакет үлгісі): мысалы «Тауық донері · 4 дана». */
export const offers = app.table("offers", {
  id: id(),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  /** Атаудың орысша нұсқасы (тек атауы, «· 4 дана»-сыз): мекеме ұсыныс жариялағанда екі тілде жазады (Патша, 2026-11-18) */
  titleRu: text("title_ru"),
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
  /** Мекеме ішіндегі санат (Figma «Ұсыныс құру: негізгі»: Донер, Бургер, Шаурма, Кофе, Басқа) */
  category: text("category"),
  /** Ережелер (Figma «Мерзім және ережелер»): { carry, extend, preorder, branches: string[] | null (null — барлығы) } */
  rules: jsonb("rules"),
  promoted: boolean("promoted").notNull().default(false),
  status: offerStatus("status").notNull().default("draft"),
  /** Medeo тексерушісінің ескертуі (Figma «Ұсыныс: түзету сұралды»): { text, field, at } */
  reviewNote: jsonb("review_note"),
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
  /** Мекеменің бір реттік тегін ұзартуы пайдаланылды ма (B4) */
  freeExtendUsed: boolean("free_extend_used").notNull().default(false),
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
  /** Кассир 10 минут ішінде бас тартса (қате мекеме/дана) — бірлік пакетке қайтады */
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by").references(() => users.id),
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
  /** Сатып алудың мазмұны (ұсыныс, көлем, сыйлық, көшіру, клиент деректері): төлем кейін (вебхук, 3-D Secure) расталғанда пакет осыдан жасалады */
  meta: jsonb("meta"),
  /** Сақталған карта (payment_cards), карта арқылы төленсе */
  cardId: uuid("card_id"),
  /** Сәтсіз төлемнің себебі (провайдерден): declined, insufficient_funds, 3ds_failed… */
  failure: text("failure"),
  createdAt: created(),
}, (t) => [uniqueIndex("payments_external").on(t.provider, t.externalId), uniqueIndex("payments_idem").on(t.userId, t.idempotencyKey)]);

/** Medeo бонусы (Патша, 2026-11-17): мерзімі өтіп, көшірілмеген бірліктің құны мекемеге емес, клиентке бонус болып қайтады.
 *  Бір пакет — бір бонус (pack_id бірегей). Жұмсау: ескісінен бастап left азаяды; мерзімі (expires_at) өткені есептелмейді. */
export const bonuses = app.table("bonuses", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  /** breakage — күйген бірлік; manual — Басқару берген */
  kind: text("kind").notNull().default("breakage"),
  amount: integer("amount").notNull(),
  left: integer("left").notNull(),
  packId: uuid("pack_id").references(() => packs.id),
  units: smallint("units").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
}, (t) => [index("bonuses_user").on(t.userId, t.expiresAt), uniqueIndex("bonuses_pack").on(t.packId)]);

/** Сақталған карта (Figma «Төлем / Карта қосу (Telegram нативті)»): карта деректері бізде ЕШҚАШАН сақталмайды —
 *  тек провайдердің токені, бренді, соңғы 4 цифры және мерзімі (PCI DSS талабы). */
export const paymentCards = app.table("payment_cards", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  token: text("token").notNull(),
  brand: text("brand").notNull(),
  last4: text("last4").notNull(),
  expMonth: smallint("exp_month").notNull(),
  expYear: smallint("exp_year").notNull(),
  holder: text("holder"),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [uniqueIndex("payment_cards_token").on(t.provider, t.token), index("payment_cards_user").on(t.userId)]);

/** Чек. public — клиентке көрсетілетін бөлік; internal — тек біз үшін (комиссия, мекемеге төлем, құрылғы, баға көзі…).
 *  Чек өзгермейді: жазылған сәттегі деректердің суреті (мекеме атауы не баға кейін өзгерсе де чек сол күйі қалады). */
export const receipts = app.table("receipts", {
  id: id(),
  /** Адамға оқылатын нөмір: MD-100001 (бұрын JZ-) */
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
  /** Жіберуші алушыны көрсетсе (@username) — тек сол адам қабылдай алады */
  toUsername: text("to_username"),
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
  /** Мекеменің жауабы (Figma «Пікірге жауап») — барлық клиентке көрінеді */
  reply: text("reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("ratings_venue").on(t.venueId)]);

/** Кассир шығарған төлем QR-ы (Figma «Кассир: QR шығару»): пакет (ұсыныс) + дана + кассада бөлек төленетін қосымша.
 *  Патша (2026-11-17): QR суреті де, 4 таңбалы код та әр 30 с бірге жаңарады (code_exp); сеанс кассир экраны ашық тұрғанда 10 минут.
 *  Бір сеанс — бір рет қана төленеді (redemption_id). */
export const qrSessions = app.table("qr_sessions", {
  id: id(),
  code: text("code").notNull(),
  /** Ағымдағы QR суреті мен кодтың мерзімі (30 с); өткен соң кассир экраны жаңасын алады */
  codeExp: timestamp("code_exp", { withTimezone: true }).notNull().defaultNow(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  offerId: uuid("offer_id").references(() => offers.id),
  units: smallint("units").notNull(),
  extra: integer("extra").notNull().default(0),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  redemptionId: uuid("redemption_id").references(() => redemptions.id),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
}, (t) => [index("qr_sessions_code").on(t.code, t.expiresAt)]);

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** Мекемені тіркеу өтінімі (Figma «02 · Тіркелу», «03 · Өтінім күйі»). Әр қадам data-ға сақталады (кейін жалғастыруға болады).
 *  status: draft → review → (need_info | rejected | approved). Мақұлданса — venues, branches, venue_staff(owner) жасалады. */
export const venueApplications = app.table("venue_applications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("draft"),
  data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
  /** Medeo командасының ескертуі (қосымша ақпарат не бас тарту себебі) */
  note: text("note"),
  venueId: uuid("venue_id").references(() => venues.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("venue_applications_user").on(t.userId)]);

/** Тіркеу құжаттары (БСН анықтамасы, жеке куәлік, жарғы, халал) — жеке дерек: ашық бакетке емес, дерекқорда жабық сақталады. */
export const venueDocs = app.table("venue_docs", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => venueApplications.id),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: created(),
}, (t) => [index("venue_docs_app").on(t.applicationId)]);

/** Клиенттің шағымы (Figma «16 · Шағым: клиенттен түсті»): мекеме 24 сағат ішінде жауап береді — қайтару не қайтармау.
 *  status: new → refunded | rejected. Қайтаруда байланысты қолдану (redemption) жойылып, бірлік пакетке оралады. */
export const complaints = app.table("complaints", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  packId: uuid("pack_id").notNull().references(() => packs.id),
  redemptionId: uuid("redemption_id").references(() => redemptions.id),
  reason: text("reason"),
  text: text("text").notNull(),
  status: text("status").notNull().default("new"),
  reply: text("reply"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("complaints_venue").on(t.venueId, t.status)]);

/** Бот хабарламаларының журналы (notify.ts): кілт бойынша бір рет жіберу — күндік қорытынды, мерзім ескертуі, өтінім нәтижесі қайталанбайды. */
export const notifyLog = app.table("notify_log", {
  key: text("key").primaryKey(),
  createdAt: created(),
});

/** Medeo Басқару (Figma «Medeo Басқару» 14060:7998): кіру — ADMIN_IDS тізіміндегі Telegram аккаунты + жеке PIN.
 *  PIN 3 рет қате болса — 15 минутқа бұғатталады. */
export const admins = app.table("admins", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  pinHash: text("pin_hash"),
  failed: smallint("failed").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** Figma «18 · Хабарлама баптаулары»: шұғыл / күнделікті / тыныш уақыт */
  prefs: jsonb("prefs"),
  createdAt: created(),
});

/** Өзгерістер журналы (Figma «Өзгерістер журналы»): өшірілмейді, өзгертілмейді. */
export const adminLog = app.table("admin_log", {
  id: id(),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  /** Адамға оқылатын нысан: «Dämdi Doner · 10% → 8%» */
  target: text("target").notNull(),
  meta: jsonb("meta"),
  createdAt: created(),
}, (t) => [index("admin_log_time").on(t.createdAt)]);

/** Мекеме туралы ішкі жазбалар (Figma «Ішкі жазбалар»): тек Басқару командасы көреді. */
export const venueNotes = app.table("venue_notes", {
  id: id(),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: created(),
}, (t) => [index("venue_notes_venue").on(t.venueId)]);

/** Платформа баптаулары (Figma «Бизнес-ережелер», «Техникалық жұмыстар»): кілт → мән */
export const settings = app.table("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
