// Орта айнымалылары. Құпиялар (BOT_TOKEN, DATABASE_URL) Cloud Run-да Secret Manager арқылы беріледі — кодқа/репоға жазылмайды.
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  /** Telegram бот токені — тек initData қолтаңбасын тексеруге */
  BOT_TOKEN: z.string().min(1),
  /** Мини апп басқа ботта ашылса (мысалы @oylarbot) — сол боттың токені. initData екеуінің кез келгенімен тексеріледі. */
  MINIAPP_BOT_TOKEN: z.string().optional(),
  /** Мини апп мекенжайлары (CORS), үтірмен: https://a.vercel.app,https://b.vercel.app */
  ALLOWED_ORIGINS: z.string().default(""),
  /** initData қанша уақыт жарамды (секунд). Telegram ұсынысы: қысқа ұстау. */
  INIT_DATA_TTL: z.coerce.number().default(24 * 3600),
  /** Төлем режимі: test — ақша жүрмейді (Kaspi келісімі біткенше) */
  PAYMENTS_MODE: z.enum(["test"]).default("test"),
  /** Jazl комиссиясы, % (ішкі есеп: мекемеге төленетін соманы есептеу) */
  JAZL_FEE_PCT: z.coerce.number().default(10),
  DB_SSL: z.enum(["require", "disable"]).default("require"),
});

export type Config = z.infer<typeof Env>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => Env.parse(env);
