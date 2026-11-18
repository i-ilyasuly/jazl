// Орта айнымалылары. Құпиялар (BOT_TOKEN, DATABASE_URL) Cloud Run-да Secret Manager арқылы беріледі — кодқа/репоға жазылмайды.
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  /** Telegram бот токені — тек initData қолтаңбасын тексеруге */
  BOT_TOKEN: z.string().min(1),
  /** Мини апп басқа ботта ашылса (мысалы @Mmedeo_bot) — сол боттың токені. initData екеуінің кез келгенімен тексеріледі. */
  MINIAPP_BOT_TOKEN: z.string().optional(),
  /** Мини апп мекенжайлары (CORS), үтірмен: https://a.vercel.app,https://b.vercel.app */
  ALLOWED_ORIGINS: z.string().default(""),
  /** initData қанша уақыт жарамды (секунд). Telegram ұсынысы: қысқа ұстау. */
  INIT_DATA_TTL: z.coerce.number().default(24 * 3600),
  /** Төлем режимі: test — ақша жүрмейді (Kaspi келісімі біткенше) */
  PAYMENTS_MODE: z.enum(["test"]).default("test"),
  /** Карта төлемінің провайдері (src/payments): test — сынақ (ақша жүрмейді). Кейін: halyk | freedom | tiptop (шарт пен кілттер келгенде). */
  PAYMENTS_PROVIDER: z.enum(["test"]).default("test"),
  /** Medeo комиссиясы, % (ішкі есеп: мекемеге төленетін соманы есептеу) */
  MEDEO_FEE_PCT: z.coerce.number().default(10),
  /** Мини апп ашылатын бот (чектегі тексеру QR-ы: t.me/<бот>?startapp=rc_<нөмір>) */
  /** API-дің ашық мекенжайы (жүктеу сілтемелері үшін); жоқ болса — сұраудың host-ы */
  PUBLIC_URL: z.string().url().optional(),
  MINIAPP_BOT_USERNAME: z.string().default("Mmedeo_bot"),
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
