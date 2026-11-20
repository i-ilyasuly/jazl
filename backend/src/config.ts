// Орта айнымалылары. Құпиялар (BOT_TOKEN, DATABASE_URL) Cloud Run-да Secret Manager арқылы беріледі — кодқа/репоға жазылмайды.
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  /** Telegram бот токені — тек initData қолтаңбасын тексеруге */
  BOT_TOKEN: z.string().min(1),
  /** Қолтаңба кілті (src/secret.ts): Secret Manager medeo-app-secret, ұзындығы ≥ 32. Бот токенінен бөлек. */
  APP_SECRET: z.string().min(32).optional(),
  /** Өтпелі кезең: осы уақытқа дейін (ISO, мысалы 2026-11-23T00:00:00Z) ескі бот-токен қолтаңбалары да қабылданады */
  LEGACY_SIG_UNTIL: z.string().optional(),
  /** Мини апп басқа ботта ашылса (мысалы @Mmedeo_bot) — сол боттың токені. initData екеуінің кез келгенімен тексеріледі. */
  MINIAPP_BOT_TOKEN: z.string().optional(),
  /** Мини апп мекенжайлары (CORS), үтірмен: https://a.vercel.app,https://b.vercel.app */
  ALLOWED_ORIGINS: z.string().default(""),
  /** initData қанша уақыт жарамды (секунд). Telegram ұсынысы: қысқа ұстау. */
  INIT_DATA_TTL: z.coerce.number().default(6 * 3600), // аудит 2026-11-21: 24 сағ → 6 сағ (тарап кеткен initData бір тәулік емес, 6 сағ жарамды)
  /** Төлем режимі: test — ақша жүрмейді (Kaspi келісімі біткенше) */
  /** test — сынақ: Kaspi/сынақ әдісі ақшасыз «төленді», сынақ QR, сынақ құралдары (тек басқару иелеріне); live — нақты: тек банк арқылы (не толық бонуспен) */
  PAYMENTS_MODE: z.enum(["test", "live"]).default("test"),
  /** Карта төлемінің провайдері (src/payments): test — сынақ (ақша жүрмейді). Кейін: halyk | freedom | tiptop (шарт пен кілттер келгенде). */
  PAYMENTS_PROVIDER: z.enum(["test"]).default("test"),
  /** Halyk ePay (src/payments/halyk.ts): кілттер берілсе — «Банк картасы · Halyk» төлем тәсілі қосылады (банктің қорғалған беті).
   *  HALYK_ENV=test — банктің ашық сынақ ортасы (тек сынақ карталары, ақша жүрмейді). Кілттер — Secret Manager/орта айнымалысы, репоға емес. */
  HALYK_ENV: z.enum(["test", "prod"]).default("test"),
  HALYK_CLIENT_ID: z.string().optional(),
  HALYK_CLIENT_SECRET: z.string().optional(),
  HALYK_TERMINAL_ID: z.string().optional(),
  /** Medeo комиссиясы, % (ішкі есеп: мекемеге төленетін соманы есептеу) */
  MEDEO_FEE_PCT: z.coerce.number().default(10),
  /** Мини апп ашылатын бот (чектегі тексеру QR-ы: t.me/<бот>?startapp=rc_<нөмір>) */
  /** API-дің ашық мекенжайы (жүктеу сілтемелері үшін); жоқ болса — сұраудың host-ы */
  PUBLIC_URL: z.string().url().optional(),
  MINIAPP_BOT_USERNAME: z.string().default("Mmedeo_bot"),
  /** /support батырмасы апаратын жеке чат (Telegram username, @-сыз). Жоқ болса — мини апптағы «Мәселе туралы жазу» беті */
  /** Пакет картасы (Bot API 10.4 HTML widget) клиенттің жеке чатында: 1 — қосулы, 0 — өшірулі */
  PACK_CARDS: z.enum(["0", "1"]).default("1"),
  SUPPORT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{4,32}$/).optional(),
  DB_SSL: z.enum(["require", "disable"]).default("require"),
  /** Суреттер бакеті (Google Cloud Storage, жария оқу). Жоқ болса — MEDIA_DIR (жергілікті) не сурет жүктеу өшірулі */
  MEDIA_BUCKET: z.string().optional(),
  MEDIA_DIR: z.string().optional(),
  /** 1 — техникалық жұмыстар: API 503 «maintenance» қайтарады */
  /** Жоспарлы жұмыс кілті (Cloud Scheduler → POST /cron/tick, X-Cron-Key). Жоқ болса /cron өшірулі. Secret Manager: medeo-cron-key */
  CRON_KEY: z.string().min(16).optional(),
  /** Medeo Басқару: рұқсат етілген Telegram ID-лер, үтірмен (мысалы 123456789,987654321). Бос болса — Басқару ешкімге ашылмайды. */
  ADMIN_IDS: z.string().default(""),
  /** Басқарудың веб-мекенжайы (бот хабарламасындағы батырмалар осында апарады) */
  ADMIN_WEB_URL: z.string().url().default("https://miniapp-fkro.vercel.app"),
  MAINTENANCE: z.enum(["0", "1"]).default("0").transform((v) => v === "1"),
});

export type Config = z.infer<typeof Env>;
// Medeo. атауына ауысу: ескі JAZL_FEE_PCT айнымалысы да оқылады (Cloud Run-да бұрын қойылған болса)
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => Env.parse({ ...env, MEDEO_FEE_PCT: env.MEDEO_FEE_PCT ?? env.JAZL_FEE_PCT });

/** Сынақ құралдары (өзіңді мекеме иесі ету, өтінімді өзің мақұлдау): тек сынақ режимінде және тек басқару иелеріне (ADMIN_IDS).
 *  Автосынақтарда (NODE_ENV=test) — барлығына. Қауіпсіздік тексерісі, 2026-11-19: бұрын кез келген Telegram пайдаланушысына ашық болатын. */
export const devToolsFor = (cfg: Config, telegramId: number | string) =>
  cfg.PAYMENTS_MODE === "test" && (cfg.NODE_ENV === "test" || cfg.ADMIN_IDS.split(",").map((x) => x.trim()).filter(Boolean).includes(String(telegramId)));
