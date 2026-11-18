// Провайдерді таңдау: PAYMENTS_PROVIDER (әзірге тек test). Нақты провайдер қосу:
//   1) src/payments/<name>.ts — PaymentProvider-ды жүзеге асыру (charge, tokenize, webhook — қолтаңбаны міндетті тексеру);
//   2) config.ts: PAYMENTS_PROVIDER енумына қосу, кілттер — Secret Manager арқылы;
//   3) мини апп: src/pay/tokenize.ts — провайдердің JS-кітапханасымен криптограмма жасау (карта нөмірі серверге келмейді).
import type { Config } from "../config.js";
import type { PaymentProvider } from "./types.js";
import { testProvider } from "./test.js";

const cache = new WeakMap<Config, Map<string, PaymentProvider>>();
/** Аты бойынша провайдер (жоқ не бапталмаған болса — null). Ескі төлемнің қайтаруы мен вебхугы — СОЛ төлемнің провайдері арқылы:
 *  кейін басқа банкке ауыссақ та, бұрынғы төлемдер өз банкі арқылы қайтарылады (бұрын «provider_mismatch» болып қалатын). */
export function providerByName(cfg: Config, name: string): PaymentProvider | null {
  let m = cache.get(cfg);
  if (!m) { m = new Map(); cache.set(cfg, m); }
  if (!m.has(name)) {
    const p = name === "test" ? testProvider(cfg.BOT_TOKEN) : null;
    if (!p) return null;
    m.set(name, p);
  }
  return m.get(name)!;
}
/** Жаңа төлемдерге қолданылатын провайдер (PAYMENTS_PROVIDER) */
export function paymentProvider(cfg: Config): PaymentProvider {
  const p = providerByName(cfg, cfg.PAYMENTS_PROVIDER);
  if (!p) throw new Error("payments provider not configured: " + cfg.PAYMENTS_PROVIDER);
  return p;
}
export type { CardInfo, ChargeResult, FailReason, PaymentProvider, WebhookEvent } from "./types.js";
